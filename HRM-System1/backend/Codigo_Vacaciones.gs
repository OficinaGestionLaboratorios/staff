// ============================================================
// CODIGO_VACACIONES.GS — Módulo Vacaciones (backend)
// ============================================================
// Reutiliza lo que ya expone Codigo_corregido.gs (mismo proyecto de
// Apps Script → mismo espacio global): getSpreadsheet(),
// createJsonResponse(), registrarAuditoria(), parseFechaLocal(),
// formatearFechaSoloDia(), getCodeParam(). No se duplica nada de eso
// aquí, igual que hace el resto de módulos (Sobretiempo, Permisos).
//
// Mismo patrón de DOS FASES que Codigo_Sobretiempo.gs:
//   FASE 1 "Registrar período vacacional" -> una fila en
//   BD_VACACIONES con el saldo asignado (normalmente 30 días) y la
//   fecha límite de goce. Reemplaza el registro manual que antes se
//   llevaba en el Excel "OF DE GESTION DE LABORATORIOS".
//   FASE 2 "Registrar goce" -> cada salida de vacaciones agrega un
//   tramo {fechaInicio, fechaFin, dias, observacion} al arreglo
//   GOCES (guardado como JSON en una sola celda, igual que DIAS_JSON
//   en Horarios). Se puede llamar varias veces por período hasta
//   agotar el saldo.
//
// DIAS_TOMADOS, DIAS_PENDIENTES y ESTADO NUNCA se guardan: se
// calculan siempre al leer, a partir de DIAS_ASIGNADOS + GOCES +
// FECHA_LIMITE, para que jamás queden desactualizados (mismo
// criterio que ESTADO en Horarios).
//
// CAMBIO: se agregó la columna DNI (entre OBSERVACION y GOCES_JSON)
// para que el documento de solicitud (Word) pueda completarse sin
// depender de que el empleado siga "seleccionado" en el frontend o
// de la caché de Personal. Se coloca justo ANTES de GOCES_JSON a
// propósito, para no correr los índices de columna de CODE,
// ID_PERSONAL, EMPLEADO, etc. que ya usaba el resto de este archivo
// — solo cambia la posición de GOCES_JSON (ver
// asegurarColumnaDniVacaciones_ más abajo, que migra hojas
// BD_VACACIONES creadas antes de este cambio sin tocar los datos
// existentes).
// ============================================================

const VACACIONES_SHEET_NAME = 'BD_VACACIONES';

const VACACIONES_HEADERS = [
  'ID_VACACION', 'FECHA_REGISTRO', 'FECHA_ACTUALIZACION', 'CODE', 'ID_PERSONAL', 'EMPLEADO',
  'PERIODO_VACACIONAL', 'DIAS_ASIGNADOS', 'FECHA_LIMITE', 'OBSERVACION', 'DNI', 'GOCES_JSON'
];
// GOCES_JSON guarda un arreglo de tramos ya tomados:
//   [{"fechaInicio":"2025-12-10","fechaFin":"2025-12-24","dias":15,"observacion":""}, ...]
// Va en la ÚLTIMA columna por el mismo motivo que OBSERVACION en
// BD_HORARIOS: un JSON puede crecer bastante y así nunca "corre" a
// las columnas numéricas/de fecha que están antes.

const DIAS_ASIGNADOS_DEFECTO_VACACIONES = 30;
const DIAS_ASIGNADOS_MAXIMO_VACACIONES = 30;

// Devuelve la hoja "BD_VACACIONES", creándola con sus encabezados si
// aún no existe (mismo criterio que getHorariosSheet()/getUsersSheet()).
// Si la hoja YA existía (proyectos con datos previos a la columna
// DNI), se asegura de que tenga esa columna antes de devolverla.
function getVacacionesSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(VACACIONES_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(VACACIONES_SHEET_NAME);
    sheet.appendRow(VACACIONES_HEADERS);
    sheet.getRange(1, 1, 1, VACACIONES_HEADERS.length).setFontWeight('bold');
  } else {
    asegurarColumnaDniVacaciones_(sheet);
  }

  return sheet;
}

// Migración in-place para hojas BD_VACACIONES creadas ANTES de que
// existiera la columna DNI: la inserta justo antes de GOCES_JSON, sin
// tocar ninguna fila de datos existente (las celdas nuevas quedan
// vacías; se completan solas la próxima vez que se cree o edite cada
// período). Es idempotente: si la columna ya existe, no hace nada.
function asegurarColumnaDniVacaciones_(sheet) {
  const ultimaCol = sheet.getLastColumn();
  if (ultimaCol < 1) return;

  const encabezados = sheet.getRange(1, 1, 1, ultimaCol).getValues()[0];
  if (encabezados.indexOf('DNI') !== -1) return; // ya migrada

  const posicionGocesJson = encabezados.indexOf('GOCES_JSON');
  const posicionInsertar = posicionGocesJson !== -1 ? posicionGocesJson + 1 : ultimaCol + 1;

  sheet.insertColumnBefore(posicionInsertar);
  sheet.getRange(1, posicionInsertar).setValue('DNI').setFontWeight('bold');
}

// Genera el siguiente ID_VACACION secuencial: VAC-000001, VAC-000002...
// (mismo criterio que generarSiguienteIdGrupo() para HG-000001).
function generarSiguienteIdVacacion(data) {
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '');
    const match = id.match(/^VAC-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return 'VAC-' + String(maxNum + 1).padStart(6, '0');
}

function findRowByIdVacacion_(sheet, idVacacion, cachedData) {
  const data = cachedData || sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(idVacacion)) {
      return { rowIndex: i + 1, data: data[i] };
    }
  }
  return null;
}

// Parsea GOCES_JSON de forma segura: una celda vacía o corrupta
// nunca debe tumbar la lectura del período, solo se trata como "sin
// goces todavía".
function parsearGoces_(valor) {
  if (!valor) return [];
  try {
    const goces = JSON.parse(valor);
    return Array.isArray(goces) ? goces : [];
  } catch (e) {
    return [];
  }
}

function sumarDiasGoces_(goces) {
  return (goces || []).reduce((acc, g) => acc + (parseInt(g.dias, 10) || 0), 0);
}

// Calcula el ESTADO comparando días pendientes y fecha límite contra
// hoy — mismo criterio que VacacionesModel.calcularSaldo() en el
// frontend (js/vacaciones/vacaciones-model.js), pero esta es la
// fuente de verdad real: se recalcula siempre al leer, nunca se
// guarda en la hoja.
function calcularEstadoVacacion_(pendientes, tomados, fechaLimite) {
  if (pendientes <= 0) return 'Agotado';

  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  const limite = parseFechaLocal(fechaLimite);
  if (limite && limite < hoy) return 'Vencido';

  if (tomados > 0) return 'Goce parcial';
  return 'Pendiente de goce';
}

// Arma el objeto "período" completo (cabecera + GOCES + campos
// calculados) a partir de una fila física de BD_VACACIONES. Misma
// forma la usan tanto la lista del modal como la Fase 2 y el reporte
// general (listVacaciones).
//
// Layout de columnas (0-based, ver VACACIONES_HEADERS):
//   0 ID_VACACION | 1 FECHA_REGISTRO | 2 FECHA_ACTUALIZACION | 3 CODE
//   | 4 ID_PERSONAL | 5 EMPLEADO | 6 PERIODO_VACACIONAL
//   | 7 DIAS_ASIGNADOS | 8 FECHA_LIMITE | 9 OBSERVACION | 10 DNI
//   | 11 GOCES_JSON
function armarVacacionDesdeFila_(row) {
  const goces = parsearGoces_(row[11]);
  const diasAsignados = parseInt(row[7], 10) || 0;
  const tomados = sumarDiasGoces_(goces);
  const pendientes = Math.max(diasAsignados - tomados, 0);
  const fechaLimite = formatearFechaSoloDia(row[8]);

  return {
    ID_VACACION: row[0],
    FECHA_REGISTRO: row[1] instanceof Date ? row[1].toISOString() : (row[1] || ''),
    FECHA_ACTUALIZACION: row[2] instanceof Date ? row[2].toISOString() : (row[2] || ''),
    CODE: row[3] || '',
    ID_PERSONAL: row[4] || '',
    EMPLEADO: row[5] || '',
    PERIODO_VACACIONAL: row[6] || '',
    DIAS_ASIGNADOS: diasAsignados,
    DIAS_TOMADOS: tomados,
    DIAS_PENDIENTES: pendientes,
    FECHA_LIMITE: fechaLimite,
    OBSERVACION: row[9] || '',
    DNI: row[10] || '',
    ESTADO: calcularEstadoVacacion_(pendientes, tomados, fechaLimite),
    GOCES: goces
  };
}

// Valida los campos de Fase 1 (compartido entre createVacacion y
// updateVacacion). soloEdicion=true omite exigir CODE (no se permite
// cambiar el empleado de un período ya creado).
function validarDatosVacacion_(params, soloEdicion) {
  if (!soloEdicion && !getCodeParam(params)) {
    return { error: 'CODE del empleado es requerido' };
  }
  if (!params.PERIODO_VACACIONAL || !String(params.PERIODO_VACACIONAL).trim()) {
    return { error: 'El período vacacional es requerido (ej. "2025-2026")' };
  }
  if (!params.FECHA_LIMITE) {
    return { error: 'La fecha límite de goce es requerida' };
  }

  const diasAsignados = params.DIAS_ASIGNADOS !== undefined && params.DIAS_ASIGNADOS !== ''
    ? parseInt(params.DIAS_ASIGNADOS, 10)
    : DIAS_ASIGNADOS_DEFECTO_VACACIONES;

  if (!diasAsignados || diasAsignados <= 0) {
    return { error: 'Los días asignados deben ser mayor a 0' };
  }
  if (diasAsignados > DIAS_ASIGNADOS_MAXIMO_VACACIONES) {
    return { error: `Los días asignados no pueden superar ${DIAS_ASIGNADOS_MAXIMO_VACACIONES}` };
  }

  return { diasAsignados };
}

// ============================================================
// FASE 1 — CREAR PERÍODO VACACIONAL (saldo)
// ============================================================
function createVacacion(params) {
  try {
    const validacion = validarDatosVacacion_(params, false);
    if (validacion.error) return createJsonResponse(false, validacion.error);

    const sheet = getVacacionesSheet();
    const data = sheet.getDataRange().getValues();
    const idVacacion = generarSiguienteIdVacacion(data);
    const ahora = new Date();

    sheet.appendRow([
      idVacacion,
      ahora,
      ahora,
      getCodeParam(params),
      params.ID_PERSONAL || '',
      params.EMPLEADO || '',
      String(params.PERIODO_VACACIONAL).trim(),
      validacion.diasAsignados,
      params.FECHA_LIMITE,
      params.OBSERVACION || '',
      params.DNI || '',
      JSON.stringify([])
    ]);

    registrarAuditoria(
      params.__usuario, 'CREAR', 'Vacaciones',
      `Período vacacional registrado para ${params.EMPLEADO || getCodeParam(params)} — ${params.PERIODO_VACACIONAL} (${validacion.diasAsignados} días, vence ${params.FECHA_LIMITE}) (${idVacacion})`,
      idVacacion
    );

    return createJsonResponse(true, 'Período vacacional registrado. Queda pendiente el registro del goce.', { ID_VACACION: idVacacion });

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// FASE 1 — ACTUALIZAR PERÍODO VACACIONAL
// ============================================================
// Solo se permite editar mientras el período NO tenga ningún goce
// registrado todavía (mismo criterio que updateSobretiempo() con
// los descansos): una vez que hay tramos tomados, cambiar los días
// asignados o la fecha límite dejaría el saldo ya descontado en un
// estado inconsistente. Por eso esos tres campos (PERIODO_VACACIONAL/
// DIAS_ASIGNADOS/FECHA_LIMITE) solo se tocan si el período aún no
// tiene goces. Los campos de identidad (ID_PERSONAL/EMPLEADO/DNI/
// OBSERVACION) sí se pueden corregir siempre, incluso con goces ya
// registrados — antes esta función bloqueaba TODA la edición apenas
// existía un goce, lo que hacía imposible corregir un DNI/ID_PERSONAL
// mal guardado justo en el caso típico (el documento de solicitud se
// genera por goce, así que siempre hay al menos uno registrado).
function updateVacacion(params) {
  try {
    const idVacacion = params.ID_VACACION || params.idVacacion;
    if (!idVacacion) {
      return createJsonResponse(false, 'ID_VACACION es requerido para actualizar');
    }

    const validacion = validarDatosVacacion_(params, true);
    if (validacion.error) return createJsonResponse(false, validacion.error);

    const sheet = getVacacionesSheet();
    const data = sheet.getDataRange().getValues();
    const encontrado = findRowByIdVacacion_(sheet, idVacacion, data);
    if (!encontrado) {
      return createJsonResponse(false, 'No se encontró el período vacacional a actualizar');
    }

    const goces = parsearGoces_(encontrado.data[11]);
    // Antes, CUALQUIER edición se bloqueaba apenas el período tenía un
    // goce registrado. Eso protegía bien DIAS_ASIGNADOS/FECHA_LIMITE
    // (cambiar el saldo ya descontado sí lo dejaría inconsistente),
    // pero de paso volvía IMPOSIBLE corregir DNI/ID_PERSONAL/EMPLEADO/
    // OBSERVACION en cualquier período con al menos un tramo tomado —
    // que es justo el caso típico: el documento de solicitud (Word) se
    // genera POR GOCE, así que un período sin goces nunca tiene ese
    // documento para necesitar la corrección. Ahora solo se protegen
    // los campos que afectan el saldo; los de identidad se pueden
    // corregir siempre.
    const tieneGoces = goces.length > 0;

    sheet.getRange(encontrado.rowIndex, 3).setValue(new Date()); // FECHA_ACTUALIZACION
    // ID_PERSONAL: mismo criterio que EMPLEADO/DNI — si no llega en el
    // payload, conserva el que ya estaba guardado. Antes de este fix
    // esta columna nunca se reescribía en la edición, así que un
    // ID_PERSONAL guardado vacío no se podía corregir editando el
    // período (el DNI sí tenía este mecanismo; el ID_PERSONAL no).
    sheet.getRange(encontrado.rowIndex, 5).setValue(params.ID_PERSONAL || encontrado.data[4] || ''); // ID_PERSONAL
    sheet.getRange(encontrado.rowIndex, 6).setValue(params.EMPLEADO || encontrado.data[5] || ''); // EMPLEADO
    sheet.getRange(encontrado.rowIndex, 10).setValue(params.OBSERVACION || '');                    // OBSERVACION
    // DNI: si no llega en el payload (p. ej. una versión vieja del
    // frontend), conserva el que ya estaba guardado en vez de
    // borrarlo.
    sheet.getRange(encontrado.rowIndex, 11).setValue(params.DNI || encontrado.data[10] || '');     // DNI

    // PERIODO_VACACIONAL/DIAS_ASIGNADOS/FECHA_LIMITE SÍ afectan el
    // saldo ya calculado a partir de los goces existentes, así que
    // estos tres solo se tocan si el período todavía no tiene ningún
    // tramo tomado.
    if (tieneGoces) {
      return createJsonResponse(true, 'Datos del trabajador actualizados (el saldo del período no se modifica porque ya tiene goces registrados)');
    }
    sheet.getRange(encontrado.rowIndex, 7).setValue(String(params.PERIODO_VACACIONAL).trim());    // PERIODO_VACACIONAL
    sheet.getRange(encontrado.rowIndex, 8).setValue(validacion.diasAsignados);                    // DIAS_ASIGNADOS
    sheet.getRange(encontrado.rowIndex, 9).setValue(params.FECHA_LIMITE);                          // FECHA_LIMITE

    registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Vacaciones', `Período vacacional actualizado (${idVacacion})`, idVacacion);

    return createJsonResponse(true, 'Período actualizado correctamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// ELIMINAR PERÍODO VACACIONAL (con todos sus goces)
// ============================================================
function deleteVacacion(params) {
  try {
    const idVacacion = params.ID_VACACION || params.idVacacion;
    if (!idVacacion) {
      return createJsonResponse(false, 'ID_VACACION es requerido');
    }

    const sheet = getVacacionesSheet();
    const encontrado = findRowByIdVacacion_(sheet, idVacacion);
    if (!encontrado) {
      return createJsonResponse(false, 'No se encontró el período vacacional a eliminar');
    }

    const empleado = encontrado.data[5] || encontrado.data[3];
    sheet.deleteRow(encontrado.rowIndex);

    registrarAuditoria(params.__usuario, 'ELIMINAR', 'Vacaciones', `Período vacacional eliminado de ${empleado} (${idVacacion})`, idVacacion);

    return createJsonResponse(true, 'Período eliminado correctamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// LISTAR PERÍODOS (opcionalmente filtrados por empleado)
// ============================================================
// Si se pasa "code" filtra solo los del empleado indicado (panel
// "Períodos de este empleado" dentro del modal); sin filtro alimenta
// el reporte general "OF DE GESTIÓN DE LABORATORIOS" que se exporta
// enteramente en el navegador (ver vacaciones-export-xlsx.js).
function listVacaciones(params) {
  try {
    const sheet = getVacacionesSheet();
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return createJsonResponse(true, 'No hay períodos vacacionales registrados', []);
    }

    const filtroCode = params.code || params.CODE || '';
    const registros = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      if (filtroCode && String(row[3]) !== String(filtroCode)) continue;
      registros.push(armarVacacionDesdeFila_(row));
    }

    registros.reverse(); // más recientes primero

    return createJsonResponse(true, 'Períodos vacacionales obtenidos exitosamente', registros);

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// OBTENER UN SOLO PERÍODO (para reconstruir el modal / Fase 2)
// ============================================================
function getVacacion(params) {
  try {
    const idVacacion = params.idVacacion || params.ID_VACACION;
    if (!idVacacion) {
      return createJsonResponse(false, 'ID_VACACION es requerido');
    }

    const sheet = getVacacionesSheet();
    const encontrado = findRowByIdVacacion_(sheet, idVacacion);
    if (!encontrado) {
      return createJsonResponse(false, 'No se encontró el período vacacional solicitado');
    }

    return createJsonResponse(true, 'Período obtenido exitosamente', armarVacacionDesdeFila_(encontrado.data));

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// FASE 2 — REGISTRAR GOCE (agrega un tramo, descuenta el saldo)
// ============================================================
// Se puede llamar varias veces para el mismo período hasta agotar el
// saldo asignado. Rechaza el tramo si excede los días que quedan
// pendientes — el frontend ya valida esto para dar feedback
// inmediato (VacacionesValidacion.validarFase2), pero el backend es
// quien de verdad lo hace cumplir.
function registrarGoceVacacion(params) {
  try {
    const idVacacion = params.ID_VACACION || params.idVacacion;
    if (!idVacacion) {
      return createJsonResponse(false, 'ID_VACACION es requerido');
    }
    if (!params.FECHA_INICIO || !params.FECHA_FIN) {
      return createJsonResponse(false, 'La fecha de inicio y fin del goce son requeridas');
    }
    if (params.FECHA_FIN < params.FECHA_INICIO) {
      return createJsonResponse(false, 'La fecha de fin no puede ser anterior a la fecha de inicio');
    }

    const sheet = getVacacionesSheet();
    const encontrado = findRowByIdVacacion_(sheet, idVacacion);
    if (!encontrado) {
      return createJsonResponse(false, 'No se encontró el período vacacional');
    }

    const diasAsignados = parseInt(encontrado.data[7], 10) || 0;
    const goces = parsearGoces_(encontrado.data[11]);
    const tomadosActuales = sumarDiasGoces_(goces);
    const pendientesActuales = Math.max(diasAsignados - tomadosActuales, 0);

    const diasTramo = parseInt(params.DIAS_TOMADOS, 10) || 0;
    if (diasTramo <= 0) {
      return createJsonResponse(false, 'La cantidad de días del tramo debe ser mayor a 0');
    }
    if (diasTramo > pendientesActuales) {
      return createJsonResponse(false, `El tramo excede los días pendientes (quedan ${pendientesActuales})`);
    }

    goces.push({
      fechaInicio: params.FECHA_INICIO,
      fechaFin: params.FECHA_FIN,
      dias: diasTramo,
      observacion: params.OBSERVACION_GOCE || ''
    });

    sheet.getRange(encontrado.rowIndex, 12).setValue(JSON.stringify(goces)); // GOCES_JSON
    sheet.getRange(encontrado.rowIndex, 3).setValue(new Date());             // FECHA_ACTUALIZACION

    const filaActualizada = findRowByIdVacacion_(sheet, idVacacion).data;
    const actualizado = armarVacacionDesdeFila_(filaActualizada);

    registrarAuditoria(
      params.__usuario, 'CREAR', 'Vacaciones',
      `Goce registrado para ${filaActualizada[5] || filaActualizada[3]}: ${params.FECHA_INICIO} a ${params.FECHA_FIN} (${diasTramo} día(s)) — quedan ${actualizado.DIAS_PENDIENTES} pendiente(s) (${idVacacion})`,
      idVacacion
    );

    return createJsonResponse(true, 'Goce registrado correctamente', actualizado);

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// FASE 2 — ELIMINAR UN GOCE (por índice dentro del arreglo)
// ============================================================
// Sus días vuelven a quedar pendientes automáticamente porque
// DIAS_TOMADOS/DIAS_PENDIENTES/ESTADO se recalculan siempre al leer.
function eliminarGoceVacacion(params) {
  try {
    const idVacacion = params.ID_VACACION || params.idVacacion;
    if (!idVacacion) {
      return createJsonResponse(false, 'ID_VACACION es requerido');
    }

    const indice = parseInt(params.indice, 10);
    if (isNaN(indice) || indice < 0) {
      return createJsonResponse(false, 'Índice de goce inválido');
    }

    const sheet = getVacacionesSheet();
    const encontrado = findRowByIdVacacion_(sheet, idVacacion);
    if (!encontrado) {
      return createJsonResponse(false, 'No se encontró el período vacacional');
    }

    const goces = parsearGoces_(encontrado.data[11]);
    if (indice >= goces.length) {
      return createJsonResponse(false, 'No se encontró el goce indicado');
    }

    goces.splice(indice, 1);

    sheet.getRange(encontrado.rowIndex, 12).setValue(JSON.stringify(goces));
    sheet.getRange(encontrado.rowIndex, 3).setValue(new Date());

    const filaActualizada = findRowByIdVacacion_(sheet, idVacacion).data;
    const actualizado = armarVacacionDesdeFila_(filaActualizada);

    registrarAuditoria(params.__usuario, 'ELIMINAR', 'Vacaciones', `Goce eliminado (índice ${indice}) — quedan ${actualizado.DIAS_PENDIENTES} pendiente(s) (${idVacacion})`, idVacacion);

    return createJsonResponse(true, 'Goce eliminado correctamente', actualizado);

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}
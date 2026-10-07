// ============================================================
// CODIGO_SOBRETIEMPO.GS — Backend del módulo Sobretiempo
// ============================================================
// Sigue EXACTAMENTE el mismo patrón que el bloque HORARIOS de
// Codigo_corregido.gs (mismas convenciones: getXxxSheet(),
// generarSiguienteId, registrarAuditoria, createJsonResponse).
// Se deja en un archivo .gs aparte por prolijidad, pero al pegarlo
// en el mismo proyecto de Apps Script comparte automáticamente
// todas las funciones globales de Codigo_corregido.gs (getSpreadsheet,
// registrarAuditoria, createJsonResponse, obtenerSesion, etc.).
//
// INSTALACIÓN (una sola vez, en el editor de Apps Script):
//   1. Crea un archivo nuevo llamado "Codigo_Sobretiempo" y pega
//      TODO este contenido.
//   2. En Codigo_corregido.gs agrega los 4 cambios marcados con
//      "★ AGREGAR EN Codigo_corregido.gs" al final de este archivo.
//   3. Vuelve a publicar (Implementar > Administrar implementaciones
//      > Editar > Nueva versión).
//
// MODELO DE DATOS (hoja BD_SOBRETIEMPO, una fila = una solicitud):
//
//   Fase 1 — "Generación de horas" (la registra el jefe inmediato,
//   equivale a la Sección I del formato INS-DRH-F-30.01): llena
//   TIPO_TRABAJO, FECHA_EJECUCION, HORA_INICIO/FIN, TOTAL_HORAS,
//   ACTIVIDADES, JUSTIFICACION. Al crearse, ESTADO = "Pendiente de
//   descanso" (aún no se sabe cuándo se compensará, ver 6.2.3 del
//   procedimiento: la jefatura tiene hasta 3 días hábiles para
//   programar el descanso compensado).
//
//   Fase 2 — "Registro del descanso" (la registra Control de
//   Asistencia cuando el trabajador efectivamente descansa, equivale
//   a la Sección III): llena FECHA_DESCANSO, TOTAL_HORAS_EFECTIVAS,
//   OBSERVACIONES_DESCANSO. Solo entonces ESTADO pasa a "Completo" y
//   se habilita la exportación a Excel (ver sobretiempo-export-xlsx.js).
// ============================================================

const SOBRETIEMPO_SHEET_NAME = 'BD_SOBRETIEMPO';

// ============================================================
// CAMBIOS EN Codigo_Sobretiempo.gs — DESCANSOS PARCIALES ACUMULABLES
// ============================================================
// Reemplaza en tu archivo las piezas con el mismo nombre por estas
// versiones. AGREGA la función nueva eliminarDescansoSobretiempo y
// la de migración al final. Al final de este archivo están también
// los 2 cambios de handleRequest()/WRITE_ACTIONS en Codigo_corregido.gs.
// ============================================================
 
// ---- 1) SOBRETIEMPO_HEADERS ----
// FECHA_DESCANSO / TOTAL_HORAS_EFECTIVAS / OBSERVACIONES_DESCANSO
// (un solo valor) se reemplazan por DESCANSOS_JSON (arreglo, cada
// descanso registrado se AGREGA, nunca reemplaza al anterior).
const SOBRETIEMPO_HEADERS = [
  'ID_SOLICITUD', 'FECHA_REGISTRO', 'FECHA_ACTUALIZACION',
  'CODE', 'ID_PERSONAL', 'EMPLEADO', 'DEPENDENCIA',
  'TIPO_TRABAJO', 'FECHAS_JSON', 'TOTAL_HORAS',
  'ACTIVIDADES', 'JUSTIFICACION',
  'DESCANSOS_JSON',
  'USUARIO_REGISTRO'
];

function getSobretiempoSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(SOBRETIEMPO_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SOBRETIEMPO_SHEET_NAME);
    sheet.appendRow(SOBRETIEMPO_HEADERS);
    sheet.getRange(1, 1, 1, SOBRETIEMPO_HEADERS.length).setFontWeight('bold');
  }

  return sheet;
}

// Genera el siguiente ID_SOLICITUD secuencial: ST-000001, ST-000002...
function generarSiguienteIdSobretiempo(data) {
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '');
    const match = id.match(/^ST-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return 'ST-' + String(maxNum + 1).padStart(6, '0');
}

// Normaliza un valor de horas leído de una celda de Sheets: si Sheets
// autoconvirtió el valor a una hora/fecha (por ejemplo alguien escribió
// "5:00" a mano y Sheets lo guardó como Date), lo recupera como número
// decimal de horas en vez de dejar pasar el objeto Date —que
// JSON.stringify serializaría como ISO completo, ej.
// "2026-08-08T05:00:00.000Z", rompiendo cualquier vista que muestre
// "horas". Úsese siempre que se lea una celda suelta de horas (no un
// valor ya validado que viene de un JSON interno).
function normalizarHorasDecimal_(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (valor instanceof Date) return valor.getHours() + valor.getMinutes() / 60 + valor.getSeconds() / 3600;
  const n = parseFloat(valor);
  return isNaN(n) ? 0 : n;
}

// ---- 2) calcularEstadoSobretiempo ----
// Antes recibía solo la fecha de descanso (una sola). Ahora compara
// horas generadas vs. horas ya tomadas en TODOS los descansos:
//   0 horas tomadas               -> "Pendiente de descanso"
//   0 < tomadas < generadas       -> "Descanso parcial"   (NUEVO)
//   tomadas >= generadas          -> "Completo"
function calcularEstadoSobretiempo(totalHoras, totalHorasEfectivas) {
  const generado = parseFloat(totalHoras) || 0;
  const tomado = parseFloat(totalHorasEfectivas) || 0;
  if (tomado <= 0) return 'Pendiente de descanso';
  if (tomado + 0.01 < generado) return 'Descanso parcial';
  return 'Completo';
}


// ---- 2) validarFase1Sobretiempo ----
// FECHAS_JSON llega del frontend como texto JSON:
//   [{"fecha":"2026-03-15","horaInicio":"18:00","horaFin":"20:00",
//     "refrigerioInicio":"","refrigerioFin":"","horas":"2.00"}, ...]
// Máximo 5 entradas (igual que las 5 filas del formato oficial).
function validarFase1Sobretiempo(params) {
  if (!params.CODE) return { error: 'CODE del empleado es requerido' };
  if (!params.TIPO_TRABAJO) return { error: 'Debe indicar el tipo de trabajo' };
  if (!params.FECHAS_JSON) return { error: 'Debe indicar al menos una fecha de ejecución' };
 
  let fechas;
  try {
    fechas = JSON.parse(params.FECHAS_JSON);
  } catch (e) {
    return { error: 'FECHAS_JSON inválido' };
  }
 
  if (!Array.isArray(fechas) || fechas.length === 0) {
    return { error: 'Debe indicar al menos una fecha de ejecución' };
  }
  if (fechas.length > 5) {
    return { error: 'No se pueden registrar más de 5 fechas por solicitud' };
  }
  for (let i = 0; i < fechas.length; i++) {
    const f = fechas[i];
    if (!f.fecha || !f.horaInicio || !f.horaFin) {
      return { error: `La fecha #${i + 1} no tiene fecha/hora inicio/hora fin completos` };
    }
  }
 
  if (!params.ACTIVIDADES) return { error: 'Debe indicar las actividades a realizar' };
  if (!params.JUSTIFICACION) return { error: 'Debe indicar la justificación de la necesidad' };
  return { ok: true, fechas };
}

// ---- 3) filaSobretiempo ----
// Toda solicitud nueva arranca con DESCANSOS_JSON = '[]' (sin
// descansos registrados aún).
function filaSobretiempo(id, fechaRegistro, fechaActualizacion, params) {
  return [
    id,
    fechaRegistro,
    fechaActualizacion,
    params.CODE,
    params.ID_PERSONAL || '',
    params.EMPLEADO || '',
    params.DEPENDENCIA || '',
    params.TIPO_TRABAJO,
    params.FECHAS_JSON,
    params.TOTAL_HORAS || '',
    params.ACTIVIDADES,
    params.JUSTIFICACION,
    params.DESCANSOS_JSON || '[]',
    params.__usuario || ''
  ];
}

// ---- FASE 1: crear la solicitud (generación de horas) ----
function createSobretiempo(params) {
  try {
    const validacion = validarFase1Sobretiempo(params);
    if (validacion.error) return createJsonResponse(false, validacion.error);

    const sheet = getSobretiempoSheet();
    const data = sheet.getDataRange().getValues();
    const id = generarSiguienteIdSobretiempo(data);
    const ahora = new Date();

    sheet.appendRow(filaSobretiempo(id, ahora, ahora, params));

    registrarAuditoria(params.__usuario, 'CREAR', 'Sobretiempo',
      `Registro de ${params.TIPO_TRABAJO} para ${params.EMPLEADO || params.CODE} — ${params.FECHA_EJECUCION} (${id})`, id);

    return createJsonResponse(true, 'Solicitud de sobretiempo registrada. Queda pendiente de registrar el descanso compensatorio.', { ID_SOLICITUD: id });

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// Ubica la fila física (índice base 1, ya +1 listo para getRange) de
// un ID_SOLICITUD. Devuelve -1 si no existe.
function buscarFilaSobretiempo_(sheet, idSolicitud) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(idSolicitud)) return { fila: i + 1, row: data[i] };
  }
  return { fila: -1, row: null };
}

function solicitudTieneMovimientosBanco_(idSolicitud) {
  try {
    return leerMovimientosBanco_().some(m => String(m.ID_SOLICITUD_ORIGEN) === String(idSolicitud) && ['COMPROMETIDO','UTILIZADO'].indexOf(m.ESTADO) !== -1);
  } catch(e) { return false; }
}

// ---- 4) updateSobretiempo ----
// El bloqueo de edición de Fase 1 ahora se basa en si YA hay algún
// descanso registrado (antes: si FECHA_DESCANSO tenía algo).
function updateSobretiempo(params) {
  try {
    const id = params.ID_SOLICITUD || params.idSolicitud;
    if (!id) return createJsonResponse(false, 'ID_SOLICITUD es requerido para actualizar');
 
    const validacion = validarFase1Sobretiempo(params);
    if (validacion.error) return createJsonResponse(false, validacion.error);
 
    const sheet = getSobretiempoSheet();
    const { fila, row } = buscarFilaSobretiempo_(sheet, id);
    if (fila === -1) return createJsonResponse(false, 'No se encontró la solicitud a actualizar');
 
    const HEAD = SOBRETIEMPO_HEADERS;
    let descansosExistentes = [];
    try { descansosExistentes = JSON.parse(row[HEAD.indexOf('DESCANSOS_JSON')] || '[]'); } catch (e) { descansosExistentes = []; }
 
    if (descansosExistentes.length > 0) {
      return createJsonResponse(false, 'No se puede editar: esta solicitud ya tiene descansos registrados');
    }
    if (solicitudTieneMovimientosBanco_(id)) {
      return createJsonResponse(false, 'No se puede editar: esta solicitud ya tiene horas comprometidas o utilizadas en el banco de horas');
    }
 
    const fechaRegistroOriginal = row[HEAD.indexOf('FECHA_REGISTRO')];
    const ahora = new Date();
    const nuevaFila = filaSobretiempo(id, fechaRegistroOriginal, ahora, params);
    sheet.getRange(fila, 1, 1, HEAD.length).setValues([nuevaFila]);
 
    registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Sobretiempo',
      `Solicitud de sobretiempo actualizada para ${params.EMPLEADO || params.CODE} (${id})`, id);
 
    return createJsonResponse(true, 'Solicitud actualizada correctamente');
 
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ---- 5) registrarDescansoSobretiempo ----
// Ya NO reemplaza el descanso: AGREGA un nuevo registro al arreglo
// DESCANSOS_JSON. Devuelve el ESTADO resultante y las horas que
// aún quedan pendientes, para que el frontend decida si cerrar la
// Fase 2 (ya está Completo) o dejarla abierta para seguir
// registrando (sigue en Descanso parcial).
function registrarDescansoSobretiempo(params) {
  try {
    const id = params.ID_SOLICITUD || params.idSolicitud;
    if (!id) return createJsonResponse(false, 'ID_SOLICITUD es requerido');
    if (!params.FECHA_DESCANSO) return createJsonResponse(false, 'La fecha de descanso es requerida');
    if (!params.HORA_INICIO_DESCANSO || !params.HORA_FIN_DESCANSO) return createJsonResponse(false, 'La hora de inicio y fin del descanso son requeridas');
    if (!params.TOTAL_HORAS_EFECTIVAS) return createJsonResponse(false, 'El total de horas efectivas de este descanso es requerido');
 
    const sheet = getSobretiempoSheet();
    const { fila, row } = buscarFilaSobretiempo_(sheet, id);
    if (fila === -1) return createJsonResponse(false, 'No se encontró la solicitud');
 
    const HEAD = SOBRETIEMPO_HEADERS;
    let descansos = [];
    try { descansos = JSON.parse(row[HEAD.indexOf('DESCANSOS_JSON')] || '[]'); } catch (e) { descansos = []; }
 
    descansos.push({
      fecha: params.FECHA_DESCANSO,
      horaInicio: params.HORA_INICIO_DESCANSO,
      horaFin: params.HORA_FIN_DESCANSO,
      refrigerioInicio: params.REFRIGERIO_DESCANSO_INICIO || '',
      refrigerioFin: params.REFRIGERIO_DESCANSO_FIN || '',
      horas: params.TOTAL_HORAS_EFECTIVAS,
      observaciones: params.OBSERVACIONES_DESCANSO || ''
    });
 
    const totalHoras = parseFloat(row[HEAD.indexOf('TOTAL_HORAS')]) || 0;
    const totalEfectivas = descansos.reduce((acc, d) => acc + (parseFloat(d.horas) || 0), 0);
 
    row[HEAD.indexOf('DESCANSOS_JSON')] = JSON.stringify(descansos);
    row[HEAD.indexOf('FECHA_ACTUALIZACION')] = new Date();
    sheet.getRange(fila, 1, 1, HEAD.length).setValues([row]);
 
    const estado = calcularEstadoSobretiempo(totalHoras, totalEfectivas);
    const pendiente = Math.max(totalHoras - totalEfectivas, 0).toFixed(2);
 
    registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Sobretiempo',
      `Descanso registrado (${params.FECHA_DESCANSO}, ${params.TOTAL_HORAS_EFECTIVAS}h) — ${estado} (${id})`, id);
 
    return createJsonResponse(true,
      estado === 'Completo'
        ? 'Descanso registrado. La solicitud queda completa y lista para exportar.'
        : `Descanso registrado. Quedan ${pendiente} h pendientes de compensar.`,
      { ESTADO: estado, HORAS_PENDIENTES: pendiente }
    );
 
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ---- 6) NUEVO: eliminarDescansoSobretiempo ----
// Quita UN descanso ya registrado (por si Control de Asistencia se
// equivocó al cargarlo). "indice" es la posición dentro del arreglo
// (0 = el primero registrado). Las horas de ese descanso vuelven a
// sumarse a "pendiente" automáticamente al recalcular el ESTADO.
function eliminarDescansoSobretiempo(params) {
  try {
    const id = params.ID_SOLICITUD || params.idSolicitud;
    const indice = parseInt(params.INDICE ?? params.indice, 10);
    if (!id) return createJsonResponse(false, 'ID_SOLICITUD es requerido');
    if (Number.isNaN(indice)) return createJsonResponse(false, 'INDICE es requerido');
 
    const sheet = getSobretiempoSheet();
    const { fila, row } = buscarFilaSobretiempo_(sheet, id);
    if (fila === -1) return createJsonResponse(false, 'No se encontró la solicitud');
 
    const HEAD = SOBRETIEMPO_HEADERS;
    let descansos = [];
    try { descansos = JSON.parse(row[HEAD.indexOf('DESCANSOS_JSON')] || '[]'); } catch (e) { descansos = []; }
 
    if (indice < 0 || indice >= descansos.length) {
      return createJsonResponse(false, 'No se encontró el descanso a eliminar');
    }
 
    const eliminado = descansos.splice(indice, 1)[0];
    row[HEAD.indexOf('DESCANSOS_JSON')] = JSON.stringify(descansos);
    row[HEAD.indexOf('FECHA_ACTUALIZACION')] = new Date();
    sheet.getRange(fila, 1, 1, HEAD.length).setValues([row]);
 
    registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Sobretiempo',
      `Descanso eliminado (${eliminado.fecha}, ${eliminado.horas}h) — ${id}`, id);
 
    return createJsonResponse(true, 'Descanso eliminado correctamente');
 
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

function deleteSobretiempo(params) {
  try {
    const id = params.ID_SOLICITUD || params.idSolicitud;
    if (!id) return createJsonResponse(false, 'ID_SOLICITUD es requerido');

    const sheet = getSobretiempoSheet();
    const { fila, row } = buscarFilaSobretiempo_(sheet, id);
    if (fila === -1) return createJsonResponse(false, 'No se encontró la solicitud a eliminar');
    if (solicitudTieneMovimientosBanco_(id)) return createJsonResponse(false, 'No se puede eliminar: la solicitud tiene horas comprometidas o utilizadas en el banco de horas');

    sheet.deleteRow(fila);

    registrarAuditoria(params.__usuario, 'ELIMINAR', 'Sobretiempo',
      `Solicitud de sobretiempo eliminada de ${row[5] || row[3]} (${id})`, id);

    return createJsonResponse(true, 'Solicitud eliminada correctamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ---- 7) armarObjetoSobretiempo_ ----
// "movimientosBanco" es opcional: el arreglo completo de
// BD_SOBRETIEMPO_MOVIMIENTOS ya leído (para no releer la hoja por
// cada fila al listar). Si no se pasa, se lee aquí mismo.
function armarObjetoSobretiempo_(row, movimientosBanco) {
  const HEAD = SOBRETIEMPO_HEADERS;
  const get = (campo) => row[HEAD.indexOf(campo)];
 
  let fechas = [];
  try { fechas = JSON.parse(get('FECHAS_JSON') || '[]'); } catch (e) { fechas = []; }
  fechas = fechas.map(f => ({
    fecha: formatearFechaSoloDia(f.fecha),
    horaInicio: formatearHoraSoloHHMM(f.horaInicio),
    horaFin: formatearHoraSoloHHMM(f.horaFin),
    refrigerioInicio: f.refrigerioInicio ? formatearHoraSoloHHMM(f.refrigerioInicio) : '',
    refrigerioFin: f.refrigerioFin ? formatearHoraSoloHHMM(f.refrigerioFin) : '',
    horas: f.horas || ''
  }));
 
  let descansos = [];
  try { descansos = JSON.parse(get('DESCANSOS_JSON') || '[]'); } catch (e) { descansos = []; }
  descansos = descansos.map(d => ({
    fecha: formatearFechaSoloDia(d.fecha),
    horaInicio: d.horaInicio ? formatearHoraSoloHHMM(d.horaInicio) : '',
    horaFin: d.horaFin ? formatearHoraSoloHHMM(d.horaFin) : '',
    refrigerioInicio: d.refrigerioInicio ? formatearHoraSoloHHMM(d.refrigerioInicio) : '',
    refrigerioFin: d.refrigerioFin ? formatearHoraSoloHHMM(d.refrigerioFin) : '',
    horas: d.horas || '',
    observaciones: d.observaciones || ''
  }));
 
  const idSolicitud = get('ID_SOLICITUD');
 
  // Horas ya comprometidas/utilizadas contra ESTA solicitud desde el
  // Banco de Horas (crearSolicitudDescansoBanco). Antes el ESTADO solo
  // miraba DESCANSOS_JSON (mecanismo viejo), así que una solicitud
  // seguía marcada "Pendiente de descanso" aunque sus horas ya se
  // hubieran usado/reservado en una solicitud de descanso del banco.
  const movs = (movimientosBanco || leerMovimientosBanco_())
    .filter(m => String(m.ID_SOLICITUD_ORIGEN) === String(idSolicitud));
  const horasBanco = movs
    .filter(m => m.ESTADO === 'COMPROMETIDO' || m.ESTADO === 'UTILIZADO')
    .reduce((acc, m) => acc + (parseFloat(m.HORAS) || 0), 0);
 
  const fechaReferencia = fechas.length ? fechas.map(f => f.fecha).sort().slice(-1)[0] : '';
  // TOTAL_HORAS: preferimos SIEMPRE la suma de las horas por fecha
  // (FECHAS_JSON, valores dentro de un JSON — Sheets nunca los toca)
  // en vez de la celda suelta TOTAL_HORAS. Esa celda puede haber sido
  // autoconvertida por Sheets a una hora/fecha si alguien la editó a
  // mano (ej. escribió "5:00" y Sheets la guardó como Date); sin esto,
  // JSON.stringify serializaba ese Date como ISO completo
  // ("2026-08-08T05:00:00.000Z"), rompiendo la vista de "horas
  // generadas". Solo si no hay fechas con horas (caso raro) se usa la
  // celda como respaldo, normalizada por si también fuera un Date.
  const totalHorasDesdeFechas = fechas.reduce((acc, f) => acc + (parseFloat(f.horas) || 0), 0);
  const totalHorasCelda = normalizarHorasDecimal_(get('TOTAL_HORAS'));
  const totalHoras = (totalHorasDesdeFechas > 0 ? totalHorasDesdeFechas : totalHorasCelda).toFixed(2);
  const totalHorasEfectivas = (
    descansos.reduce((acc, d) => acc + (parseFloat(d.horas) || 0), 0) + horasBanco
  ).toFixed(2);
  const horasPendientes = Math.max((parseFloat(totalHoras) || 0) - parseFloat(totalHorasEfectivas), 0).toFixed(2);
  const fechaUltimoDescanso = descansos.length ? descansos.map(d => d.fecha).sort().slice(-1)[0] : '';
 
  const obj = {
    ID_SOLICITUD: idSolicitud,
    FECHA_REGISTRO: get('FECHA_REGISTRO') instanceof Date ? get('FECHA_REGISTRO').toISOString() : (get('FECHA_REGISTRO') || ''),
    FECHA_ACTUALIZACION: get('FECHA_ACTUALIZACION') instanceof Date ? get('FECHA_ACTUALIZACION').toISOString() : (get('FECHA_ACTUALIZACION') || ''),
    CODE: get('CODE') || '',
    ID_PERSONAL: get('ID_PERSONAL') || '',
    EMPLEADO: get('EMPLEADO') || '',
    DEPENDENCIA: get('DEPENDENCIA') || '',
    TIPO_TRABAJO: get('TIPO_TRABAJO') || '',
    FECHAS: fechas,
    FECHA_EJECUCION: fechaReferencia, // fecha de trabajo más reciente
    TOTAL_HORAS: totalHoras,          // horas generadas (suma de FECHAS)
    ACTIVIDADES: get('ACTIVIDADES') || '',
    JUSTIFICACION: get('JUSTIFICACION') || '',
    DESCANSOS: descansos,             // arreglo de descansos ya registrados (mecanismo viejo)
    FECHA_DESCANSO: fechaUltimoDescanso, // compatibilidad (última fecha de descanso)
    TOTAL_HORAS_EFECTIVAS: totalHorasEfectivas, // descansos viejos + banco (comprometido/utilizado)
    HORAS_PENDIENTES: horasPendientes,
    HORAS_BANCO: horasBanco.toFixed(2), // solo lo que viene del banco, para depuración/UI
    USUARIO_REGISTRO: get('USUARIO_REGISTRO') || ''
  };
  obj.ESTADO = calcularEstadoSobretiempo(obj.TOTAL_HORAS, obj.TOTAL_HORAS_EFECTIVAS);
  return obj;
}

// Lista las solicitudes, opcionalmente filtradas por CODE de
// empleado (mismo criterio que listHorarios / getHorariosAgrupados).
function listSobretiempo(params) {
  try {
    const sheet = getSobretiempoSheet();
    const data = sheet.getDataRange().getValues();
    const code = getCodeParam(params);
    const movimientosBanco = leerMovimientosBanco_(); // una sola lectura para toda la lista

    const resultado = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      if (code && String(data[i][3]) !== String(code)) continue;
      resultado.push(armarObjetoSobretiempo_(data[i], movimientosBanco));
    }

    // Más reciente primero (por fecha de ejecución).
    resultado.sort((a, b) => String(b.FECHA_EJECUCION).localeCompare(String(a.FECHA_EJECUCION)));

    return createJsonResponse(true, 'Solicitudes obtenidas', resultado);
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

function getSobretiempo(params) {
  try {
    const id = params.ID_SOLICITUD || params.idSolicitud;
    if (!id) return createJsonResponse(false, 'ID_SOLICITUD es requerido');

    const sheet = getSobretiempoSheet();
    const { row } = buscarFilaSobretiempo_(sheet, id);
    if (!row) return createJsonResponse(false, 'No se encontró la solicitud');

    return createJsonResponse(true, 'Solicitud obtenida', armarObjetoSobretiempo_(row));
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}


// ============================================================
// FASE 2 NUEVA — BANCO DE HORAS Y MOVIMIENTOS
// ============================================================
// La Fase 1 permanece intacta. Esta capa administra el consumo de
// horas por FECHA de sobretiempo, permitiendo consumo total o parcial
// y combinaciones de distintas solicitudes.

const BANCO_SOBRETIEMPO_SHEET_NAME = 'BD_SOBRETIEMPO_MOVIMIENTOS';
const BANCO_SOBRETIEMPO_HEADERS = [
  'ID_MOVIMIENTO','FECHA_REGISTRO','ID_SOLICITUD_DESCANSO','CODE','ID_PERSONAL',
  'ID_SOLICITUD_ORIGEN','FECHA_SOBRETIEMPO','HORAS','TIPO_MOVIMIENTO','ESTADO',
  'FECHA_DESCANSO','OBSERVACIONES','USUARIO_REGISTRO'
];
const DESCANSO_BANCO_SHEET_NAME = 'BD_DESCANSO_COMPENSATORIO';
const DESCANSO_BANCO_HEADERS = [
  'ID_SOLICITUD_DESCANSO','FECHA_REGISTRO','CODE','ID_PERSONAL','EMPLEADO',
  'SELECCIONES_JSON','FECHAS_DESCANSO_JSON','TOTAL_HORAS','EQUIVALENCIA','ESTADO',
  'OBSERVACIONES','USUARIO_REGISTRO'
];

function getBancoMovimientosSheet_() {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(BANCO_SOBRETIEMPO_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(BANCO_SOBRETIEMPO_SHEET_NAME);
    sh.appendRow(BANCO_SOBRETIEMPO_HEADERS);
    sh.getRange(1,1,1,BANCO_SOBRETIEMPO_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function getDescansoBancoSheet_() {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(DESCANSO_BANCO_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(DESCANSO_BANCO_SHEET_NAME);
    sh.appendRow(DESCANSO_BANCO_HEADERS);
    sh.getRange(1,1,1,DESCANSO_BANCO_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function generarSiguienteIdDescansoBanco_(data) {
  let max = 0;
  for (let i=1;i<data.length;i++) {
    const m=String(data[i][0]||'').match(/^DC-(\d+)$/i);
    if (m) max=Math.max(max,parseInt(m[1],10));
  }
  return 'DC-'+String(max+1).padStart(6,'0');
}

function leerMovimientosBanco_() {
  const sh=getBancoMovimientosSheet_(), data=sh.getDataRange().getValues();
  const H=BANCO_SOBRETIEMPO_HEADERS;
  return data.slice(1).filter(r=>r[0]).map(r=>({
    ID_MOVIMIENTO:String(r[H.indexOf('ID_MOVIMIENTO')]||''),
    ID_SOLICITUD_DESCANSO:String(r[H.indexOf('ID_SOLICITUD_DESCANSO')]||''),
    CODE:String(r[H.indexOf('CODE')]||''),
    ID_SOLICITUD_ORIGEN:String(r[H.indexOf('ID_SOLICITUD_ORIGEN')]||''),
    FECHA_SOBRETIEMPO:formatearFechaSoloDia(r[H.indexOf('FECHA_SOBRETIEMPO')]),
    HORAS:parseFloat(r[H.indexOf('HORAS')])||0,
    TIPO_MOVIMIENTO:String(r[H.indexOf('TIPO_MOVIMIENTO')]||''),
    ESTADO:String(r[H.indexOf('ESTADO')]||''),
    FECHA_DESCANSO:formatearFechaSoloDia(r[H.indexOf('FECHA_DESCANSO')])
  }));
}

function obtenerMovimientosBancoPorFuente_(code, idOrigen, fecha) {
  return leerMovimientosBanco_().filter(m =>
    String(m.CODE)===String(code) && String(m.ID_SOLICITUD_ORIGEN)===String(idOrigen) && String(m.FECHA_SOBRETIEMPO)===String(fecha)
  );
}

// Calcula consumo legado de DESCANSOS_JSON de forma determinista FIFO
// dentro de cada solicitud antigua. Los registros originales no se tocan.
function calcularConsumoLegadoPorFecha_(registro) {
  const resultado={};
  let restante=(parseFloat(registro.TOTAL_HORAS)||0);
  const fechas=(registro.FECHAS||[]).slice().sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
  const descansos=(registro.DESCANSOS||[]);
  const consumido=descansos.reduce((a,d)=>a+(parseFloat(d.horas)||0),0);
  let pendiente=Math.min(restante,consumido);
  for (const f of fechas) {
    if (pendiente<=0) break;
    const h=Math.min(parseFloat(f.horas)||0,pendiente);
    resultado[String(f.fecha)]=(resultado[String(f.fecha)]||0)+h;
    pendiente-=h;
  }
  return resultado;
}

function obtenerBancoHoras(params) {
  try {
    const code=getCodeParam(params);
    if (!code) return createJsonResponse(false,'CODE del empleado es requerido');
    const registros=listarSobretiempoInternoPorCode_(code);
    const movimientos=leerMovimientosBanco_().filter(m=>String(m.CODE)===String(code));
    const banco=[];

    registros.forEach(r=>{
      const legado=calcularConsumoLegadoPorFecha_(r);
      (r.FECHAS||[]).forEach(f=>{
        const generadas=parseFloat(f.horas)||0;
        if (generadas<=0) return;
        const fuente=String(f.fecha);
        const movs=movimientos.filter(m=>String(m.ID_SOLICITUD_ORIGEN)===String(r.ID_SOLICITUD) && String(m.FECHA_SOBRETIEMPO)===fuente);
        const utilizadasLegado=parseFloat(legado[fuente]||0);
        const utilizadasMov=movs.filter(m=>m.ESTADO==='UTILIZADO').reduce((a,m)=>a+m.HORAS,0);
        const comprometidas=movs.filter(m=>m.ESTADO==='COMPROMETIDO').reduce((a,m)=>a+m.HORAS,0);
        const utilizadas=utilizadasLegado+utilizadasMov;
        const disponibles=Math.max(generadas-utilizadas-comprometidas,0);
        banco.push({
          CODE:code, ID_PERSONAL:r.ID_PERSONAL||'', ID_SOLICITUD_ORIGEN:r.ID_SOLICITUD,
          FECHA_SOBRETIEMPO:fuente, DIA:diaSemanaEsp_(fuente),
          // HORA_INICIO/HORA_FIN de la fecha de ORIGEN (Fase 1): no se
          // usan para ningún cálculo de saldo (eso sigue siendo solo
          // por horas), solo viajan junto al banco para que el
          // correo de descanso compensatorio pueda mostrar el rango
          // horario real de cada fecha de sobretiempo, igual que en
          // el modelo de correo (columnas INICIO/FIN de la tabla
          // "HORAS SOBRETIEMPO").
          HORA_INICIO: f.horaInicio || '', HORA_FIN: f.horaFin || '',
          HORAS_GENERADAS:generadas.toFixed(2), HORAS_UTILIZADAS:utilizadas.toFixed(2),
          HORAS_COMPROMETIDAS:comprometidas.toFixed(2), HORAS_DISPONIBLES:disponibles.toFixed(2),
          ESTADO: disponibles>0 ? 'Disponible' : (comprometidas>0 ? 'Comprometida' : 'Agotada')
        });
      });
    });
    banco.sort((a,b)=>String(a.FECHA_SOBRETIEMPO).localeCompare(String(b.FECHA_SOBRETIEMPO)));
    return createJsonResponse(true,'Banco de horas obtenido',banco);
  } catch(e) { return createJsonResponse(false,e.toString()); }
}

function listarSobretiempoInternoPorCode_(code) {
  const sh=getSobretiempoSheet(), data=sh.getDataRange().getValues();
  const out=[];
  for(let i=1;i<data.length;i++) {
    if(!data[i][0] || String(data[i][3])!==String(code)) continue;
    out.push(armarObjetoSobretiempo_(data[i]));
  }
  return out;
}

function diaSemanaEsp_(fecha) {
  const d=new Date(String(fecha)+'T12:00:00');
  const dias=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  return isNaN(d.getTime()) ? '' : dias[d.getDay()];
}

function validarSeleccionesBanco_(code, selecciones) {
  if (!Array.isArray(selecciones) || !selecciones.length) return {error:'Debe seleccionar al menos una fecha y cantidad de horas'};
  const r=obtenerBancoHoras({code});
  let banco=[];
  try { const j=JSON.parse(r.getContent()); banco=j.data||[]; } catch(e) { return {error:'No se pudo validar el banco de horas'}; }
  const mapa={};
  banco.forEach(x=>{ mapa[String(x.ID_SOLICITUD_ORIGEN)+'|'+String(x.FECHA_SOBRETIEMPO)]=x; });
  let total=0;
  for(const s of selecciones) {
    const key=String(s.ID_SOLICITUD_ORIGEN)+'|'+String(s.FECHA_SOBRETIEMPO);
    const f=mapa[key];
    const h=parseFloat(s.HORAS_A_UTILIZAR);
    if(!f) return {error:`No existe saldo para ${s.FECHA_SOBRETIEMPO}`};
    if(!(h>0)) return {error:`La cantidad a utilizar para ${s.FECHA_SOBRETIEMPO} debe ser mayor que cero`};
    if(h-parseFloat(f.HORAS_DISPONIBLES)>0.001) return {error:`Las horas a utilizar (${h}) superan las horas disponibles (${f.HORAS_DISPONIBLES}) de ${s.FECHA_SOBRETIEMPO}`};
    total+=h;
  }
  return {ok:true,total:total.toFixed(2),banco};
}

function crearSolicitudDescansoBanco(params) {
  try {
    if(!params.CODE) return createJsonResponse(false,'CODE del empleado es requerido');
    let selecciones=[], fechasDescanso=[];
    try { selecciones=JSON.parse(params.SELECCIONES_JSON||'[]'); } catch(e) { return createJsonResponse(false,'SELECCIONES_JSON inválido'); }
    try { fechasDescanso=JSON.parse(params.FECHAS_DESCANSO_JSON||'[]'); } catch(e) { return createJsonResponse(false,'FECHAS_DESCANSO_JSON inválido'); }
    const val=validarSeleccionesBanco_(params.CODE,selecciones);
    if(val.error) return createJsonResponse(false,val.error);
    if(!Array.isArray(fechasDescanso)||!fechasDescanso.length) return createJsonResponse(false,'Debe indicar al menos una fecha propuesta de descanso');

    const sh=getDescansoBancoSheet_(), data=sh.getDataRange().getValues();
    const id=generarSiguienteIdDescansoBanco_(data), ahora=new Date();
    sh.appendRow([id,ahora,params.CODE,params.ID_PERSONAL||'',params.EMPLEADO||'',JSON.stringify(selecciones),JSON.stringify(fechasDescanso),val.total,params.EQUIVALENCIA||'', 'PENDIENTE', params.OBSERVACIONES||'', params.__usuario||'']);

    const movSh=getBancoMovimientosSheet_();
    selecciones.forEach(s=>movSh.appendRow([
      Utilities.getUuid(),ahora,id,params.CODE,params.ID_PERSONAL||'',s.ID_SOLICITUD_ORIGEN,s.FECHA_SOBRETIEMPO,
      parseFloat(s.HORAS_A_UTILIZAR), 'CONSUMO','COMPROMETIDO', (fechasDescanso[0]||''), params.OBSERVACIONES||'', params.__usuario||''
    ]));
    registrarAuditoria(params.__usuario,'CREAR','Descanso compensatorio',`Solicitud ${id} — ${val.total} h desde banco de horas`,id);
    return createJsonResponse(true,'Solicitud de descanso compensatorio creada',{
      ID_SOLICITUD_DESCANSO:id,TOTAL_HORAS:val.total,ESTADO:'PENDIENTE',FECHAS_DESCANSO:fechasDescanso
    });
  } catch(e) { return createJsonResponse(false,e.toString()); }
}

function listarSolicitudesDescansoBanco(params) {
  try {
    const code=getCodeParam(params), sh=getDescansoBancoSheet_(), data=sh.getDataRange().getValues(), H=DESCANSO_BANCO_HEADERS;
    const out=[];
    for(let i=1;i<data.length;i++) {
      if(!data[i][0] || (code && String(data[i][2])!==String(code))) continue;
      const selecciones = JSON.parse(data[i][5]||'[]');
      // Igual que en armarObjetoSobretiempo_: preferimos sumar las horas
      // dentro del JSON (nunca las toca Sheets) en vez de confiar en la
      // celda suelta TOTAL_HORAS, que puede haber sido autoconvertida a
      // fecha/hora si alguien la tocó a mano en la hoja.
      const totalDesdeSelecciones = selecciones.reduce((acc,s)=>acc+(parseFloat(s.HORAS_A_UTILIZAR)||0),0);
      const totalCelda = normalizarHorasDecimal_(data[i][7]);
      const totalHoras = (totalDesdeSelecciones>0 ? totalDesdeSelecciones : totalCelda).toFixed(2);
      out.push({ID_SOLICITUD_DESCANSO:data[i][0],FECHA_REGISTRO:data[i][1] instanceof Date?data[i][1].toISOString():data[i][1],CODE:data[i][2],ID_PERSONAL:data[i][3],EMPLEADO:data[i][4],SELECCIONES:selecciones,FECHAS_DESCANSO:JSON.parse(data[i][6]||'[]'),TOTAL_HORAS:totalHoras,EQUIVALENCIA:data[i][8],ESTADO:data[i][9],OBSERVACIONES:data[i][10]});
    }
    return createJsonResponse(true,'Solicitudes de descanso obtenidas',out.reverse());
  } catch(e) { return createJsonResponse(false,e.toString()); }
}

// ---- completarDescansoBanco ----
// La registra Control de Asistencia cuando confirma que el
// trabajador YA tomó el descanso compensatorio DC-xxxxxx. Pasa el
// ESTADO de la solicitud de "PENDIENTE" a "COMPLETADO" y, sobre todo,
// convierte en 'UTILIZADO' (antes 'COMPROMETIDO') los movimientos del
// banco de horas asociados a esa solicitud — así HORAS_UTILIZADAS /
// HORAS_COMPROMETIDAS en obtenerBancoHoras() reflejan la realidad
// (antes esos movimientos se quedaban en COMPROMETIDO para siempre,
// porque nada los actualizaba).
function completarDescansoBanco(params) {
  try {
    const id = params.ID_SOLICITUD_DESCANSO || params.idSolicitudDescanso;
    if (!id) return createJsonResponse(false, 'ID_SOLICITUD_DESCANSO es requerido');

    const sh = getDescansoBancoSheet_(), data = sh.getDataRange().getValues(), H = DESCANSO_BANCO_HEADERS;
    let fila = -1, estadoActual = '';
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { fila = i + 1; estadoActual = String(data[i][H.indexOf('ESTADO')] || ''); break; }
    }
    if (fila === -1) return createJsonResponse(false, 'No se encontró la solicitud de descanso ' + id);
    if (estadoActual === 'COMPLETADO') return createJsonResponse(false, 'Esta solicitud ya estaba marcada como completada');

    sh.getRange(fila, H.indexOf('ESTADO') + 1).setValue('COMPLETADO');

    const movSh = getBancoMovimientosSheet_(), movData = movSh.getDataRange().getValues(), MH = BANCO_SOBRETIEMPO_HEADERS;
    let movimientosActualizados = 0;
    for (let i = 1; i < movData.length; i++) {
      if (String(movData[i][MH.indexOf('ID_SOLICITUD_DESCANSO')]) === String(id) && movData[i][MH.indexOf('ESTADO')] === 'COMPROMETIDO') {
        movSh.getRange(i + 1, MH.indexOf('ESTADO') + 1).setValue('UTILIZADO');
        movimientosActualizados++;
      }
    }

    registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Descanso compensatorio',
      `Solicitud ${id} marcada como completada (${movimientosActualizados} movimiento(s) de banco pasaron a UTILIZADO)`, id);

    return createJsonResponse(true, 'Descanso marcado como completado', { ID_SOLICITUD_DESCANSO: id, ESTADO: 'COMPLETADO' });
  } catch (e) { return createJsonResponse(false, e.toString()); }
}

// ============================================================
// ★ AGREGAR EN Codigo_corregido.gs (3 cambios, copiar/pegar):
// ============================================================
//
// 1) En la constante WRITE_ACTIONS (línea ~59), agregar al final:
//
//    const WRITE_ACTIONS = ['create', 'update', 'delete', 'createHorario',
//      'updateHorario', 'deleteHorario',
//      'createSobretiempo', 'updateSobretiempo', 'registrarDescansoSobretiempo', 'deleteSobretiempo'];
//
// 2) En handleRequest(), dentro del switch (justo antes del "default:"),
//    agregar:
//
//    case 'createSobretiempo':
//      return createSobretiempo(params);
//    case 'updateSobretiempo':
//      return updateSobretiempo(params);
//    case 'registrarDescansoSobretiempo':
//      return registrarDescansoSobretiempo(params);
//    case 'deleteSobretiempo':
//      return deleteSobretiempo(params);
//    case 'listSobretiempo':
//      return listSobretiempo(params);
//    case 'getSobretiempo':
//      return getSobretiempo(params);
//
// 3) (Opcional) en el mensaje de "Acción no reconocida" del default,
//    añadir los nombres nuevos para que aparezcan en el listado de ayuda.
// ============================================================
// ============================================================
// ★ AGREGAR EN Codigo_corregido.gs — completarDescansoBanco
// ============================================================
// 1) En WRITE_ACTIONS, agregar 'completarDescansoBanco' (modifica
//    BD_DESCANSO_COMPENSATORIO y BD_SOBRETIEMPO_MOVIMIENTOS).
// 2) En el switch de handleRequest(), junto a 'crearSolicitudDescansoBanco':
//    case 'completarDescansoBanco':
//      return completarDescansoBanco(params);
// (Ya aplicado en este mismo Codigo_corregido.gs del proyecto.)
// ============================================================
// ============================================================
// AGREGAR AL FINAL de Codigo_Sobretiempo.gs (antes del bloque
// "★ AGREGAR EN Codigo_corregido.gs" que ya tienes al final del
// archivo).
// ============================================================
// EXPORTACIÓN DESDE PLANTILLA DE DRIVE (Sobretiempo)
// ============================================================
// Sigue EXACTAMENTE el mismo patrón que generarSolicitudHorario /
// exportarSpreadsheet_ (ya definidas en Codigo_corregido.gs, líneas
// ~1195 y ~1212): copia la plantilla real de Drive —el formato
// oficial INS-DRH-F-30.01, con su logo, bordes y estilos reales—,
// llena solo las celdas de datos y exporta la copia a Excel. El
// resultado es el documento oficial mismo, no una reconstrucción
// por código, así que no hace falta mantener estilos "a mano" como
// en la versión anterior (sobretiempo-export-xlsx.js del lado del
// navegador).
//
// Como reutiliza exportarSpreadsheet_() y el mecanismo de
// ScriptApp.getOAuthToken() que ya usa generarSolicitudHorario, NO
// hace falta agregar ningún permiso/alcance nuevo al proyecto: si
// "Solicitud de cambio de horario" ya te funciona, esto funcionará
// igual.
//
// PASOS PARA CONFIGURAR LA PLANTILLA (una sola vez):
//   1. Sube tu archivo oficial (el .xlsx con el logo y diseño
//      reales, el mismo que me compartiste) a Google Drive y
//      ábrelo como Google Sheets: clic derecho > Abrir con >
//      Google Sheets (o Archivo > Guardar como Hojas de cálculo
//      de Google si ya lo tienes abierto).
//   2. Copia el ID del archivo desde la URL:
//      https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
//      y pégalo abajo en PLANTILLA_SOBRETIEMPO_ID.
//   3. Verifica que las celdas de datos coincidan con
//      CELDAS_SOBRETIEMPO (son las mismas posiciones del formato
//      oficial que ya vimos: A9, E9, F9, B11, D11, H11, A13, C13,
//      E13, G13, A19, A23, A52, H57). Si al convertir el archivo a
//      Google Sheets alguna celda se corrió de lugar, ajusta la
//      dirección aquí — no hace falta tocar el resto del código.
//   4. La cuenta que ejecuta el Apps Script debe tener acceso de
//      Drive a la plantilla (que quede en la misma cuenta/unidad
//      del proyecto, o compártela con esa cuenta).
// ============================================================

const PLANTILLA_SOBRETIEMPO_ID = '1Fwq0qbzMGO9rB-fn6dq3Ae25xB1FgyPNcRode7tptUw';


// ---- 5) CELDAS_SOBRETIEMPO + mapeo de filas para las fechas ----
const CELDAS_SOBRETIEMPO = {
  NOMBRE: 'A9',
  ID_PERSONAL: 'E9',
  DEPENDENCIA: 'F9',
  CHECK_SOBRETIEMPO: 'B11',
  CHECK_FERIADO: 'D11',
  CHECK_DESCANSO: 'H11',
  ACTIVIDADES: 'A19',
  JUSTIFICACION: 'A23',
  OBSERVACIONES: 'A52',
  TOTAL_HORAS_EFECTIVAS: 'H57'
};
// Filas 13 a 17 del formato oficial: hasta 5 fechas de ejecución,
// cada una con columnas FECHA (A), HORA INICIO (C), HORA FIN (E) y
// TOTAL DE HORAS (G) — exactamente las posiciones que ya habíamos
// identificado (A13/C13/E13/G13, A14/C14/E14/G14, ... A17/.../G17).
const FILAS_FECHA_SOBRETIEMPO_XLSX = [13, 14, 15, 16, 17];
 

// ---- 8) generarSobretiempoXLSX ----
// La Sección III ahora se llena con TODOS los descansos registrados
// hasta el momento (aunque la solicitud siga "Descanso parcial"),
// para que el Excel refleje el avance real, no solo el estado final.
function generarSobretiempoXLSX(params) {
  try {
    const id = params.ID_SOLICITUD || params.idSolicitud;
    if (!id) return createJsonResponse(false, 'ID_SOLICITUD es requerido');
 
    const sheet = getSobretiempoSheet();
    const { row } = buscarFilaSobretiempo_(sheet, id);
    if (!row) return createJsonResponse(false, 'No se encontró la solicitud');
 
    const registro = armarObjetoSobretiempo_(row);
 
    const nombreCopia = `Sobretiempo_${id}_${Utilities.formatDate(new Date(), 'GMT-5', 'yyyyMMdd_HHmmss')}`;
    const copiaFile = DriveApp.getFileById(PLANTILLA_SOBRETIEMPO_ID).makeCopy(nombreCopia);
    const copia = SpreadsheetApp.openById(copiaFile.getId());
    const hoja = copia.getSheets()[0];
 
    hoja.getRange(CELDAS_SOBRETIEMPO.NOMBRE)
      .setValue((registro.EMPLEADO || '').replace(/\s*\([^)]*\)\s*$/, '').trim());
    hoja.getRange(CELDAS_SOBRETIEMPO.ID_PERSONAL).setValue(registro.ID_PERSONAL || '');
    hoja.getRange(CELDAS_SOBRETIEMPO.DEPENDENCIA).setValue(registro.DEPENDENCIA || '');
 
    hoja.getRange(CELDAS_SOBRETIEMPO.CHECK_SOBRETIEMPO).setValue(registro.TIPO_TRABAJO === 'Sobretiempo' ? 'X' : '');
    hoja.getRange(CELDAS_SOBRETIEMPO.CHECK_FERIADO).setValue(registro.TIPO_TRABAJO === 'Feriado' ? 'X' : '');
    hoja.getRange(CELDAS_SOBRETIEMPO.CHECK_DESCANSO).setValue(registro.TIPO_TRABAJO === 'Descanso Semanal Obligatorio' ? 'X' : '');
 
    (registro.FECHAS || []).slice(0, 5).forEach((f, i) => {
      const fila = FILAS_FECHA_SOBRETIEMPO_XLSX[i];
      hoja.getRange(`A${fila}`).setValue(f.fecha || '');
      hoja.getRange(`C${fila}`).setValue(f.horaInicio || '');
      hoja.getRange(`E${fila}`).setValue(f.horaFin || '');
      hoja.getRange(`G${fila}`).setValue(f.horas ? (f.horas + ' h') : '');
    });
 
    hoja.getRange(CELDAS_SOBRETIEMPO.ACTIVIDADES).setValue(registro.ACTIVIDADES || '');
    hoja.getRange(CELDAS_SOBRETIEMPO.JUSTIFICACION).setValue(registro.JUSTIFICACION || '');
 
    // Sección III: se llena con lo que haya, aunque sea parcial.
    if (registro.DESCANSOS && registro.DESCANSOS.length) {
      const partes = registro.DESCANSOS.map((d, i) => {
        let txt = `${i + 1}) ${d.fecha}`;
        if (d.horaInicio && d.horaFin) txt += `, de ${d.horaInicio} a ${d.horaFin}`;
        if (d.horas) txt += ` (${d.horas} h)`;
        if (d.observaciones) txt += `: ${d.observaciones}`;
        return txt;
      });
      if (registro.ESTADO === 'Descanso parcial') {
        partes.push(`Pendiente por compensar: ${registro.HORAS_PENDIENTES} h.`);
      }
      hoja.getRange(CELDAS_SOBRETIEMPO.OBSERVACIONES).setValue(partes.join(' | '));
      hoja.getRange(CELDAS_SOBRETIEMPO.TOTAL_HORAS_EFECTIVAS).setValue((registro.TOTAL_HORAS_EFECTIVAS || '') + ' h');
    }
 
    SpreadsheetApp.flush();
 
    const nombreArchivo = `Sobretiempo_${id}_${(registro.EMPLEADO || '').replace(/[^a-zA-Z0-9]+/g, '_')}`;
    const blob = exportarSpreadsheet_(copiaFile.getId(), 'xlsx').setName(`${nombreArchivo}.xlsx`);
    copiaFile.setTrashed(true);
 
    registrarAuditoria(params.__usuario, 'GENERAR', 'Sobretiempo',
      `Formato de sobretiempo generado desde plantilla (${id})`, id);
 
    return createJsonResponse(true, 'Formato generado correctamente', {
      filename: blob.getName(),
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes())
    });
 
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// 9) MIGRACIÓN ÚNICA — convierte ST-000001/ST-000002 (que ya
// pasaste por migrarSobretiempoAFechasMultiples) del viejo
// FECHA_DESCANSO/TOTAL_HORAS_EFECTIVAS/OBSERVACIONES_DESCANSO al
// nuevo DESCANSOS_JSON. Ejecuta esta función UNA vez, DESPUÉS de
// pegar todos los cambios de arriba y ANTES de volver a publicar.
// ============================================================
function migrarSobretiempoADescansosMultiples() {
  const sheet = getSobretiempoSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 1) { Logger.log('Hoja vacía, nada que migrar.'); return; }
 
  const headerActual = data[0];
  const idxFechaDescanso = headerActual.indexOf('FECHA_DESCANSO');
  if (idxFechaDescanso === -1) {
    Logger.log('La hoja ya no tiene columna FECHA_DESCANSO suelta — probablemente ya está migrada.');
    return;
  }
 
  const idxTotalEfectivas = headerActual.indexOf('TOTAL_HORAS_EFECTIVAS');
  const idxObsDescanso = headerActual.indexOf('OBSERVACIONES_DESCANSO');
  const idx = (campo) => headerActual.indexOf(campo);
 
  const nuevasFilas = [SOBRETIEMPO_HEADERS];
  let migradas = 0;
 
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
 
    const fechaDescanso = formatearFechaSoloDia(row[idxFechaDescanso]);
    const descansos = fechaDescanso ? [{
      fecha: fechaDescanso,
      horaInicio: '',
      horaFin: '',
      refrigerioInicio: '',
      refrigerioFin: '',
      horas: row[idxTotalEfectivas] || '',
      observaciones: row[idxObsDescanso] || ''
    }] : [];
 
    nuevasFilas.push([
      row[idx('ID_SOLICITUD')],
      row[idx('FECHA_REGISTRO')],
      row[idx('FECHA_ACTUALIZACION')],
      row[idx('CODE')],
      row[idx('ID_PERSONAL')],
      row[idx('EMPLEADO')],
      row[idx('DEPENDENCIA')],
      row[idx('TIPO_TRABAJO')],
      row[idx('FECHAS_JSON')],
      row[idx('TOTAL_HORAS')],
      row[idx('ACTIVIDADES')],
      row[idx('JUSTIFICACION')],
      JSON.stringify(descansos),
      row[idx('USUARIO_REGISTRO')]
    ]);
    migradas++;
  }
 
  sheet.clearContents();
  sheet.getRange(1, 1, nuevasFilas.length, SOBRETIEMPO_HEADERS.length).setValues(nuevasFilas);
  sheet.getRange(1, 1, 1, SOBRETIEMPO_HEADERS.length).setFontWeight('bold');
 
  Logger.log(`Migración completa: ${migradas} solicitud(es) convertida(s) a DESCANSOS_JSON.`);
}

 // ============================================================
// 7) MIGRACIÓN ÚNICA — convierte tus solicitudes ya creadas
// (ST-000001, ST-000002, con columnas FECHA_EJECUCION/HORA_INICIO/
// HORA_FIN sueltas) al nuevo formato FECHAS_JSON.
//
// CÓMO USARLA (una sola vez, DESPUÉS de pegar los cambios de
// arriba y ANTES de volver a publicar el Web App):
//   1. En el editor de Apps Script, selecciona esta función
//      (migrarSobretiempoAFechasMultiples) en el desplegable ▶.
//   2. Ejecútala una vez y revisa el Log (Ver > Registros).
//   3. Verifica en BD_SOBRETIEMPO que la columna FECHAS_JSON tenga
//      algo como [{"fecha":"2026-03-15","horaInicio":"18:00",...}]
//      y que ya no queden columnas HORA_INICIO/HORA_FIN sueltas.
//   4. Puedes borrar esta función después; no la usa el resto del
//      sistema una vez migrado.
// ============================================================
function migrarSobretiempoAFechasMultiples() {
  const sheet = getSobretiempoSheet();
  const data = sheet.getDataRange().getValues();
 
  if (data.length < 1) {
    Logger.log('Hoja vacía, nada que migrar.');
    return;
  }
 
  const headerActual = data[0];
  const idxFechaEj = headerActual.indexOf('FECHA_EJECUCION');
 
  if (idxFechaEj === -1) {
    Logger.log('La hoja ya no tiene columna FECHA_EJECUCION suelta — probablemente ya está migrada.');
    return;
  }
 
  const idxHoraIni = headerActual.indexOf('HORA_INICIO');
  const idxHoraFin = headerActual.indexOf('HORA_FIN');
  const idxTotalHoras = headerActual.indexOf('TOTAL_HORAS');
  const idx = (campo) => headerActual.indexOf(campo);
 
  const nuevasFilas = [SOBRETIEMPO_HEADERS];
  let migradas = 0;
 
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // fila vacía
 
    const fechas = [{
      fecha: formatearFechaSoloDia(row[idxFechaEj]),
      horaInicio: formatearHoraSoloHHMM(row[idxHoraIni]),
      horaFin: formatearHoraSoloHHMM(row[idxHoraFin]),
      refrigerioInicio: '',
      refrigerioFin: '',
      horas: row[idxTotalHoras] || ''
    }];
 
    nuevasFilas.push([
      row[idx('ID_SOLICITUD')],
      row[idx('FECHA_REGISTRO')],
      row[idx('FECHA_ACTUALIZACION')],
      row[idx('CODE')],
      row[idx('ID_PERSONAL')],
      row[idx('EMPLEADO')],
      row[idx('DEPENDENCIA')],
      row[idx('TIPO_TRABAJO')],
      JSON.stringify(fechas),
      row[idxTotalHoras] || '',
      row[idx('ACTIVIDADES')],
      row[idx('JUSTIFICACION')],
      row[idx('FECHA_DESCANSO')],
      row[idx('TOTAL_HORAS_EFECTIVAS')],
      row[idx('OBSERVACIONES_DESCANSO')],
      row[idx('USUARIO_REGISTRO')]
    ]);
    migradas++;
  }
 
  sheet.clearContents();
  sheet.getRange(1, 1, nuevasFilas.length, SOBRETIEMPO_HEADERS.length).setValues(nuevasFilas);
  sheet.getRange(1, 1, 1, SOBRETIEMPO_HEADERS.length).setFontWeight('bold');
 
  Logger.log(`Migración completa: ${migradas} solicitud(es) convertida(s) a FECHAS_JSON.`);
}
// ============================================================
// ★ AGREGAR EN Codigo_corregido.gs, dentro del switch de
// handleRequest() (junto a los otros case de Sobretiempo):
//
//    case 'generarSobretiempoXLSX':
//      return generarSobretiempoXLSX(params);
//
// No hace falta agregarlo a WRITE_ACTIONS: no modifica
// BD_SOBRETIEMPO, solo lee y genera un archivo aparte (mismo
// criterio que generarSolicitudHorario).
// ============================================================

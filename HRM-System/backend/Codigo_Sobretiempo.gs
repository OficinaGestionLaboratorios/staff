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

    sheet.deleteRow(fila);

    registrarAuditoria(params.__usuario, 'ELIMINAR', 'Sobretiempo',
      `Solicitud de sobretiempo eliminada de ${row[5] || row[3]} (${id})`, id);

    return createJsonResponse(true, 'Solicitud eliminada correctamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ---- 7) armarObjetoSobretiempo_ ----
function armarObjetoSobretiempo_(row) {
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
 
  const fechaReferencia = fechas.length ? fechas.map(f => f.fecha).sort().slice(-1)[0] : '';
  const totalHoras = get('TOTAL_HORAS') || '0';
  const totalHorasEfectivas = descansos.reduce((acc, d) => acc + (parseFloat(d.horas) || 0), 0).toFixed(2);
  const horasPendientes = Math.max((parseFloat(totalHoras) || 0) - parseFloat(totalHorasEfectivas), 0).toFixed(2);
  const fechaUltimoDescanso = descansos.length ? descansos.map(d => d.fecha).sort().slice(-1)[0] : '';
 
  const obj = {
    ID_SOLICITUD: get('ID_SOLICITUD'),
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
    DESCANSOS: descansos,             // arreglo de descansos ya registrados
    FECHA_DESCANSO: fechaUltimoDescanso, // compatibilidad (última fecha de descanso)
    TOTAL_HORAS_EFECTIVAS: totalHorasEfectivas, // suma de todos los descansos
    HORAS_PENDIENTES: horasPendientes,
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

    const resultado = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      if (code && String(data[i][3]) !== String(code)) continue;
      resultado.push(armarObjetoSobretiempo_(data[i]));
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

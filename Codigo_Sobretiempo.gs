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

const SOBRETIEMPO_HEADERS = [
  'ID_SOLICITUD', 'FECHA_REGISTRO', 'FECHA_ACTUALIZACION',
  'CODE', 'ID_PERSONAL', 'EMPLEADO', 'DEPENDENCIA',
  'TIPO_TRABAJO', 'FECHA_EJECUCION', 'HORA_INICIO', 'HORA_FIN', 'TOTAL_HORAS',
  'ACTIVIDADES', 'JUSTIFICACION',
  'FECHA_DESCANSO', 'TOTAL_HORAS_EFECTIVAS', 'OBSERVACIONES_DESCANSO',
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

// ESTADO se calcula siempre al leer (nunca se guarda), igual que
// calcularEstadoHorario: la fuente de verdad es si ya tiene
// FECHA_DESCANSO registrada, no un campo aparte que se pueda
// desincronizar.
function calcularEstadoSobretiempo(fechaDescanso) {
  return fechaDescanso ? 'Completo' : 'Pendiente de descanso';
}

function validarFase1Sobretiempo(params) {
  if (!params.CODE) return { error: 'CODE del empleado es requerido' };
  if (!params.TIPO_TRABAJO) return { error: 'Debe indicar el tipo de trabajo' };
  if (!params.FECHA_EJECUCION) return { error: 'La fecha de ejecución de labores es requerida' };
  if (!params.HORA_INICIO || !params.HORA_FIN) return { error: 'La hora de inicio y de fin son requeridas' };
  if (!params.ACTIVIDADES) return { error: 'Debe indicar las actividades a realizar' };
  if (!params.JUSTIFICACION) return { error: 'Debe indicar la justificación de la necesidad' };
  return { ok: true };
}

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
    params.FECHA_EJECUCION,
    params.HORA_INICIO,
    params.HORA_FIN,
    params.TOTAL_HORAS || '',
    params.ACTIVIDADES,
    params.JUSTIFICACION,
    params.FECHA_DESCANSO || '',
    params.TOTAL_HORAS_EFECTIVAS || '',
    params.OBSERVACIONES_DESCANSO || '',
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

// ---- Editar los datos de Fase 1 (antes de registrar el descanso) ----
function updateSobretiempo(params) {
  try {
    const id = params.ID_SOLICITUD || params.idSolicitud;
    if (!id) return createJsonResponse(false, 'ID_SOLICITUD es requerido para actualizar');

    const validacion = validarFase1Sobretiempo(params);
    if (validacion.error) return createJsonResponse(false, validacion.error);

    const sheet = getSobretiempoSheet();
    const { fila, row } = buscarFilaSobretiempo_(sheet, id);
    if (fila === -1) return createJsonResponse(false, 'No se encontró la solicitud a actualizar');

    // No se permite editar Fase 1 si ya se registró el descanso (fila[14]
    // = FECHA_DESCANSO): a esa altura la solicitud ya está "Completa" y
    // cualquier corrección debe hacerse eliminando y volviendo a crear,
    // para no dejar un Excel ya exportado desincronizado en silencio.
    if (row[14]) {
      return createJsonResponse(false, 'No se puede editar: esta solicitud ya tiene registrado el descanso compensatorio');
    }

    const fechaRegistroOriginal = row[1];
    const ahora = new Date();
    const nuevaFila = filaSobretiempo(id, fechaRegistroOriginal, ahora, params);
    sheet.getRange(fila, 1, 1, SOBRETIEMPO_HEADERS.length).setValues([nuevaFila]);

    registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Sobretiempo',
      `Solicitud de sobretiempo actualizada para ${params.EMPLEADO || params.CODE} (${id})`, id);

    return createJsonResponse(true, 'Solicitud actualizada correctamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ---- FASE 2: registrar el descanso compensatorio ----
function registrarDescansoSobretiempo(params) {
  try {
    const id = params.ID_SOLICITUD || params.idSolicitud;
    if (!id) return createJsonResponse(false, 'ID_SOLICITUD es requerido');
    if (!params.FECHA_DESCANSO) return createJsonResponse(false, 'La fecha de descanso es requerida');
    if (!params.TOTAL_HORAS_EFECTIVAS) return createJsonResponse(false, 'El total de horas efectivas es requerido');

    const sheet = getSobretiempoSheet();
    const { fila, row } = buscarFilaSobretiempo_(sheet, id);
    if (fila === -1) return createJsonResponse(false, 'No se encontró la solicitud');

    const HEAD = SOBRETIEMPO_HEADERS;
    row[HEAD.indexOf('FECHA_DESCANSO')] = params.FECHA_DESCANSO;
    row[HEAD.indexOf('TOTAL_HORAS_EFECTIVAS')] = params.TOTAL_HORAS_EFECTIVAS;
    row[HEAD.indexOf('OBSERVACIONES_DESCANSO')] = params.OBSERVACIONES_DESCANSO || '';
    row[HEAD.indexOf('FECHA_ACTUALIZACION')] = new Date();

    sheet.getRange(fila, 1, 1, HEAD.length).setValues([row]);

    registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Sobretiempo',
      `Descanso compensatorio registrado (${params.FECHA_DESCANSO}) — solicitud completa (${id})`, id);

    return createJsonResponse(true, 'Descanso registrado. La solicitud queda completa y lista para exportar.');

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

function armarObjetoSobretiempo_(row) {
  const HEAD = SOBRETIEMPO_HEADERS;
  const get = (campo) => row[HEAD.indexOf(campo)];

  const obj = {
    ID_SOLICITUD: get('ID_SOLICITUD'),
    FECHA_REGISTRO: get('FECHA_REGISTRO') instanceof Date ? get('FECHA_REGISTRO').toISOString() : (get('FECHA_REGISTRO') || ''),
    FECHA_ACTUALIZACION: get('FECHA_ACTUALIZACION') instanceof Date ? get('FECHA_ACTUALIZACION').toISOString() : (get('FECHA_ACTUALIZACION') || ''),
    CODE: get('CODE') || '',
    ID_PERSONAL: get('ID_PERSONAL') || '',
    EMPLEADO: get('EMPLEADO') || '',
    DEPENDENCIA: get('DEPENDENCIA') || '',
    TIPO_TRABAJO: get('TIPO_TRABAJO') || '',
    FECHA_EJECUCION: formatearFechaSoloDia(get('FECHA_EJECUCION')),
    HORA_INICIO: formatearHoraSoloHHMM(get('HORA_INICIO')),
    HORA_FIN: formatearHoraSoloHHMM(get('HORA_FIN')),
    TOTAL_HORAS: get('TOTAL_HORAS') || '',
    ACTIVIDADES: get('ACTIVIDADES') || '',
    JUSTIFICACION: get('JUSTIFICACION') || '',
    FECHA_DESCANSO: formatearFechaSoloDia(get('FECHA_DESCANSO')),
    TOTAL_HORAS_EFECTIVAS: get('TOTAL_HORAS_EFECTIVAS') || '',
    OBSERVACIONES_DESCANSO: get('OBSERVACIONES_DESCANSO') || '',
    USUARIO_REGISTRO: get('USUARIO_REGISTRO') || ''
  };
  obj.ESTADO = calcularEstadoSobretiempo(obj.FECHA_DESCANSO);
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

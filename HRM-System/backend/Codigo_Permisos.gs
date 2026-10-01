// ============================================================
// CODIGO_PERMISOS.GS — Backend del módulo Permisos
// ============================================================
// Mismo patrón que Codigo_Sobretiempo.gs: comparte automáticamente
// todas las funciones globales de Codigo_corrregido.gs
// (getSpreadsheet, registrarAuditoria, createJsonResponse,
// buscarEmpleadoPorCode_, exportarSpreadsheet_, formatearFechaSoloDia,
// formatearHoraSoloHHMM, parseFechaLocal, etc.) con solo pegar este
// archivo en el mismo proyecto de Apps Script.
//
// A diferencia de Sobretiempo, un Permiso es de UNA SOLA FASE: el
// jefe autoriza la salida con su hora de retorno prevista y ya
// queda registrado — no hay una segunda parte que confirmar después
// (así lo definimos: ver "Hora de Retorno" única en la boleta).
//
// INSTALACIÓN (una sola vez, en el editor de Apps Script):
//   1. Crea un archivo nuevo llamado "Codigo_Permisos" y pega TODO
//      este contenido.
//   2. En Codigo_corrregido.gs deben estar los case 'createPermiso',
//      'updatePermiso', 'deletePermiso', 'listPermisos' y 'getPermiso'
//      (y 'createPermiso'/'updatePermiso'/'deletePermiso' en
//      WRITE_ACTIONS) apuntando a las funciones de este archivo.
//   3. Vuelve a publicar (Implementar > Administrar implementaciones
//      > Editar > Nueva versión).
//
// La boleta ya NO se genera desde una plantilla de Sheets en Drive:
// se arma directamente como .docx en el navegador (ver
// js/permisos/permisos-export-docx.js), replicando el formato de
// PAPELETAS_DE_PERMISO.docx. Este backend solo guarda/lista los
// registros de BD_PERMISOS.
// ============================================================

const PERMISOS_SHEET_NAME = 'BD_PERMISOS';

const PERMISOS_HEADERS = [
  'ID_PERMISO', 'FECHA_REGISTRO', 'FECHA_ACTUALIZACION',
  'CODE', 'ID_PERSONAL', 'EMPLEADO', 'DEPENDENCIA',
  'FUNCIONARIO_EXPIDE', 'CARGO_FUNCIONARIO',
  'FECHA_PERMISO', 'HORA_SALIDA', 'HORA_RETORNO', 'DURACION_TOTAL',
  'MOTIVO_SALIDA',
  'CLASE_PERMISO', 'OTRA_ESPECIFICAR',
  'LUGAR_DESTINO',
  'USUARIO_REGISTRO'
];

function getPermisosSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(PERMISOS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(PERMISOS_SHEET_NAME);
    sheet.appendRow(PERMISOS_HEADERS);
    sheet.getRange(1, 1, 1, PERMISOS_HEADERS.length).setFontWeight('bold');
  }

  return sheet;
}

// Genera el siguiente ID_PERMISO secuencial: PM-000001, PM-000002...
function generarSiguienteIdPermiso(data) {
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '');
    const match = id.match(/^PM-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return 'PM-' + String(maxNum + 1).padStart(6, '0');
}

// ESTADO se calcula siempre al leer (nunca se guarda), igual que
// calcularEstadoHorario: compara la fecha del permiso contra hoy.
// Es solo informativo (a diferencia de Sobretiempo, aquí no bloquea
// ninguna acción — un permiso se puede editar o eliminar en
// cualquier momento).
function calcularEstadoPermiso(fechaPermiso) {
  if (!fechaPermiso) return 'Programado';
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  const fecha = parseFechaLocal(fechaPermiso);
  if (!fecha) return 'Programado';
  if (fecha > hoy) return 'Programado';
  if (fecha < hoy) return 'Histórico';
  return 'Vigente';
}

function validarPermiso(params) {
  if (!params.CODE) return { error: 'CODE del empleado es requerido' };
  if (!params.FUNCIONARIO_EXPIDE) return { error: 'El funcionario que expide la boleta es requerido' };
  if (!params.FECHA_PERMISO) return { error: 'La fecha del permiso es requerida' };
  if (!params.HORA_SALIDA || !params.HORA_RETORNO) return { error: 'La hora de salida y de retorno son requeridas' };
  if (!params.MOTIVO_SALIDA) return { error: 'El motivo de la salida es requerido' };
  if (!params.CLASE_PERMISO) return { error: 'Debe indicar la clase de permiso' };
  if (params.CLASE_PERMISO === 'Otra' && !params.OTRA_ESPECIFICAR) {
    return { error: 'Debe especificar la clase de permiso ("Otra")' };
  }
  if (params.CLASE_PERMISO === 'Comisión de Servicio' && !params.LUGAR_DESTINO) {
    return { error: 'Debe indicar el lugar de destino de la comisión de servicio' };
  }
  return { ok: true };
}

function filaPermiso(id, fechaRegistro, fechaActualizacion, params) {
  return [
    id,
    fechaRegistro,
    fechaActualizacion,
    params.CODE,
    params.ID_PERSONAL || '',
    params.EMPLEADO || '',
    params.DEPENDENCIA || '',
    params.FUNCIONARIO_EXPIDE,
    params.CARGO_FUNCIONARIO || '',
    params.FECHA_PERMISO,
    params.HORA_SALIDA,
    params.HORA_RETORNO,
    params.DURACION_TOTAL || '',
    params.MOTIVO_SALIDA,
    params.CLASE_PERMISO,
    params.OTRA_ESPECIFICAR || '',
    params.LUGAR_DESTINO || '',
    params.__usuario || ''
  ];
}

// ---- Crear ----
function createPermiso(params) {
  try {
    const validacion = validarPermiso(params);
    if (validacion.error) return createJsonResponse(false, validacion.error);

    const sheet = getPermisosSheet();
    const data = sheet.getDataRange().getValues();
    const id = generarSiguienteIdPermiso(data);
    const ahora = new Date();

    sheet.appendRow(filaPermiso(id, ahora, ahora, params));

    registrarAuditoria(params.__usuario, 'CREAR', 'Permisos',
      `Boleta de permiso registrada para ${params.EMPLEADO || params.CODE} — ${params.FECHA_PERMISO} (${id})`, id);

    return createJsonResponse(true, 'Boleta de permiso registrada correctamente', { ID_PERMISO: id });

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

function buscarFilaPermiso_(sheet, idPermiso) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(idPermiso)) return { fila: i + 1, row: data[i] };
  }
  return { fila: -1, row: null };
}

// ---- Editar (sin restricciones: un permiso es de una sola fase) ----
function updatePermiso(params) {
  try {
    const id = params.ID_PERMISO || params.idPermiso;
    if (!id) return createJsonResponse(false, 'ID_PERMISO es requerido para actualizar');

    const validacion = validarPermiso(params);
    if (validacion.error) return createJsonResponse(false, validacion.error);

    const sheet = getPermisosSheet();
    const { fila, row } = buscarFilaPermiso_(sheet, id);
    if (fila === -1) return createJsonResponse(false, 'No se encontró la boleta a actualizar');

    const HEAD = PERMISOS_HEADERS;
    const fechaRegistroOriginal = row[HEAD.indexOf('FECHA_REGISTRO')];
    const ahora = new Date();
    const nuevaFila = filaPermiso(id, fechaRegistroOriginal, ahora, params);
    sheet.getRange(fila, 1, 1, HEAD.length).setValues([nuevaFila]);

    registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Permisos',
      `Boleta de permiso actualizada para ${params.EMPLEADO || params.CODE} (${id})`, id);

    return createJsonResponse(true, 'Boleta actualizada correctamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

function deletePermiso(params) {
  try {
    const id = params.ID_PERMISO || params.idPermiso;
    if (!id) return createJsonResponse(false, 'ID_PERMISO es requerido');

    const sheet = getPermisosSheet();
    const { fila, row } = buscarFilaPermiso_(sheet, id);
    if (fila === -1) return createJsonResponse(false, 'No se encontró la boleta a eliminar');

    sheet.deleteRow(fila);

    registrarAuditoria(params.__usuario, 'ELIMINAR', 'Permisos',
      `Boleta de permiso eliminada de ${row[5] || row[3]} (${id})`, id);

    return createJsonResponse(true, 'Boleta eliminada correctamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

function armarObjetoPermiso_(row) {
  const HEAD = PERMISOS_HEADERS;
  const get = (campo) => row[HEAD.indexOf(campo)];

  const obj = {
    ID_PERMISO: get('ID_PERMISO'),
    FECHA_REGISTRO: get('FECHA_REGISTRO') instanceof Date ? get('FECHA_REGISTRO').toISOString() : (get('FECHA_REGISTRO') || ''),
    FECHA_ACTUALIZACION: get('FECHA_ACTUALIZACION') instanceof Date ? get('FECHA_ACTUALIZACION').toISOString() : (get('FECHA_ACTUALIZACION') || ''),
    CODE: get('CODE') || '',
    ID_PERSONAL: get('ID_PERSONAL') || '',
    EMPLEADO: get('EMPLEADO') || '',
    DEPENDENCIA: get('DEPENDENCIA') || '',
    FUNCIONARIO_EXPIDE: get('FUNCIONARIO_EXPIDE') || '',
    CARGO_FUNCIONARIO: get('CARGO_FUNCIONARIO') || '',
    FECHA_PERMISO: formatearFechaSoloDia(get('FECHA_PERMISO')),
    HORA_SALIDA: formatearHoraSoloHHMM(get('HORA_SALIDA')),
    HORA_RETORNO: formatearHoraSoloHHMM(get('HORA_RETORNO')),
    DURACION_TOTAL: get('DURACION_TOTAL') || '',
    MOTIVO_SALIDA: get('MOTIVO_SALIDA') || '',
    CLASE_PERMISO: get('CLASE_PERMISO') || '',
    OTRA_ESPECIFICAR: get('OTRA_ESPECIFICAR') || '',
    LUGAR_DESTINO: get('LUGAR_DESTINO') || '',
    USUARIO_REGISTRO: get('USUARIO_REGISTRO') || ''
  };
  obj.ESTADO = calcularEstadoPermiso(obj.FECHA_PERMISO);
  return obj;
}

// Lista las boletas, opcionalmente filtradas por CODE de empleado
// (mismo criterio que listSobretiempo).
function listPermisos(params) {
  try {
    const sheet = getPermisosSheet();
    const data = sheet.getDataRange().getValues();
    const code = getCodeParam(params);

    const resultado = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      if (code && String(data[i][3]) !== String(code)) continue;
      resultado.push(armarObjetoPermiso_(data[i]));
    }

    resultado.sort((a, b) => String(b.FECHA_PERMISO).localeCompare(String(a.FECHA_PERMISO)));

    return createJsonResponse(true, 'Boletas obtenidas', resultado);
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

function getPermiso(params) {
  try {
    const id = params.ID_PERMISO || params.idPermiso;
    if (!id) return createJsonResponse(false, 'ID_PERMISO es requerido');

    const sheet = getPermisosSheet();
    const { row } = buscarFilaPermiso_(sheet, id);
    if (!row) return createJsonResponse(false, 'No se encontró la boleta');

    return createJsonResponse(true, 'Boleta obtenida', armarObjetoPermiso_(row));
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}


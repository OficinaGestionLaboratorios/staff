// ============================================================
// CONFIGURACIÓN DE LA BASE DE DATOS
// ============================================================

// ============================================================
// SPREADSHEET: detección automática (portable entre cuentas)
// ============================================================
// Antes este archivo dependía de un SPREADSHEET_ID fijo, lo que
// obligaba a editar código cada vez que el proyecto se movía o se
// copiaba a otra cuenta de Google (típico al migrar de una hoja de
// una organización a una cuenta personal). Como este .gs vive
// "atado" (bound) al propio Spreadsheet -se abre desde Extensiones
// → Apps Script del mismo Sheet-, se puede detectar automáticamente
// con SpreadsheetApp.getActiveSpreadsheet(), sin necesidad de ID.
//
// SPREADSHEET_ID_FALLBACK solo se usa si por alguna razón el script
// se ejecuta como proyecto independiente (standalone, no atado a
// ningún Sheet) y getActiveSpreadsheet() no encuentra nada. Déjalo
// vacío si no lo necesitas.
const SPREADSHEET_ID_FALLBACK = '';

function getSpreadsheet() {
  const activo = SpreadsheetApp.getActiveSpreadsheet();
  if (activo) return activo;

  if (SPREADSHEET_ID_FALLBACK) {
    return SpreadsheetApp.openById(SPREADSHEET_ID_FALLBACK);
  }

  throw new Error('No se pudo detectar el Spreadsheet. Este script debe estar vinculado a un Sheet (Extensiones → Apps Script), o definir SPREADSHEET_ID_FALLBACK.');
}

// ============================================================
// MÓDULOS DE DATOS
// ============================================================
// PERSONAL  -> hoja "tabla"        (getEmployees/createEmployee/...)
// HORARIOS  -> hoja "BD_HORARIOS"  (getHorariosAgrupados/createHorario/...)
// Son dos hojas completamente independientes: un error en la lógica
// de Horarios nunca puede corromper el CRUD de Personal, y viceversa.
// ============================================================
const SHEET_NAME = 'tabla';
const HORARIOS_SHEET_NAME = 'BD_HORARIOS';

// ============================================================
// SEGURIDAD - API KEY (defensa en profundidad, ver también el
// bloque "LOGIN / SESIONES / AUDITORÍA" más abajo)
// ============================================================
// Clave compartida que el frontend debe enviar en el parámetro
// "key" para poder CREAR, ACTUALIZAR o ELIMINAR registros. Desde que
// se agregó el login (más abajo), la lectura YA NO está abierta:
// TODA acción exige además una sesión válida. Esta API_KEY queda
// como una segunda capa sobre las escrituras.
//
// IMPORTANTE: cambia este valor por uno propio y no lo publiques
// en repositorios públicos.
// ============================================================
const API_KEY = 'wleong';

const WRITE_ACTIONS = ['create', 'update', 'delete', 'createHorario', 'updateHorario', 'deleteHorario',
  'createSobretiempo', 'updateSobretiempo', 'registrarDescansoSobretiempo', 'deleteSobretiempo'];

// ============================================================
// SEGURIDAD - LOGIN / SESIONES / AUDITORÍA
// ============================================================
// A partir de esta versión, TODA acción (incluida la simple lectura
// "list"/"listHorarios") exige haber iniciado sesión. El login se
// valida contra la hoja BD_USUARIOS (se autogenera con un usuario
// "admin" de ejemplo la primera vez que se usa - ver getUsersSheet).
//
// El "token" de sesión que recibe el frontend tras un login exitoso
// se guarda en CacheService (memoria del lado servidor, nunca en la
// hoja), con una duración máxima de SESSION_DURATION_SEC segundos.
// Pasado ese tiempo, o si se llama a "logout", el token deja de ser
// válido y hay que volver a iniciar sesión.
//
// IMPORTANTE: cambia la contraseña del usuario "admin" de ejemplo
// apenas despliegues esto (usa la acción "cambiarPassword" desde la
// propia interfaz, en el menú de usuario).
// ============================================================
const USERS_SHEET_NAME = 'BD_USUARIOS';
const AUDIT_SHEET_NAME = 'BD_AUDITORIA';
const SESSION_DURATION_SEC = 6 * 60 * 60; // 6 horas
const SESSION_CACHE_PREFIX = 'sess_';

const USERS_HEADERS = ['USUARIO', 'SALT', 'PASSWORD_HASH', 'NOMBRE', 'ROL', 'ACTIVO', 'FECHA_CREACION', 'ULTIMO_ACCESO'];
const AUDIT_HEADERS = ['FECHA', 'USUARIO', 'ACCION', 'MODULO', 'DETALLE', 'ID_AFECTADO'];

// Acciones que no requieren sesión iniciada (solo "login"; el resto,
// incluida la lectura, queda detrás del acceso).
const PUBLIC_ACTIONS = ['login'];

function sha256Hex(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(b => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function hashPassword(password, salt) {
  return sha256Hex(salt + '::' + password);
}

// Crea BD_USUARIOS con sus encabezados y un usuario "admin" de
// ejemplo (contraseña "admin123") si la hoja aún no existe. Igual
// que BD_HORARIOS, se autogenera para no depender de un paso manual.
function getUsersSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    sheet.appendRow(USERS_HEADERS);
    sheet.getRange(1, 1, 1, USERS_HEADERS.length).setFontWeight('bold');

    const saltInicial = Utilities.getUuid();
    sheet.appendRow([
      'admin',
      saltInicial,
      hashPassword('admin123', saltInicial),
      'Administrador',
      'admin',
      true,
      new Date(),
      ''
    ]);
  }

  return sheet;
}

function buscarUsuario(usuario) {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(usuario).toLowerCase()) {
      return { rowIndex: i + 1, data: data[i] };
    }
  }
  return null;
}

function getAuditSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(AUDIT_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(AUDIT_SHEET_NAME);
    sheet.appendRow(AUDIT_HEADERS);
    sheet.getRange(1, 1, 1, AUDIT_HEADERS.length).setFontWeight('bold');
  }

  return sheet;
}

// Registra una fila en BD_AUDITORIA. Se llama SIEMPRE del lado
// servidor (nunca confía en el frontend), justo después de que una
// operación de escritura (o un login/logout) se completó con éxito,
// para que exista un historial de "quién hizo qué y cuándo" visible
// para la interfaz (antes esto solo se podía ver revisando a mano
// los cambios en la hoja de datos, sin ningún registro dedicado).
function registrarAuditoria(usuario, accion, modulo, detalle, idAfectado) {
  try {
    const sheet = getAuditSheet();
    sheet.appendRow([new Date(), usuario || 'desconocido', accion, modulo, detalle || '', idAfectado || '']);
  } catch (error) {
    // La auditoría nunca debe tumbar la operación principal.
    Logger.log('No se pudo registrar auditoría: ' + error);
  }
}

function crearTokenSesion(usuarioObj) {
  const token = Utilities.getUuid();
  const payload = JSON.stringify({
    usuario: usuarioObj.usuario,
    nombre: usuarioObj.nombre,
    rol: usuarioObj.rol
  });
  CacheService.getScriptCache().put(SESSION_CACHE_PREFIX + token, payload, SESSION_DURATION_SEC);
  return token;
}

function obtenerSesion(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get(SESSION_CACHE_PREFIX + token);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function eliminarSesion(token) {
  if (!token) return;
  CacheService.getScriptCache().remove(SESSION_CACHE_PREFIX + token);
}

// ============================================================
// LOGIN / LOGOUT / CAMBIO DE CONTRASEÑA
// ============================================================

function login(params) {
  try {
    const usuario = String(params.usuario || '').trim();
    const password = String(params.password || '');

    if (!usuario || !password) {
      return createJsonResponse(false, 'Usuario y contraseña son requeridos');
    }

    const encontrado = buscarUsuario(usuario);
    if (!encontrado) {
      registrarAuditoria(usuario, 'LOGIN_FALLIDO', 'Sistema', 'Usuario no encontrado');
      return createJsonResponse(false, 'Usuario o contraseña incorrectos');
    }

    const [usuarioGuardado, salt, hashGuardado, nombre, rol, activo] = encontrado.data;

    if (activo === false || String(activo).toUpperCase() === 'NO' || String(activo).toUpperCase() === 'FALSE') {
      registrarAuditoria(usuario, 'LOGIN_FALLIDO', 'Sistema', 'Usuario inactivo');
      return createJsonResponse(false, 'Este usuario está inactivo. Contacta al administrador');
    }

    if (hashPassword(password, salt) !== hashGuardado) {
      registrarAuditoria(usuario, 'LOGIN_FALLIDO', 'Sistema', 'Contraseña incorrecta');
      return createJsonResponse(false, 'Usuario o contraseña incorrectos');
    }

    const usuarioObj = { usuario: usuarioGuardado, nombre: nombre || usuarioGuardado, rol: rol || 'usuario' };
    const token = crearTokenSesion(usuarioObj);

    const sheet = getUsersSheet();
    sheet.getRange(encontrado.rowIndex, USERS_HEADERS.indexOf('ULTIMO_ACCESO') + 1).setValue(new Date());

    registrarAuditoria(usuarioObj.usuario, 'LOGIN', 'Sistema', 'Inicio de sesión correcto');

    return createJsonResponse(true, 'Sesión iniciada correctamente', {
      token,
      usuario: usuarioObj.usuario,
      nombre: usuarioObj.nombre,
      rol: usuarioObj.rol,
      expiraEnSegundos: SESSION_DURATION_SEC
    });

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

function logout(params) {
  const sesion = obtenerSesion(params.token);
  eliminarSesion(params.token);
  if (sesion) {
    registrarAuditoria(sesion.usuario, 'LOGOUT', 'Sistema', 'Cierre de sesión');
  }
  return createJsonResponse(true, 'Sesión cerrada');
}

function cambiarPassword(params) {
  try {
    const sesion = obtenerSesion(params.token);
    if (!sesion) return createJsonResponse(false, 'Sesión inválida o expirada');

    const passwordActual = String(params.passwordActual || '');
    const passwordNueva = String(params.passwordNueva || '');

    if (!passwordActual || !passwordNueva) {
      return createJsonResponse(false, 'Debes indicar la contraseña actual y la nueva');
    }
    if (passwordNueva.length < 6) {
      return createJsonResponse(false, 'La nueva contraseña debe tener al menos 6 caracteres');
    }

    const encontrado = buscarUsuario(sesion.usuario);
    if (!encontrado) return createJsonResponse(false, 'Usuario no encontrado');

    const [, salt, hashGuardado] = encontrado.data;
    if (hashPassword(passwordActual, salt) !== hashGuardado) {
      return createJsonResponse(false, 'La contraseña actual es incorrecta');
    }

    const nuevoSalt = Utilities.getUuid();
    const sheet = getUsersSheet();
    sheet.getRange(encontrado.rowIndex, USERS_HEADERS.indexOf('SALT') + 1).setValue(nuevoSalt);
    sheet.getRange(encontrado.rowIndex, USERS_HEADERS.indexOf('PASSWORD_HASH') + 1).setValue(hashPassword(passwordNueva, nuevoSalt));

    registrarAuditoria(sesion.usuario, 'CAMBIO_PASSWORD', 'Sistema', 'Cambio de contraseña propio');

    return createJsonResponse(true, 'Contraseña actualizada correctamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// Lista el historial de actividad (BD_AUDITORIA), más reciente
// primero. Admite filtros opcionales: modulo, usuario, q (busca en
// DETALLE/ID_AFECTADO) y limit (por defecto 300, tope 1000). Esta es
// la función que alimenta el panel "Actividad" de la interfaz, para
// que create/update/delete de Personal y Horarios dejen de ser
// visibles SOLO en la hoja de cálculo.
function listarAuditoria(params) {
  try {
    const sheet = getAuditSheet();
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return createJsonResponse(true, 'Sin actividad registrada', []);
    }

    const filtroModulo = (params.modulo || '').toLowerCase();
    const filtroUsuario = (params.usuario || '').toLowerCase();
    const filtroQ = (params.q || '').toLowerCase();
    const limit = Math.min(parseInt(params.limit, 10) || 300, 1000);

    const registros = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const fecha = row[0] instanceof Date ? row[0].toISOString() : String(row[0] || '');
      const usuario = String(row[1] || '');
      const accion = String(row[2] || '');
      const modulo = String(row[3] || '');
      const detalle = String(row[4] || '');
      const idAfectado = String(row[5] || '');

      if (filtroModulo && modulo.toLowerCase() !== filtroModulo) continue;
      if (filtroUsuario && usuario.toLowerCase() !== filtroUsuario) continue;
      if (filtroQ && !(detalle.toLowerCase().includes(filtroQ) || idAfectado.toLowerCase().includes(filtroQ) || usuario.toLowerCase().includes(filtroQ))) continue;

      registros.push({ FECHA: fecha, USUARIO: usuario, ACCION: accion, MODULO: modulo, DETALLE: detalle, ID_AFECTADO: idAfectado });
    }

    registros.reverse(); // más reciente primero
    return createJsonResponse(true, 'Actividad obtenida exitosamente', registros.slice(0, limit));

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// MANEJADOR GET / POST
// ============================================================
// NOTA: El frontend (js/api.js) hace fetch(url) sin especificar
// method, lo que en el navegador siempre es GET. Por eso ambos
// manejadores delegan a la misma función handleRequest, evitando
// duplicar el switch de acciones (antes doGet y doPost repetían
// exactamente la misma lógica).
// ============================================================
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  if (!e) e = { parameter: { action: 'list' } };
  const params = e.parameter || {};
  const action = params.action || 'list';

  // Acceso: TODA acción salvo "login" exige una sesión válida (ver
  // SEGURIDAD - LOGIN / SESIONES arriba). Esto es lo que impide que
  // se pueda leer o escribir CUALQUIER dato sin haber iniciado
  // sesión antes desde la pantalla de acceso de la SPA.
  if (PUBLIC_ACTIONS.indexOf(action) === -1) {
    const sesion = obtenerSesion(params.token);
    if (!sesion) {
      return createJsonResponse(false, 'Sesión inválida o expirada. Vuelve a iniciar sesión.');
    }
    // Se adjunta a params para que las funciones de escritura puedan
    // dejar constancia de QUIÉN hizo el cambio en BD_AUDITORIA.
    params.__usuario = sesion.usuario;
  }

  // Protección adicional: las acciones de escritura además requieren
  // la API key (defensa en profundidad junto con la sesión).
  if (WRITE_ACTIONS.indexOf(action) !== -1) {
    if (!params.key || params.key !== API_KEY) {
      return createJsonResponse(false, 'No autorizado: clave de API inválida o faltante');
    }
  }

  switch (action) {
    case 'login':
      return login(params);
    case 'logout':
      return logout(params);
    case 'cambiarPassword':
      return cambiarPassword(params);
    case 'listAuditoria':
      return listarAuditoria(params);
    case 'list':
      return getEmployees();
    case 'create':
      return createEmployee(params);
    case 'update':
      return updateEmployee(params);
    case 'delete':
      return deleteEmployee(params);
    case 'createHorario':
      return createHorario(params);
    case 'updateHorario':
      return updateHorario(params);
    case 'deleteHorario':
      return deleteHorario(params);
    case 'listHorarios':
      return getHorariosAgrupados(params);
    case 'getHorarioGrupo':
      return getHorarioGrupo(params);
    case 'generarSolicitudHorario': 
      return generarSolicitudHorario(params);

    // ---- Módulo Sobretiempo (ver Codigo_Sobretiempo.gs) ----
    case 'createSobretiempo':
      return createSobretiempo(params);
    case 'updateSobretiempo':
      return updateSobretiempo(params);
    case 'registrarDescansoSobretiempo':
      return registrarDescansoSobretiempo(params);
    case 'deleteSobretiempo':
      return deleteSobretiempo(params);
    case 'listSobretiempo':
      return listSobretiempo(params);
    case 'getSobretiempo':
      return getSobretiempo(params);

    default:
      return createJsonResponse(false, 'Acción no reconocida. Acciones disponibles: login, logout, cambiarPassword, listAuditoria, list, create, update, delete, createHorario, updateHorario, deleteHorario, listHorarios, getHorarioGrupo, generarSolicitudHorario, createSobretiempo, updateSobretiempo, registrarDescansoSobretiempo, deleteSobretiempo, listSobretiempo, getSobretiempo');
  }
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function createJsonResponse(success, message, data = null) {
  const response = { success, message };
  if (data !== null) {
    response.data = data;
  }
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error(`Hoja "${SHEET_NAME}" no encontrada`);
  }

  return sheet;
}

// Columna O = HORAS_SEMANA (horas totales), columna P = OBSERVACION.
// OBSERVACION va AL FINAL a propósito para que un texto largo (o con
// coma/salto de línea) nunca quede "en medio" de las columnas de
// horas — así ninguna columna numérica/de hora se corre si alguien
// escribe una observación larga.
const HORARIOS_HEADERS = [
  'ID_GRUPO', 'FECHA_REGISTRO', 'FECHA_ACTUALIZACION', 'CODE', 'ID_PERSONAL', 'EMPLEADO',
  'FECHA_INICIO', 'FECHA_FIN', 'DIA', 'HORA_INGRESO', 'INICIO_REFRIGERIO', 'FIN_REFRIGERIO',
  'HORA_SALIDA', 'HORAS_DIA', 'HORAS_SEMANA', 'OBSERVACION'
];
// ID_GRUPO (formato "HG-000001") agrupa las filas (una por día) que
// pertenecen a un mismo horario semanal. Es la clave que permite
// tratar ese conjunto de filas como UNA sola entidad lógica al
// editar, eliminar o mostrar en la lista de horarios, aunque en la
// hoja vivan como varias filas físicas (una por día activo).
//
// FECHA_INICIO / FECHA_FIN (en vez de una sola FECHA_VIGENCIA)
// permiten que un mismo empleado tenga varios horarios a lo largo
// del tiempo sin pisar al anterior: cada uno cubre un periodo, y
// FECHA_FIN vacía significa "vigente hasta nuevo aviso". El campo
// ESTADO (Vigente / Programado / Histórico) se calcula al leer,
// comparando esas fechas contra hoy, para que nunca quede
// desactualizado como pasaría si se guardara como texto fijo.

// Devuelve la hoja "BD_HORARIOS", creándola con sus encabezados si
// aún no existe (a diferencia de la hoja "tabla" principal, esta sí
// se autogenera para no depender de un paso manual de configuración).
function getHorariosSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(HORARIOS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(HORARIOS_SHEET_NAME);
    sheet.appendRow(HORARIOS_HEADERS);
    sheet.getRange(1, 1, 1, HORARIOS_HEADERS.length).setFontWeight('bold');
  }

  return sheet;
}

// Genera el siguiente ID_GRUPO secuencial: HG-000001, HG-000002...
function generarSiguienteIdGrupo(data) {
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '');
    const match = id.match(/^HG-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return 'HG-' + String(maxNum + 1).padStart(6, '0');
}

// Convierte "YYYY-MM-DD" (input type=date) a Date a mediodía local,
// para evitar el clásico corrimiento de -1 día por zona horaria.
function parseFechaLocal(fechaStr) {
  if (!fechaStr) return null;
  const partes = String(fechaStr).split('-');
  if (partes.length !== 3) return null;
  return new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]), 12, 0, 0);
}

// Calcula el ESTADO de un horario comparando su periodo de vigencia
// contra la fecha de hoy. Se calcula siempre al leer (nunca se
// guarda en la hoja) para que jamás quede desactualizado.
function calcularEstadoHorario(fechaInicio, fechaFin) {
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);

  const inicio = parseFechaLocal(fechaInicio);
  const fin = fechaFin ? parseFechaLocal(fechaFin) : null;

  if (inicio && inicio > hoy) return 'Programado';
  if (fin && fin < hoy) return 'Histórico';
  return 'Vigente';
}

// Normaliza el CODE aceptando params.CODE o params.code (el frontend
// a veces manda uno u otro según la acción).
function getCodeParam(params) {
  return params.CODE || params.code || '';
}

// Recorre la data UNA sola vez (antes se recorría hasta 3 veces,
// una por cada campo a validar) construyendo flags de existencia
// y comparando en O(1) por fila, con salida temprana.
function validateDuplicates(params, data) {
  const wantDni = !!params.DNI;
  const wantId = !!params.ID_PERSONAL;
  const wantEmail = !!params.EMAIL_INSTITUCIONAL;

  if (!wantDni && !wantId && !wantEmail) return [];

  const found = { DNI: false, ID_PERSONAL: false, EMAIL_INSTITUCIONAL: false };

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (wantDni && !found.DNI && String(row[7]) === String(params.DNI)) found.DNI = true;
    if (wantId && !found.ID_PERSONAL && String(row[1]) === String(params.ID_PERSONAL)) found.ID_PERSONAL = true;
    if (wantEmail && !found.EMAIL_INSTITUCIONAL && String(row[15]) === String(params.EMAIL_INSTITUCIONAL)) found.EMAIL_INSTITUCIONAL = true;

    if ((!wantDni || found.DNI) && (!wantId || found.ID_PERSONAL) && (!wantEmail || found.EMAIL_INSTITUCIONAL)) break;
  }

  return Object.keys(found).filter(k => found[k]);
}

// ============================================================
// GENERAR SIGUIENTE CODE SECUENCIAL (P1, P2, P3... P57...)
// ============================================================
function generarSiguienteCode(data) {
  let maxNum = 0;

  for (let i = 1; i < data.length; i++) {
    const code = String(data[i][0] || '');
    const match = code.match(/^P(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  return 'P' + (maxNum + 1);
}

function findRowByCode(sheet, code, cachedData) {
  const data = cachedData || sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(code)) {
      return { rowIndex: i + 1, data: data[i] };
    }
  }

  return null;
}

// ============================================================
// OBTENER EMPLEADOS
// ============================================================

function getEmployees() {
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return createJsonResponse(true, 'No hay empleados registrados', []);
    }

    const headers = [
      'CODE', 'ID_PERSONAL', 'APE_PATERNO', 'APE_MATERNO', 'NOMBRES',
      'FEC_NACIMIENTO', 'SEXO', 'DNI', 'TELEFONO', 'DIRECCION',
      'PROFESION', 'PROGRAMA', 'CARGO', 'LUGAR_TRABAJO', 'TIPO_CONTRATO',
      'EMAIL_INSTITUCIONAL', 'TIPO_LABORATORIO', 'FECHA_VINCULACION',
      'INICIO_PERIODO', 'CESE_PERIODO', 'CANT_PERIODO'
    ];

    const employees = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0] && !row[1]) continue;

      const employee = {};
      headers.forEach((header, index) => {
        employee[header] = row[index] || '';
      });
      employees.push(employee);
    }

    return createJsonResponse(true, 'Empleados obtenidos exitosamente', employees);

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// CREAR EMPLEADO
// ============================================================

function createEmployee(params) {
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();

    const duplicates = validateDuplicates(params, data);

    if (duplicates.length > 0) {
      return createJsonResponse(
        false,
        `Los siguientes campos ya existen: ${duplicates.join(', ')}`
      );
    }

    const code = generarSiguienteCode(data);

    const newRow = [
      code,
      params.ID_PERSONAL || '',
      params.APE_PATERNO || '',
      params.APE_MATERNO || '',
      params.NOMBRES || '',
      params.FEC_NACIMIENTO || '',
      params.SEXO || '',
      params.DNI || '',
      params.TELEFONO || '',
      params.DIRECCION || '',
      params.PROFESION || '',
      params.PROGRAMA || '',
      params.CARGO || '',
      params.LUGAR_TRABAJO || '',
      params.TIPO_CONTRATO || '',
      params.EMAIL_INSTITUCIONAL || '',
      params.TIPO_LABORATORIO || '',
      params.FECHA_VINCULACION || '',
      params.INICIO_PERIODO || '',
      params.CESE_PERIODO || '',
      params.CANT_PERIODO || ''
    ];

    sheet.appendRow(newRow);

    const nombreCompleto = `${params.NOMBRES || ''} ${params.APE_PATERNO || ''} ${params.APE_MATERNO || ''}`.trim();
    registrarAuditoria(params.__usuario, 'CREAR', 'Personal', `Nuevo personal registrado: ${nombreCompleto || code} (${code})`, code);

    return createJsonResponse(true, 'Empleado creado exitosamente', { code });

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// ACTUALIZAR EMPLEADO
// ============================================================

function updateEmployee(params) {
  try {
    const sheet = getSheet();

    const code = getCodeParam(params);
    if (!code) {
      return createJsonResponse(false, 'CODE es requerido');
    }

    const result = findRowByCode(sheet, code);

    if (!result) {
      return createJsonResponse(false, 'Empleado no encontrado');
    }

    const fieldMap = {
      'ID_PERSONAL': 1,
      'APE_PATERNO': 2,
      'APE_MATERNO': 3,
      'NOMBRES': 4,
      'FEC_NACIMIENTO': 5,
      'SEXO': 6,
      'DNI': 7,
      'TELEFONO': 8,
      'DIRECCION': 9,
      'PROFESION': 10,
      'PROGRAMA': 11,
      'CARGO': 12,
      'LUGAR_TRABAJO': 13,
      'TIPO_CONTRATO': 14,
      'EMAIL_INSTITUCIONAL': 15,
      'TIPO_LABORATORIO': 16,
      'FECHA_VINCULACION': 17,
      'INICIO_PERIODO': 18,
      'CESE_PERIODO': 19,
      'CANT_PERIODO': 20
    };

    const updates = [];
    Object.keys(params).forEach(key => {
      if (fieldMap[key] !== undefined) {
        updates.push({
          col: fieldMap[key],
          value: params[key]
        });
      }
    });

    if (updates.length === 0) {
      return createJsonResponse(false, 'No se proporcionaron campos para actualizar');
    }

    updates.forEach(update => {
      sheet.getRange(result.rowIndex, update.col + 1).setValue(update.value);
    });

    const camposEditados = Object.keys(fieldMap).filter(k => updates.some(u => u.col === fieldMap[k]));
    registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Personal', `Personal ${code} — campos: ${camposEditados.join(', ')}`, code);

    return createJsonResponse(true, 'Empleado actualizado exitosamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// ELIMINAR EMPLEADO
// ============================================================

function deleteEmployee(params) {
  try {
    const sheet = getSheet();

    const code = getCodeParam(params);
    if (!code) {
      return createJsonResponse(false, 'CODE es requerido');
    }

    const result = findRowByCode(sheet, code);

    if (!result) {
      return createJsonResponse(false, 'Empleado no encontrado');
    }

    const nombreEliminado = `${result.data[4] || ''} ${result.data[2] || ''} ${result.data[3] || ''}`.trim();
    sheet.deleteRow(result.rowIndex);

    registrarAuditoria(params.__usuario, 'ELIMINAR', 'Personal', `Personal eliminado: ${nombreEliminado || code} (${code})`, code);

    return createJsonResponse(true, 'Empleado eliminado exitosamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// HORARIOS - REGISTRAR JORNADA LABORAL (horario semanal, por grupo)
// ============================================================
// El frontend arma una tabla con un horario independiente por día
// (ingreso, inicio/fin de refrigerio, salida y observación) y manda
// todos los días activos juntos en un solo parámetro DIAS_JSON:
//   [{"dia":"Lunes","ingreso":"08:00","inicioRef":"13:00",
//     "finRef":"14:00","salida":"17:00","obs":"","horas":"8.00"}, ...]
// Aquí se valida y se inserta UNA fila por día en BD_HORARIOS, todas
// compartiendo el mismo ID_GRUPO, el mismo periodo de vigencia
// (FECHA_INICIO/FECHA_FIN) y el mismo total semanal, para poder
// tratarlas como un solo registro lógico al editar, eliminar o
// mostrar en la lista de horarios.
function validarDiasHorario(params) {
  if (!params.CODE) return { error: 'CODE del empleado es requerido' };
  if (!params.FECHA_INICIO) return { error: 'La fecha de inicio de vigencia es requerida' };
  if (params.FECHA_FIN && params.FECHA_FIN < params.FECHA_INICIO) {
    return { error: 'La fecha de fin no puede ser anterior a la fecha de inicio' };
  }
  if (!params.DIAS_JSON) return { error: 'Debe indicar al menos un día con horario' };

  let dias;
  try {
    dias = JSON.parse(params.DIAS_JSON);
  } catch (e) {
    return { error: 'DIAS_JSON inválido' };
  }

  if (!Array.isArray(dias) || dias.length === 0) {
    return { error: 'Debe indicar al menos un día con horario' };
  }

  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    if (!d.dia || !d.ingreso || !d.salida) {
      return { error: `El día "${d.dia || '(sin nombre)'}" no tiene ingreso/salida completos` };
    }
  }

  return { dias };
}

function filaHorario(idGrupo, fechaRegistro, fechaActualizacion, params, d) {
  return [
    idGrupo,
    fechaRegistro,
    fechaActualizacion,
    params.CODE,
    params.ID_PERSONAL || '',
    params.EMPLEADO || '',
    params.FECHA_INICIO,
    params.FECHA_FIN || '',
    d.dia,
    d.ingreso,
    d.inicioRef || '',
    d.finRef || '',
    d.salida,
    d.horas || '',
    params.HORAS_SEMANA || '',
    d.obs || ''
  ];
}

// Crea un nuevo grupo de horario: genera un ID_GRUPO secuencial
// (HG-000001, HG-000002...) e inserta una fila por día activo. Un
// mismo empleado puede tener varios grupos a la vez (distintos
// periodos de vigencia) sin que uno reemplace al otro.
function createHorario(params) {
  try {
    const validacion = validarDiasHorario(params);
    if (validacion.error) return createJsonResponse(false, validacion.error);

    const sheet = getHorariosSheet();
    const data = sheet.getDataRange().getValues();
    const idGrupo = generarSiguienteIdGrupo(data);
    const ahora = new Date();

    validacion.dias.forEach(d => {
      sheet.appendRow(filaHorario(idGrupo, ahora, ahora, params, d));
    });

    registrarAuditoria(params.__usuario, 'CREAR', 'Horarios', `Horario creado para ${params.EMPLEADO || params.CODE} — ${validacion.dias.length} día(s), vigencia desde ${params.FECHA_INICIO} (${idGrupo})`, idGrupo);

    return createJsonResponse(true, `Horario registrado (${validacion.dias.length} día${validacion.dias.length === 1 ? '' : 's'})`, { ID_GRUPO: idGrupo });

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// Actualiza un grupo de horario existente: borra TODAS las filas que
// comparten el ID_GRUPO y las vuelve a insertar con los datos nuevos,
// conservando el mismo ID_GRUPO y la fecha de registro original. Se
// actualiza el conjunto completo (nunca una sola fila suelta) para
// que el grupo nunca quede en un estado a medias.
function updateHorario(params) {
  try {
    const idGrupo = params.ID_GRUPO || params.idGrupo;
    if (!idGrupo) {
      return createJsonResponse(false, 'ID_GRUPO es requerido para actualizar');
    }

    const validacion = validarDiasHorario(params);
    if (validacion.error) return createJsonResponse(false, validacion.error);

    const sheet = getHorariosSheet();
    const data = sheet.getDataRange().getValues();

    let fechaRegistroOriginal = null;
    const filasABorrar = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(idGrupo)) {
        if (!fechaRegistroOriginal) fechaRegistroOriginal = data[i][1];
        filasABorrar.push(i + 1);
      }
    }

    if (filasABorrar.length === 0) {
      return createJsonResponse(false, 'No se encontró el horario a actualizar');
    }

    // Borra de abajo hacia arriba para no desfasar los índices de fila.
    for (let i = filasABorrar.length - 1; i >= 0; i--) {
      sheet.deleteRow(filasABorrar[i]);
    }

    const ahora = new Date();
    validacion.dias.forEach(d => {
      sheet.appendRow(filaHorario(idGrupo, fechaRegistroOriginal || ahora, ahora, params, d));
    });

    registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Horarios', `Horario actualizado para ${params.EMPLEADO || params.CODE} — ${validacion.dias.length} día(s) (${idGrupo})`, idGrupo);

    return createJsonResponse(true, 'Horario actualizado correctamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// Elimina TODAS las filas de un grupo de horario (todas comparten el
// mismo ID_GRUPO).
function deleteHorario(params) {
  try {
    const idGrupo = params.ID_GRUPO || params.idGrupo;
    if (!idGrupo) {
      return createJsonResponse(false, 'ID_GRUPO es requerido');
    }

    const sheet = getHorariosSheet();
    const data = sheet.getDataRange().getValues();

    const filasABorrar = [];
    let empleadoBorrado = '';
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(idGrupo)) {
        filasABorrar.push(i + 1);
        if (!empleadoBorrado) empleadoBorrado = data[i][5] || data[i][3];
      }
    }

    if (filasABorrar.length === 0) {
      return createJsonResponse(false, 'No se encontró el horario a eliminar');
    }

    for (let i = filasABorrar.length - 1; i >= 0; i--) {
      sheet.deleteRow(filasABorrar[i]);
    }

    registrarAuditoria(params.__usuario, 'ELIMINAR', 'Horarios', `Horario eliminado de ${empleadoBorrado} (${idGrupo})`, idGrupo);

    return createJsonResponse(true, 'Horario eliminado correctamente');

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// Arma el objeto "grupo" (cabecera + DIAS anidados + ESTADO
// calculado) a partir de las filas físicas de un mismo ID_GRUPO.
// Esta misma forma alimenta tanto la tabla resumen de "Lista de
// Horarios" como la reconstrucción del modal al editar.
// Normaliza una celda de fecha a "YYYY-MM-DD" sin importar si Sheets
// la guardó como texto plano o si la autoconvirtió a un objeto Date
// (que es lo que pasa cuando el texto "parece" una fecha). Sin esto,
// JSON.stringify serializa el Date como ISO completo con hora
// ("2026-08-03T05:00:00.000Z"), que es un formato que ni el <input
// type="date"> del modal ni la vista de vigencia saben interpretar.
function formatearFechaSoloDia(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Si ya es texto "YYYY-MM-DD..." (u otro formato con hora pegada),
  // nos quedamos solo con los primeros 10 caracteres.
  return String(valor).slice(0, 10);
}

// Igual que formatearFechaSoloDia, pero para columnas de hora
// ("HORA_INGRESO", "INICIO_REFRIGERIO", etc.). Sheets puede
// autoconvertir un texto como "08:00" a un valor de hora interno
// (que Apps Script devuelve como Date con fecha 1899-12-30 + esa
// hora); esto lo vuelve a dejar como "HH:MM" de forma consistente.
function formatearHoraSoloHHMM(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    const h = String(valor.getHours()).padStart(2, '0');
    const m = String(valor.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return String(valor).slice(0, 5);
}

function armarGrupoDesdeFilas(idGrupo, filas) {
  const primera = filas[0];
  const grupo = {
    ID_GRUPO: idGrupo,
    FECHA_REGISTRO: primera[1] instanceof Date ? primera[1].toISOString() : (primera[1] || ''),
    FECHA_ACTUALIZACION: primera[2] instanceof Date ? primera[2].toISOString() : (primera[2] || ''),
    CODE: primera[3] || '',
    ID_PERSONAL: primera[4] || '',
    EMPLEADO: primera[5] || '',
    FECHA_INICIO: formatearFechaSoloDia(primera[6]),
    FECHA_FIN: formatearFechaSoloDia(primera[7]),
    HORAS_SEMANA: primera[14] || '',
    DIAS: filas.map(row => ({
      dia: row[8] || '',
      ingreso: formatearHoraSoloHHMM(row[9]),
      inicioRef: formatearHoraSoloHHMM(row[10]),
      finRef: formatearHoraSoloHHMM(row[11]),
      salida: formatearHoraSoloHHMM(row[12]),
      horas: row[13] || '',
      obs: row[15] || ''
    }))
  };
  grupo.ESTADO = calcularEstadoHorario(grupo.FECHA_INICIO, grupo.FECHA_FIN);
  return grupo;
}

// Lista los horarios registrados, agrupados por ID_GRUPO (no una
// fila plana por día). Si se pasa "code" filtra solo los del
// empleado indicado (para el listado dentro de la Lista de Horarios
// y para el panel "Horarios de este empleado" dentro del modal).
function getHorariosAgrupados(params) {
  try {
    const sheet = getHorariosSheet();
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return createJsonResponse(true, 'No hay horarios registrados', []);
    }

    const filtroCode = params.code || params.CODE || '';
    const filasPorGrupo = {};
    const orden = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const idGrupo = row[0];
      if (!idGrupo) continue;
      if (filtroCode && String(row[3]) !== String(filtroCode)) continue;

      if (!filasPorGrupo[idGrupo]) {
        filasPorGrupo[idGrupo] = [];
        orden.push(idGrupo);
      }
      filasPorGrupo[idGrupo].push(row);
    }

    const horarios = orden
      .map(idGrupo => armarGrupoDesdeFilas(idGrupo, filasPorGrupo[idGrupo]))
      .reverse(); // más recientes primero

    return createJsonResponse(true, 'Horarios obtenidos exitosamente', horarios);

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// Obtiene UN solo grupo completo por su ID_GRUPO (para reconstruir
// el modal cuando el usuario presiona "Editar"). Siempre se lee
// desde BD_HORARIOS -nunca desde lo que haya quedado en el navegador-
// para garantizar que el modal se rellene con el dato más reciente.
function getHorarioGrupo(params) {
  try {
    const idGrupo = params.idGrupo || params.ID_GRUPO;
    if (!idGrupo) {
      return createJsonResponse(false, 'ID_GRUPO es requerido');
    }

    const sheet = getHorariosSheet();
    const data = sheet.getDataRange().getValues();

    const filas = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(idGrupo)) filas.push(data[i]);
    }

    if (filas.length === 0) {
      return createJsonResponse(false, 'No se encontró el horario solicitado');
    }

    return createJsonResponse(true, 'Horario obtenido exitosamente', armarGrupoDesdeFilas(idGrupo, filas));

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}
// ============================================================
// SOLICITUD DE CAMBIO DE HORARIO — generación automática
// (pegar este bloque en Codigo_corregido.gs, después de
// getHorarioGrupo(), es decir después de la línea ~1080)
// ============================================================
// Mantiene el diseño ORIGINAL del formato en Excel: la plantilla
// vive como un Google Sheet (mismo layout que
// FORMATO_Solicitud_..._V2.xlsx, subido/convertido una sola vez a
// Sheets). Por cada solicitud se saca una COPIA de esa plantilla,
// se llenan solo las celdas que el sistema puede saber con certeza,
// se exporta como XLSX o PDF, y la copia temporal se borra.
//
// CONFIGURACIÓN REQUERIDA (una sola vez):
// 1. Abrir FORMATO_Solicitud_..._V2.xlsx con Google Sheets (Drive
//    la convierte automáticamente) y guardarla en cualquier carpeta
//    de la MISMA cuenta que ejecuta este script.
// 2. Copiar su ID (lo que va después de /d/ en la URL) y pegarlo
//    abajo, en PLANTILLA_SOLICITUD_HORARIO_ID.
const PLANTILLA_SOLICITUD_HORARIO_ID = '1vuu6i9YoYPUwCWrzaK75yv4OcIkSbJ-FnbQDL4L-kfU';

// Mapeo centralizado celda -> dato. Si el día de mañana cambia el
// diseño del formato, solo se toca esto (no hay celdas "mágicas"
// sueltas en medio del código).
const CELDAS_SOLICITUD_HORARIO = {
  EMPLEADO: 'A9',
  ID_PERSONAL: 'E9',
  HORARIO_VIGENTE: 'B10',
  FECHA_INICIO: 'D14',
  FECHA_FIN: 'F14',
  HORARIO_PROPUESTO: 'B17'
};

// Busca la fila del empleado en "tabla" por CODE. Se hace directo
// aquí (en vez de pasar por getEmployees()+createJsonResponse) para
// no tener que desempaquetar un ContentService.TextOutput dentro de
// otra función del servidor.
function buscarEmpleadoPorCode_(code) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(code)) {
      return {
        CODE: data[i][0], ID_PERSONAL: data[i][1],
        APE_PATERNO: data[i][2], APE_MATERNO: data[i][3], NOMBRES: data[i][4]
      };
    }
  }
  return null;
}

// Igual que getHorariosAgrupados(), pero devuelve el arreglo de
// grupos directamente (no envuelto en createJsonResponse), para
// poder reutilizar armarGrupoDesdeFilas() desde el servidor sin
// tener que parsear JSON de vuelta.
function obtenerGruposHorarioPorCode_(code) {
  const sheet = getHorariosSheet();
  const data = sheet.getDataRange().getValues();
  const filasPorGrupo = {};
  const orden = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const idGrupo = row[0];
    if (!idGrupo) continue;
    if (String(row[3]) !== String(code)) continue;
    if (!filasPorGrupo[idGrupo]) { filasPorGrupo[idGrupo] = []; orden.push(idGrupo); }
    filasPorGrupo[idGrupo].push(row);
  }

  return orden.map(idGrupo => armarGrupoDesdeFilas(idGrupo, filasPorGrupo[idGrupo]));
}

// Mismo formato de texto que ya usa HorarioExport.aTextoLegible() en
// el frontend (js/horarios/horario-export.js), reescrito aquí para
// el servidor porque el PDF/XLSX se arma en Apps Script, no en el
// navegador.
function textoHorarioGrupo_(grupo) {
  if (!grupo) return '';
  const lineas = (grupo.DIAS || []).map(d => {
    let l = `${d.dia}: ${d.ingreso}`;
    if (d.inicioRef || d.finRef) l += ` (ref. ${d.inicioRef || '—'}-${d.finRef || '—'})`;
    l += ` a ${d.salida}`;
    return l;
  });
  const total = grupo.HORAS_SEMANA ? `\nTotal semanal: ${grupo.HORAS_SEMANA}h` : '';
  return lineas.join('\n') + total;
}

// Exporta un Spreadsheet (por ID) usando la URL de exportación
// nativa de Sheets. formato: 'xlsx' o 'pdf'.
function exportarSpreadsheet_(spreadsheetId, formato) {
  let url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=${formato}`;
  if (formato === 'pdf') {
    url += '&size=A4&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false&top_margin=0.3&bottom_margin=0.3';
  }
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  return response.getBlob();
}

// ============================================================
// ACCIÓN PRINCIPAL: generarSolicitudHorario
// params esperados: code, formato ('xlsx' | 'pdf', default 'pdf')
// ============================================================
function generarSolicitudHorario(params) {
  try {
    const code = getCodeParam(params);
    if (!code) return createJsonResponse(false, 'Falta el parámetro code');

    // Nota: el botón de PDF se quitó de la UI porque el endpoint de
    // exportación a PDF de Sheets a veces devuelve un 500 justo
    // después de copiar el archivo (propagación del lado de
    // Google). Se deja 'pdf' como opción del backend por si algún
    // día se retoma con un retry, pero el default ahora es 'xlsx'
    // para que cualquier llamada sin este parámetro caiga en la
    // opción confiable.
    const formato = (params.formato === 'pdf') ? 'pdf' : 'xlsx';

    const empleado = buscarEmpleadoPorCode_(code);
    if (!empleado) return createJsonResponse(false, 'Empleado no encontrado');

    const grupos = obtenerGruposHorarioPorCode_(code);
    const vigente = grupos.find(g => g.ESTADO === 'Vigente');
    // "Propuesto" = el horario Programado más próximo a iniciar. Si
    // el trabajador/jefe aún no lo armó en el módulo Horarios,
    // simplemente esas celdas quedan vacías para llenar a mano.
    const propuesto = grupos
      .filter(g => g.ESTADO === 'Programado')
      .sort((a, b) => new Date(a.FECHA_INICIO) - new Date(b.FECHA_INICIO))[0];

    if (!vigente && !propuesto) {
      return createJsonResponse(false, 'El empleado no tiene horarios registrados en el sistema');
    }

    // 1. Copiar la plantilla (nunca se edita el original)
    const nombreCopia = `Solicitud_${code}_${Utilities.formatDate(new Date(), 'GMT-5', 'yyyyMMdd_HHmmss')}`;
    const copiaFile = DriveApp.getFileById(PLANTILLA_SOLICITUD_HORARIO_ID).makeCopy(nombreCopia);
    const copia = SpreadsheetApp.openById(copiaFile.getId());
    const hoja = copia.getSheets()[0];

    // 2. Llenar SOLO lo que el sistema sabe con certeza
    hoja.getRange(CELDAS_SOLICITUD_HORARIO.EMPLEADO)
      .setValue(`${empleado.APE_PATERNO} ${empleado.APE_MATERNO} ${empleado.NOMBRES}`.trim());
    hoja.getRange(CELDAS_SOLICITUD_HORARIO.ID_PERSONAL).setValue(empleado.ID_PERSONAL);

    if (vigente) {
      hoja.getRange(CELDAS_SOLICITUD_HORARIO.HORARIO_VIGENTE).setValue(textoHorarioGrupo_(vigente));
    }
    if (propuesto) {
      hoja.getRange(CELDAS_SOLICITUD_HORARIO.FECHA_INICIO).setValue(propuesto.FECHA_INICIO);
      if (propuesto.FECHA_FIN) {
        hoja.getRange(CELDAS_SOLICITUD_HORARIO.FECHA_FIN).setValue(propuesto.FECHA_FIN);
      }
      hoja.getRange(CELDAS_SOLICITUD_HORARIO.HORARIO_PROPUESTO).setValue(textoHorarioGrupo_(propuesto));
    }
    // MARCAR CON X (Temporal/Permanente/Rotativo), MOTIVO y
    // SUSTENTO DE LA SOLICITUD quedan en blanco a propósito: son
    // decisiones humanas, no datos que el sistema pueda inferir.

    SpreadsheetApp.flush();

    // 3. Exportar y limpiar la copia temporal
    const fechaArchivo = Utilities.formatDate(new Date(), 'GMT-5', 'yyyyMMdd');
    const nombreArchivo = `Solicitud_cambio_horario_${empleado.NOMBRES}_${empleado.APE_PATERNO}_${fechaArchivo}`
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes/diacríticos
      .replace(/[^a-zA-Z0-9_]+/g, '_') // reemplazar espacios y símbolos no válidos en nombre de archivo
      .replace(/_+/g, '_') // colapsar guiones bajos repetidos
      .replace(/^_|_$/g, ''); // quitar guiones bajos al inicio/fin
    const blob = exportarSpreadsheet_(copiaFile.getId(), formato)
      .setName(`${nombreArchivo}.${formato}`);
    copiaFile.setTrashed(true);

    registrarAuditoria(
      params.__usuario, 'GENERAR', 'Horarios',
      `Solicitud de cambio de horario generada (${formato}) para ${code}`, code
    );

    return createJsonResponse(true, 'Solicitud generada correctamente', {
      filename: blob.getName(),
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes())
    });

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// Nota: esta acción no está en WRITE_ACTIONS porque no modifica
// BD_HORARIOS ni "tabla", solo lee y genera un archivo aparte. Si
// en el futuro prefieres exigir la API key igual (por ser una
// acción "pesada"), agrégala a WRITE_ACTIONS sin problema — el
// código ya lo soporta porque el frontend puede mandar params.key.

// ============================================================
// FUNCIONES PARA PRUEBAS
// ============================================================
// Ahora que toda acción exige sesión, las pruebas primero inician
// sesión con el usuario "admin" de ejemplo (ver getUsersSheet) para
// obtener un token válido y así poder llamar al resto de acciones.

// ============================================================
// MIGRACIÓN ÚNICA: voltear columnas O/P en BD_HORARIOS
// ============================================================
// Antes de este fix, cada fila se guardó con OBSERVACION en la
// columna O y HORAS_SEMANA en la columna P (al revés de lo que debe
// ser). Esta función corrige TODAS las filas ya existentes en la
// hoja (encabezado + datos), intercambiando el contenido de esas
// dos columnas, para que queden acordes al nuevo orden que ya usan
// filaHorario()/armarGrupoDesdeFilas() (HORAS_SEMANA en O,
// OBSERVACION en P).
//
// CÓMO USARLA (una sola vez, después de subir este código):
// 1. Abre el editor de Apps Script.
// 2. Selecciona esta función (migrarColumnasObservacionHorasSemana)
//    en el desplegable de funciones, junto al botón ▶ Ejecutar.
// 3. Ejecútala una vez y revisa el Log (Ver > Registros) para
//    confirmar cuántas filas se corrigieron.
// 4. Verifica en la hoja BD_HORARIOS que la columna O ahora tenga
//    horas ("8.80h"-like) y la P tenga las observaciones de texto.
// 5. Puedes borrar esta función después si quieres, no la usa el
//    resto del sistema.
function migrarColumnasObservacionHorasSemana() {
  const sheet = getHorariosSheet();
  const filas = sheet.getLastRow();
  if (filas < 1) {
    Logger.log('Hoja vacía, nada que migrar.');
    return;
  }

  // Encabezado (fila 1): confirma que diga HORAS_SEMANA en O y
  // OBSERVACION en P; si ya está así, no lo toca de nuevo.
  const encabezado = sheet.getRange(1, 15, 1, 2).getValues()[0];
  if (encabezado[0] !== 'HORAS_SEMANA') {
    sheet.getRange(1, 15, 1, 2).setValues([['HORAS_SEMANA', 'OBSERVACION']]);
  }

  if (filas < 2) {
    Logger.log('Solo hay encabezado, no hay filas de datos que migrar.');
    return;
  }

  const rango = sheet.getRange(2, 15, filas - 1, 2); // columnas O:P, desde fila 2
  const valores = rango.getValues();
  const volteados = valores.map(fila => [fila[1], fila[0]]); // [P, O] -> nuevo [O, P]
  rango.setValues(volteados);

  Logger.log(`Migración completa: ${volteados.length} fila(s) de BD_HORARIOS corregidas (O↔P).`);
}

function testLoginYObtenerToken() {
  const result = login({ usuario: 'admin', password: 'admin123' });
  const data = JSON.parse(result.getContent());
  Logger.log(data);
  return data.success ? data.data.token : null;
}

function testCreateEmployee() {
  const token = testLoginYObtenerToken();
  const params = {
    action: 'create',
    key: API_KEY,
    token: token,
    ID_PERSONAL: '12345',
    APE_PATERNO: 'Pérez',
    APE_MATERNO: 'García',
    NOMBRES: 'Juan',
    DNI: '12345678',
    TELEFONO: '987654321',
    DIRECCION: 'Av. Principal 123',
    PROFESION: 'Ingeniero',
    PROGRAMA: 'Sistemas',
    CARGO: 'Desarrollador',
    LUGAR_TRABAJO: 'Oficina Central',
    TIPO_CONTRATO: 'Indefinido',
    EMAIL_INSTITUCIONAL: 'juan.perez@empresa.com',
    TIPO_LABORATORIO: 'Desarrollo',
    FECHA_VINCULACION: '2024-01-01',
    INICIO_PERIODO: '2024-01-01',
    CESE_PERIODO: '2025-01-01',
    CANT_PERIODO: '12'
  };

  const result = doGet({ parameter: params });
  Logger.log(result.getContent());
}

function testListEmployees() {
  const token = testLoginYObtenerToken();
  const result = doGet({ parameter: { action: 'list', token: token } });
  Logger.log(result.getContent());
}

function testUpdateEmployee() {
  const token = testLoginYObtenerToken();
  const params = {
    action: 'update',
    key: API_KEY,
    token: token,
    CODE: 'EMP12345678',
    NOMBRES: 'Juan Carlos',
    TELEFONO: '999888777'
  };

  const result = doGet({ parameter: params });
  Logger.log(result.getContent());
}

function testDeleteEmployee() {
  const token = testLoginYObtenerToken();
  const params = {
    action: 'delete',
    key: API_KEY,
    token: token,
    code: 'EMP12345678'
  };

  const result = doGet({ parameter: params });
  Logger.log(result.getContent());
}

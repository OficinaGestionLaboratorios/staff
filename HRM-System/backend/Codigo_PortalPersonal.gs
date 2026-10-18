// ============================================================
// PORTAL DE ACTUALIZACIÓN INDIVIDUAL DE DATOS DEL PERSONAL
// ============================================================
// Módulo NUEVO y separado a propósito (no se toca Codigo_corregido.gs
// salvo para registrar las acciones en el switch de handleRequest y
// declararlas como públicas/de escritura — ver los 3 puntos marcados
// con "PORTAL PERSONAL" en ese archivo).
//
// Reutiliza:
//   - getSheet() / getSpreadsheet()  -> misma hoja "tabla", NO se crea
//     una segunda base de personal.
//   - findRowByCode(), createJsonResponse()
//   - registrarAuditoria() -> las modificaciones del propio trabajador
//     quedan en la MISMA hoja BD_AUDITORIA que usa el resto del
//     sistema (módulo "PortalPersonal"), visibles en el panel
//     "Actividad" para el Administrador Principal.
//
// Agrega DOS hojas nuevas (autogeneradas, igual que BD_HORARIOS o
// BD_USUARIOS):
//   - BD_ESTADO_ACTUALIZACION -> 1 fila por trabajador con su estado
//     (PENDIENTE / ACTUALIZADO / MODIFICADO) y la fecha del último
//     paso por el portal. Punto 9 del requerimiento.
//   - BD_HISTORIAL_PERSONAL -> 1 fila por CAMPO modificado, con valor
//     anterior y nuevo. Punto 8 del requerimiento (trazabilidad).
//
// SEGURIDAD CLAVE (punto 7 y 11 del requerimiento):
// La sesión del portal (crearTokenSesionEmpleado/obtenerSesionEmpleado)
// vive en un namespace de caché COMPLETAMENTE separado del de sesiones
// administrativas (PORTAL_SESSION_PREFIX vs SESSION_CACHE_PREFIX), y
// solo guarda { code, idPersonal } — nunca un rol. Un token del portal
// jamás sirve para acciones administrativas y viceversa.
//
// En actualizarMisDatosPersonal() el CODE a modificar se obtiene
// SIEMPRE de la sesión (nunca de params) — así un trabajador no puede
// mandar un CODE distinto para editar el registro de otra persona,
// aunque modifique la petición a mano (ver ejemplo de ataque del
// requerimiento, punto 11).
// ============================================================

const PORTAL_SESSION_PREFIX = 'sessemp_';
const PORTAL_SESSION_DURATION_SEC = 30 * 60; // 30 minutos: sesión corta a propósito, es autoservicio

const ESTADO_SHEET_NAME = 'BD_ESTADO_ACTUALIZACION';
const ESTADO_HEADERS = ['CODE', 'ID_PERSONAL', 'ESTADO', 'FECHA_ULTIMA_ACTUALIZACION'];

const HISTORIAL_PERSONAL_SHEET_NAME = 'BD_HISTORIAL_PERSONAL';
const HISTORIAL_PERSONAL_HEADERS = ['FECHA', 'ID_PERSONAL', 'CODE', 'CAMPO', 'VALOR_ANTERIOR', 'VALOR_NUEVO'];

// Mismo orden que headers en getEmployees() (Codigo_corregido.gs) —
// se repite aquí en vez de importarlo porque Apps Script no tiene
// módulos: todo vive en el mismo proyecto global.
const CAMPOS_PERSONAL = [
  'CODE', 'ID_PERSONAL', 'APE_PATERNO', 'APE_MATERNO', 'NOMBRES',
  'FEC_NACIMIENTO', 'SEXO', 'DNI', 'TELEFONO', 'DIRECCION',
  'PROFESION', 'PROGRAMA', 'CARGO', 'LUGAR_TRABAJO', 'TIPO_CONTRATO',
  'EMAIL_INSTITUCIONAL', 'TIPO_LABORATORIO', 'FECHA_VINCULACION',
  'INICIO_PERIODO', 'CESE_PERIODO', 'CANT_PERIODO'
];

// Etiquetas legibles para mostrar en el formulario del portal y en el
// historial, sin tener que duplicar esta lista en el frontend.
const ETIQUETAS_CAMPOS_PERSONAL = {
  CODE: 'Código', ID_PERSONAL: 'ID Personal', APE_PATERNO: 'Apellido paterno',
  APE_MATERNO: 'Apellido materno', NOMBRES: 'Nombres', FEC_NACIMIENTO: 'Fecha de nacimiento',
  SEXO: 'Sexo', DNI: 'DNI', TELEFONO: 'Celular / Teléfono', DIRECCION: 'Dirección',
  PROFESION: 'Profesión', PROGRAMA: 'Programa', CARGO: 'Cargo', LUGAR_TRABAJO: 'Lugar de trabajo',
  TIPO_CONTRATO: 'Tipo de contrato', EMAIL_INSTITUCIONAL: 'Correo institucional',
  TIPO_LABORATORIO: 'Tipo de laboratorio', FECHA_VINCULACION: 'Fecha de vinculación',
  INICIO_PERIODO: 'Inicio de periodo', CESE_PERIODO: 'Cese de periodo', CANT_PERIODO: 'Cantidad de periodo'
};

// ============================================================
// CONFIGURACIÓN DE CAMPOS DEL PORTAL (editable/visible por campo)
// ============================================================
// Antes esto era un par de arreglos fijos en el código (imposible de
// cambiar sin volver a publicar el backend). Ahora vive en la hoja
// BD_CONFIG_CAMPOS_PORTAL, para que el Administrador Principal pueda
// modificarlo desde el ícono de ajustes del panel (ver
// getConfigCamposPortal / setConfigCamposPortal más abajo).
//
// CONFIG_CAMPOS_DEFAULT es solo el valor de fábrica con el que se
// siembra la hoja la primera vez que se usa — a partir de ahí la
// hoja manda. CODE e ID_PERSONAL nunca son editables (ver
// CAMPOS_EDITABLES_BLOQUEADOS): son identificadores/credencial de
// acceso y permitir tocarlos desde el propio portal rompería el
// sistema de sesión y el resto del panel administrativo.
const CONFIG_CAMPOS_SHEET_NAME = 'BD_CONFIG_CAMPOS_PORTAL';
const CONFIG_CAMPOS_HEADERS = ['CAMPO', 'EDITABLE', 'VISIBLE'];
const CAMPOS_EDITABLES_BLOQUEADOS = ['CODE', 'ID_PERSONAL'];

const CONFIG_CAMPOS_DEFAULT = {
  CODE:                { editable: false, visible: false },
  ID_PERSONAL:         { editable: false, visible: true  },
  APE_PATERNO:         { editable: true,  visible: true  },
  APE_MATERNO:         { editable: true,  visible: true  },
  NOMBRES:             { editable: true,  visible: true  },
  FEC_NACIMIENTO:      { editable: true,  visible: true  },
  SEXO:                { editable: false, visible: true  },
  DNI:                 { editable: true,  visible: true  },
  TELEFONO:            { editable: true,  visible: true  },
  DIRECCION:           { editable: true,  visible: true  },
  PROFESION:           { editable: true,  visible: true  },
  PROGRAMA:            { editable: false, visible: true  },
  CARGO:               { editable: false, visible: true  },
  LUGAR_TRABAJO:       { editable: false, visible: true  },
  TIPO_CONTRATO:       { editable: false, visible: true  },
  EMAIL_INSTITUCIONAL: { editable: true,  visible: true  },
  TIPO_LABORATORIO:    { editable: false, visible: true  },
  FECHA_VINCULACION:   { editable: false, visible: false },
  INICIO_PERIODO:      { editable: false, visible: false },
  CESE_PERIODO:        { editable: false, visible: false },
  CANT_PERIODO:        { editable: false, visible: false }
};

function getConfigCamposSheet_() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_CAMPOS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_CAMPOS_SHEET_NAME);
    sheet.appendRow(CONFIG_CAMPOS_HEADERS);
    sheet.getRange(1, 1, 1, CONFIG_CAMPOS_HEADERS.length).setFontWeight('bold');
    // Siembra la hoja con los valores de fábrica, en el mismo orden
    // que CAMPOS_PERSONAL, para que quede legible de arriba a abajo.
    CAMPOS_PERSONAL.forEach(campo => {
      const def = CONFIG_CAMPOS_DEFAULT[campo] || { editable: false, visible: false };
      sheet.appendRow([campo, def.editable, def.visible]);
    });
  }
  return sheet;
}

// Lee la hoja de configuración y arma { CAMPO: {editable, visible} }.
// Si un campo de CAMPOS_PERSONAL no está en la hoja (p. ej. porque se
// agregó una columna nueva después), se completa con el valor de
// fábrica en vez de dejarlo fuera.
function obtenerConfigCamposPortal_() {
  const sheet = getConfigCamposSheet_();
  const data = sheet.getDataRange().getValues();
  const config = {};

  for (let i = 1; i < data.length; i++) {
    const campo = String(data[i][0] || '').trim();
    if (!campo) continue;
    config[campo] = {
      editable: data[i][1] === true || String(data[i][1]).toUpperCase() === 'TRUE',
      visible: data[i][2] === true || String(data[i][2]).toUpperCase() === 'TRUE'
    };
  }

  CAMPOS_PERSONAL.forEach(campo => {
    if (!config[campo]) {
      config[campo] = CONFIG_CAMPOS_DEFAULT[campo] || { editable: false, visible: false };
    }
    // Blindaje: pase lo que pase en la hoja, CODE e ID_PERSONAL jamás
    // se exponen como editables desde el portal del trabajador.
    if (CAMPOS_EDITABLES_BLOQUEADOS.indexOf(campo) !== -1) {
      config[campo].editable = false;
    }
  });

  return config;
}

// Listas derivadas de la configuración vigente, en el mismo orden de
// CAMPOS_PERSONAL — reemplazan a los antiguos arreglos fijos
// CAMPOS_EDITABLES_PORTAL / CAMPOS_SOLO_LECTURA_PORTAL /
// CAMPOS_OCULTOS_PORTAL en el resto de este archivo.
function obtenerCamposEditablesPortal_(config) {
  return CAMPOS_PERSONAL.filter(c => config[c] && config[c].editable);
}
function obtenerCamposVisiblesPortal_(config) {
  return CAMPOS_PERSONAL.filter(c => config[c] && config[c].visible);
}

// ============================================================
// FECHAS DEL PORTAL: siempre dd/mm/aaaa hacia el navegador
// ============================================================
// Google Sheets guarda estos campos como Date; al viajar en JSON un
// Date se serializa solo como ISO con hora ("2002-08-02T05:00:00.000Z"),
// que es justo lo que se veía crudo en el formulario. Estas funciones
// centralizan la conversión en un solo lugar para que ni el portal ni
// el panel admin vuelvan a mostrar eso.
const CAMPOS_FECHA_PORTAL = ['FEC_NACIMIENTO', 'FECHA_VINCULACION', 'INICIO_PERIODO', 'CESE_PERIODO'];

// Cualquier valor de celda (Date real o texto ya corrompido de un
// guardado anterior) -> 'yyyy-MM-dd' interno para comparar fechas
// sin ambigüedad, o '' si está vacío/no es una fecha reconocible.
function normalizarFechaISO_(valorCelda) {
  if (valorCelda === '' || valorCelda === null || valorCelda === undefined) return '';
  const d = (valorCelda instanceof Date) ? valorCelda : new Date(valorCelda);
  if (isNaN(d)) return String(valorCelda).trim();
  return Utilities.formatDate(d, 'GMT-5', 'yyyy-MM-dd');
}

// 'yyyy-MM-dd' interno -> 'dd/mm/aaaa' para mostrar en el navegador.
function isoAFechaVisible_(iso) {
  if (!iso) return '';
  const partes = iso.split('-');
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// Lo que escribe/lee el trabajador ('dd/mm/aaaa', y por compatibilidad
// también 'aaaa-mm-dd' o 'dd-mm-aaaa') -> 'yyyy-MM-dd' interno. Null
// si el texto no corresponde a una fecha válida (se ignora el cambio
// en vez de guardar basura en la hoja).
function fechaVisibleAISO_(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();

  let m = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // dd/mm/aaaa o dd-mm-aaaa
  if (m) {
    const [_, d, mo, y] = m;
    return validarFecha_(y, mo, d) ? `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}` : null;
  }

  m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // aaaa-mm-dd (p. ej. un <input type=date>)
  if (m) {
    const [_, y, mo, d] = m;
    return validarFecha_(y, mo, d) ? `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}` : null;
  }

  return null;
}

function validarFecha_(y, mo, d) {
  const anio = Number(y), mes = Number(mo), dia = Number(d);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const prueba = new Date(anio, mes - 1, dia);
  return prueba.getFullYear() === anio && prueba.getMonth() === mes - 1 && prueba.getDate() === dia;
}

// 'yyyy-MM-dd' -> Date real a mediodía hora del script, para guardarla
// en la celda como fecha (no como texto) y que Sheets la siga
// tratando como Date, evitando el corrimiento de día por huso horario.
function construirFechaCelda_(iso) {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, 12, 0, 0);
}

// ---- Acciones administrativas: leer / guardar la configuración ----

// Acción admin (requiere sesión, ver PUBLIC_ACTIONS en
// Codigo_corregido.gs). Devuelve el detalle campo por campo para
// pintar la tabla del modal de ajustes.
function getConfigCamposPortal(params) {
  try {
    const config = obtenerConfigCamposPortal_();
    const detalle = CAMPOS_PERSONAL.map((campo, i) => ({
      item: i + 1,
      campo: campo,
      etiqueta: ETIQUETAS_CAMPOS_PERSONAL[campo] || campo,
      editable: !!config[campo].editable,
      visible: !!config[campo].visible,
      bloqueado: CAMPOS_EDITABLES_BLOQUEADOS.indexOf(campo) !== -1
    }));
    return createJsonResponse(true, 'Configuración obtenida correctamente', detalle);
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// Acción admin de ESCRITURA (va en WRITE_ACTIONS -> exige API key,
// además de la sesión admin). params.config debe ser un JSON string:
// [{CAMPO, EDITABLE, VISIBLE}, ...]. Se valida cada CAMPO contra la
// lista blanca CAMPOS_PERSONAL (nunca se crean filas para nombres
// arbitrarios que vengan del navegador).
function setConfigCamposPortal(params) {
  try {
    let filas;
    try {
      filas = JSON.parse(params.config || '[]');
    } catch (e) {
      return createJsonResponse(false, 'Formato de configuración inválido.');
    }
    if (!Array.isArray(filas)) {
      return createJsonResponse(false, 'Formato de configuración inválido.');
    }

    const nuevaConfig = {};
    filas.forEach(f => {
      const campo = String(f.CAMPO || f.campo || '').trim().toUpperCase();
      if (CAMPOS_PERSONAL.indexOf(campo) === -1) return; // ignora nombres desconocidos
      nuevaConfig[campo] = {
        editable: CAMPOS_EDITABLES_BLOQUEADOS.indexOf(campo) !== -1 ? false : !!(f.EDITABLE ?? f.editable),
        visible: !!(f.VISIBLE ?? f.visible)
      };
    });

    const sheet = getConfigCamposSheet_();
    const data = sheet.getDataRange().getValues();
    const filaPorCampo = {};
    for (let i = 1; i < data.length; i++) {
      filaPorCampo[String(data[i][0])] = i + 1;
    }

    CAMPOS_PERSONAL.forEach(campo => {
      const valor = nuevaConfig[campo] || CONFIG_CAMPOS_DEFAULT[campo] || { editable: false, visible: false };
      const fila = filaPorCampo[campo];
      if (fila) {
        sheet.getRange(fila, 2, 1, 2).setValues([[valor.editable, valor.visible]]);
      } else {
        sheet.appendRow([campo, valor.editable, valor.visible]);
      }
    });

    registrarAuditoria(params.__usuario || 'admin', 'ACTUALIZAR', 'ConfigPortalPersonal',
      'Actualizó las condiciones de edición/visibilidad de campos del Portal de Autoactualización');

    return getConfigCamposPortal(params);
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// HOJAS AUXILIARES (autogeneradas)
// ============================================================

function getEstadoSheet_() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(ESTADO_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ESTADO_SHEET_NAME);
    sheet.appendRow(ESTADO_HEADERS);
    sheet.getRange(1, 1, 1, ESTADO_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function getHistorialPersonalSheet_() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(HISTORIAL_PERSONAL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(HISTORIAL_PERSONAL_SHEET_NAME);
    sheet.appendRow(HISTORIAL_PERSONAL_HEADERS);
    sheet.getRange(1, 1, 1, HISTORIAL_PERSONAL_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// Crea o actualiza la fila de estado de un trabajador (upsert por CODE).
function upsertEstado_(code, idPersonal, estado) {
  const sheet = getEstadoSheet_();
  const data = sheet.getDataRange().getValues();
  const ahora = new Date();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(code)) {
      sheet.getRange(i + 1, 3).setValue(estado);
      sheet.getRange(i + 1, 4).setValue(ahora);
      return;
    }
  }
  sheet.appendRow([code, idPersonal, estado, ahora]);
}

function obtenerEstado_(code) {
  const sheet = getEstadoSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(code)) {
      const fecha = data[i][3] instanceof Date ? data[i][3].toISOString() : String(data[i][3] || '');
      return { estado: data[i][2] || 'PENDIENTE', fecha: fecha };
    }
  }
  return { estado: 'PENDIENTE', fecha: '' };
}

// ============================================================
// SESIÓN DEL PORTAL (namespace separado de la sesión administrativa)
// ============================================================

function crearTokenSesionEmpleado_(code, idPersonal) {
  const token = Utilities.getUuid();
  const payload = JSON.stringify({ code: code, idPersonal: idPersonal });
  CacheService.getScriptCache().put(PORTAL_SESSION_PREFIX + token, payload, PORTAL_SESSION_DURATION_SEC);
  return token;
}

function obtenerSesionEmpleado_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get(PORTAL_SESSION_PREFIX + token);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function eliminarSesionEmpleado_(token) {
  if (!token) return;
  CacheService.getScriptCache().remove(PORTAL_SESSION_PREFIX + token);
}

// Normaliza un ID de personal para comparar por VALOR numérico, no por
// texto exacto. Así "000000121", "0121" y "121" se consideran el mismo
// ID sin importar cuántos ceros a la izquierda escriba el trabajador
// (el ID institucional tiene 9 dígitos, pero en la base algunos
// registros quedaron guardados sin los ceros iniciales, p. ej. "121").
// Si el valor no es puramente numérico, se compara tal cual (no se
// toca nada).
function normalizarIdPersonal_(valor) {
  const str = String(valor == null ? '' : valor).trim();
  if (!str) return '';
  if (!/^\d+$/.test(str)) return str;
  const sinCeros = str.replace(/^0+/, '');
  return sinCeros === '' ? '0' : sinCeros;
}

// ============================================================
// 1. LOGIN DEL TRABAJADOR (usuario = ID Personal, clave = DNI)
// ============================================================
function loginPersonal(params) {
  try {
    const idPersonalIngresado = String(params.idPersonal || params.usuario || '').trim();
    const dni = String(params.dni || params.password || params.clave || '').trim();

    if (!idPersonalIngresado || !dni) {
      return createJsonResponse(false, 'Usuario o clave incorrectos.');
    }

    // Compara por valor numérico (ignorando ceros a la izquierda) para
    // que "000000121" y "121" se reconozcan como el mismo ID.
    const idPersonalNormalizado = normalizarIdPersonal_(idPersonalIngresado);

    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();

    let encontrado = null;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (normalizarIdPersonal_(row[1]) === idPersonalNormalizado && String(row[7]).trim() === dni) {
        encontrado = row;
        break;
      }
    }

    // Mensaje genérico a propósito: nunca revelar cuál de los dos
    // datos (ID o DNI) fue el incorrecto (punto 2 del requerimiento).
    if (!encontrado) {
      registrarAuditoria(idPersonalIngresado, 'LOGIN_FALLIDO', 'PortalPersonal', 'ID o DNI incorrectos');
      return createJsonResponse(false, 'Usuario o clave incorrectos.');
    }

    const code = encontrado[0];
    // A partir de aquí se usa el ID_PERSONAL TAL COMO está guardado en
    // la base (encontrado[1]), no lo que el trabajador tecleó — así la
    // sesión y el historial quedan siempre consistentes con la hoja,
    // sin importar cuántos ceros haya escrito al ingresar.
    const idPersonalReal = String(encontrado[1]).trim();
    const nombreCompleto = `${encontrado[4] || ''} ${encontrado[2] || ''} ${encontrado[3] || ''}`.trim();
    const token = crearTokenSesionEmpleado_(code, idPersonalReal);

    registrarAuditoria(idPersonalReal, 'LOGIN', 'PortalPersonal', `Ingreso al portal de autoactualización (${code})`, code);

    return createJsonResponse(true, 'Sesión iniciada correctamente', {
      token: token,
      nombre: nombreCompleto,
      expiraEnSegundos: PORTAL_SESSION_DURATION_SEC
    });

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

function logoutPersonal(params) {
  const sesion = obtenerSesionEmpleado_(params.token);
  eliminarSesionEmpleado_(params.token);
  if (sesion) {
    registrarAuditoria(sesion.idPersonal, 'LOGOUT', 'PortalPersonal', 'Cierre de sesión del portal');
  }
  return createJsonResponse(true, 'Sesión cerrada');
}

// ============================================================
// 2. CONSULTAR MIS DATOS (solo el propio registro)
// ============================================================
function misDatosPersonal(params) {
  try {
    const sesion = obtenerSesionEmpleado_(params.token);
    if (!sesion) {
      return createJsonResponse(false, 'Sesión inválida o expirada. Vuelve a iniciar sesión.');
    }

    const sheet = getSheet();
    const resultado = findRowByCode(sheet, sesion.code);
    if (!resultado || normalizarIdPersonal_(resultado.data[1]) !== normalizarIdPersonal_(sesion.idPersonal)) {
      return createJsonResponse(false, 'No se pudo cargar tu registro. Vuelve a iniciar sesión.');
    }

    // Solo se envían al navegador los campos marcados como Visible en
    // la configuración vigente (ver BD_CONFIG_CAMPOS_PORTAL) — los que
    // están en No Visible ni siquiera viajan en la respuesta.
    const config = obtenerConfigCamposPortal_();
    const camposVisibles = obtenerCamposVisiblesPortal_(config);
    const camposEditables = obtenerCamposEditablesPortal_(config);

    const campos = {};
    camposVisibles.forEach(nombre => {
      const idx = CAMPOS_PERSONAL.indexOf(nombre);
      const valorCelda = resultado.data[idx] || '';
      // Los campos de fecha viajan siempre como dd/mm/aaaa, nunca como
      // el ISO con hora que produce serializar un Date a JSON.
      campos[nombre] = CAMPOS_FECHA_PORTAL.indexOf(nombre) !== -1
        ? isoAFechaVisible_(normalizarFechaISO_(valorCelda))
        : valorCelda;
    });

    const estadoInfo = obtenerEstado_(sesion.code);

    return createJsonResponse(true, 'Datos obtenidos correctamente', {
      campos: campos,
      editables: camposEditables,
      soloLectura: camposVisibles.filter(c => camposEditables.indexOf(c) === -1),
      etiquetas: ETIQUETAS_CAMPOS_PERSONAL,
      estado: estadoInfo.estado,
      fechaUltimaActualizacion: estadoInfo.fecha
    });

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// 3. GUARDAR MIS DATOS (solo campos editables, solo el propio registro)
// ============================================================
function actualizarMisDatosPersonal(params) {
  try {
    const sesion = obtenerSesionEmpleado_(params.token);
    if (!sesion) {
      return createJsonResponse(false, 'Sesión inválida o expirada. Vuelve a iniciar sesión.');
    }

    const sheet = getSheet();
    // MUY IMPORTANTE: el registro a modificar sale de la SESIÓN, jamás
    // de params.CODE — así se evita que un trabajador autenticado como
    // 1001 pueda enviar el CODE de otra persona (punto 11 del
    // requerimiento: "impedir que un usuario cambie manualmente el ID
    // en una petición para modificar otro registro").
    const resultado = findRowByCode(sheet, sesion.code);
    if (!resultado || normalizarIdPersonal_(resultado.data[1]) !== normalizarIdPersonal_(sesion.idPersonal)) {
      return createJsonResponse(false, 'No se pudo identificar tu registro. Vuelve a iniciar sesión.');
    }

    // Validación previa: si el trabajador está cambiando su DNI, debe
    // seguir siendo único en la base (además de ser su clave de
    // acceso). Se revisa ANTES de escribir nada, para no dejar la
    // fila a medio actualizar si falla.
    if (params.DNI !== undefined) {
      const dniNuevo = String(params.DNI).trim();
      const dniActual = String(resultado.data[CAMPOS_PERSONAL.indexOf('DNI')] || '');
      if (dniNuevo && dniNuevo !== dniActual) {
        const dataCompleta = sheet.getDataRange().getValues();
        for (let i = 1; i < dataCompleta.length; i++) {
          if (i + 1 === resultado.rowIndex) continue;
          if (String(dataCompleta[i][7]) === dniNuevo) {
            return createJsonResponse(false, 'Ese DNI ya está registrado para otro trabajador.');
          }
        }
      }
    }

    // El backend nunca confía en la lista de campos que "cree" tener
    // el navegador: vuelve a calcular cuáles son editables ahora
    // mismo según BD_CONFIG_CAMPOS_PORTAL, así un cambio de
    // configuración se aplica de inmediato aunque el trabajador tenga
    // el formulario viejo abierto en la pestaña.
    const camposEditablesActuales = obtenerCamposEditablesPortal_(obtenerConfigCamposPortal_());

    const cambios = [];
    let cambioDni = false;
    camposEditablesActuales.forEach(campo => {
      if (params[campo] === undefined) return;
      const idx = CAMPOS_PERSONAL.indexOf(campo);

      // Campos de fecha: se comparan y guardan como fecha real (nunca
      // como texto plano), para que la celda no termine con el ISO
      // con hora ni pierda el formato dd/mm/aaaa en la próxima lectura.
      if (CAMPOS_FECHA_PORTAL.indexOf(campo) !== -1) {
        const valorAnteriorISO = normalizarFechaISO_(resultado.data[idx]);
        const valorNuevoISO = fechaVisibleAISO_(params[campo]);
        if (valorNuevoISO === null) return; // texto no es una fecha válida: se ignora, no se guarda basura
        if (valorAnteriorISO === valorNuevoISO) return;

        sheet.getRange(resultado.rowIndex, idx + 1).setValue(construirFechaCelda_(valorNuevoISO));
        cambios.push({
          campo,
          valorAnterior: isoAFechaVisible_(valorAnteriorISO),
          valorNuevo: isoAFechaVisible_(valorNuevoISO)
        });
        return;
      }

      const valorAnterior = String(resultado.data[idx] || '');
      const valorNuevo = String(params[campo]).trim();
      if (valorAnterior === valorNuevo) return;

      sheet.getRange(resultado.rowIndex, idx + 1).setValue(valorNuevo);
      cambios.push({ campo, valorAnterior, valorNuevo });
      if (campo === 'DNI') cambioDni = true;
    });

    const ahora = new Date();

    if (cambios.length === 0) {
      // El trabajador revisó y confirmó, aunque no haya cambiado nada.
      upsertEstado_(sesion.code, sesion.idPersonal, 'ACTUALIZADO');
      registrarAuditoria(sesion.idPersonal, 'REVISAR', 'PortalPersonal', `Revisó sus datos sin cambios (${sesion.code})`, sesion.code);
      return createJsonResponse(true, 'Tus datos ya estaban al día. Quedaron marcados como revisados.', {
        fecha: Utilities.formatDate(ahora, 'GMT-5', 'dd/MM/yyyy'),
        hora: Utilities.formatDate(ahora, 'GMT-5', 'HH:mm'),
        camposModificados: []
      });
    }

    // Trazabilidad: una fila por campo modificado, con valor anterior
    // y nuevo (punto 8 del requerimiento).
    const historial = getHistorialPersonalSheet_();
    cambios.forEach(c => {
      historial.appendRow([ahora, sesion.idPersonal, sesion.code, c.campo, c.valorAnterior, c.valorNuevo]);
    });

    upsertEstado_(sesion.code, sesion.idPersonal, 'MODIFICADO');

    const detalle = cambios.map(c => `${ETIQUETAS_CAMPOS_PERSONAL[c.campo] || c.campo}: "${c.valorAnterior}" → "${c.valorNuevo}"`).join('; ');
    registrarAuditoria(sesion.idPersonal, 'ACTUALIZAR', 'PortalPersonal', `Autoactualización (${sesion.code}) — ${detalle}`, sesion.code);

    let mensaje = 'Tu información ha sido actualizada correctamente.';
    if (cambioDni) {
      // El DNI es también la clave de acceso: si cambió, la sesión
      // sigue viva por token, pero la PRÓXIMA vez debe ingresar con
      // el nuevo DNI. Se avisa explícitamente para que no quede
      // fuera del portal sin saber por qué.
      mensaje += ' Como cambiaste tu DNI, la próxima vez que ingreses usa tu nuevo DNI como clave.';
    }

    return createJsonResponse(true, mensaje, {
      fecha: Utilities.formatDate(ahora, 'GMT-5', 'dd/MM/yyyy'),
      hora: Utilities.formatDate(ahora, 'GMT-5', 'HH:mm'),
      camposModificados: cambios.map(c => c.campo),
      claveCambiada: cambioDni
    });

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// 4. VISTA PARA EL ADMINISTRADOR: estado de actualización de todos
// ============================================================
// Acción administrativa (requiere sesión admin normal, igual que
// "list"). Cruza "tabla" con BD_ESTADO_ACTUALIZACION para que el
// Administrador Principal pueda ver de un vistazo quién ya revisó sus
// datos, quién los modificó y quién sigue pendiente (punto 9).
function listEstadosPersonal(params) {
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();

    const estadoSheet = getEstadoSheet_();
    const estadoData = estadoSheet.getDataRange().getValues();
    const estadoPorCode = {};
    for (let i = 1; i < estadoData.length; i++) {
      estadoPorCode[String(estadoData[i][0])] = {
        estado: estadoData[i][2] || 'PENDIENTE',
        fecha: estadoData[i][3] instanceof Date ? estadoData[i][3].toISOString() : String(estadoData[i][3] || '')
      };
    }

    const resultado = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0] && !row[1]) continue;
      const code = row[0];
      const info = estadoPorCode[String(code)] || { estado: 'PENDIENTE', fecha: '' };
      resultado.push({
        CODE: code,
        ID_PERSONAL: row[1] || '',
        NOMBRE_COMPLETO: `${row[4] || ''} ${row[2] || ''} ${row[3] || ''}`.trim(),
        ESTADO: info.estado,
        FECHA_ULTIMA_ACTUALIZACION: info.fecha
      });
    }

    return createJsonResponse(true, 'Estados obtenidos correctamente', resultado);

  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

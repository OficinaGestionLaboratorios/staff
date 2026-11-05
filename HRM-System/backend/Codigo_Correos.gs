// ============================================================
// CODIGO_CORREOS.GS — Base de datos persistente de correos (v84)
// ============================================================
// Hoja BD_CORREOS (se autogenera). Guarda, para cada envío de correo
// desde cualquier módulo, los destinatarios usados, asociados al
// trabajador (CODE) y a su área, para recuperarlos y autocompletarlos
// en futuros envíos. También recibe la importación masiva desde Excel.
//
// Clave lógica de un registro: EMAIL (minúsculas) + CODE. CODE vacío
// = contacto de área/responsable que no depende de un trabajador.
// ============================================================
const CORREOS_SHEET_NAME = 'BD_CORREOS';
const CORREOS_HEADERS = [
  'ID_CORREO', 'EMAIL', 'NOMBRE', 'CODE', 'ID_PERSONAL', 'TRABAJADOR', 'AREA',
  'TIPO', 'CAMPO', 'USOS', 'ULTIMO_USO', 'FECHA_REGISTRO', 'ORIGEN', 'MODULOS', 'USUARIO'
];
const CORREOS_TIPOS = ['Trabajador', 'Responsable', 'Jefatura', 'Área', 'Otro'];

function getCorreosSheet_() {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(CORREOS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CORREOS_SHEET_NAME);
    sh.appendRow(CORREOS_HEADERS);
    sh.getRange(1, 1, 1, CORREOS_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function normalizarEmailCorreo_(v) {
  const e = String(v || '').trim().toLowerCase().replace(/^<|>$/g, '');
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e) ? e : '';
}

function siguienteIdCorreo_(data) {
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][0] || '').match(/^CR-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'CR-' + String(max + 1).padStart(6, '0');
}

function objetoCorreo_(row) {
  const H = CORREOS_HEADERS, g = c => row[H.indexOf(c)];
  const f = v => v instanceof Date ? v.toISOString() : (v || '');
  return {
    ID_CORREO: g('ID_CORREO') || '', EMAIL: g('EMAIL') || '', NOMBRE: g('NOMBRE') || '', CODE: String(g('CODE') || ''),
    ID_PERSONAL: String(g('ID_PERSONAL') || ''), TRABAJADOR: g('TRABAJADOR') || '', AREA: g('AREA') || '',
    TIPO: g('TIPO') || 'Otro', CAMPO: g('CAMPO') || 'PARA', USOS: parseInt(g('USOS'), 10) || 0,
    ULTIMO_USO: f(g('ULTIMO_USO')), FECHA_REGISTRO: f(g('FECHA_REGISTRO')), ORIGEN: g('ORIGEN') || '', MODULOS: g('MODULOS') || ''
  };
}

function listCorreos(params) {
  try {
    const data = getCorreosSheet_().getDataRange().getValues();
    const out = [];
    for (let i = 1; i < data.length; i++) if (data[i][1]) out.push(objetoCorreo_(data[i]));
    return createJsonResponse(true, 'Correos obtenidos', out);
  } catch (e) { return createJsonResponse(false, e.toString()); }
}

// Inserta o actualiza una lista de correos. opciones.sumarUso = true
// incrementa USOS y actualiza ULTIMO_USO (envíos reales); false = alta
// sin uso (importación / alta manual).
function upsertCorreos_(items, opciones) {
  const sh = getCorreosSheet_();
  const data = sh.getDataRange().getValues();
  const H = CORREOS_HEADERS, iEmail = H.indexOf('EMAIL'), iCode = H.indexOf('CODE');
  const indice = {};
  for (let i = 1; i < data.length; i++) indice[String(data[i][iEmail]).toLowerCase() + '|' + String(data[i][iCode] || '')] = i;
  const ahora = new Date();
  const nuevas = [];
  let actualizados = 0, nuevos = 0, omitidos = 0;
  let siguiente = parseInt(siguienteIdCorreo_(data).replace('CR-', ''), 10);

  (items || []).forEach(it => {
    const email = normalizarEmailCorreo_(it.email || it.EMAIL);
    if (!email) { omitidos++; return; }
    const code = String(it.code !== undefined ? it.code : (it.CODE || ''));
    const clave = email + '|' + code;
    const campo = String(it.campo || it.CAMPO || 'PARA').toUpperCase() === 'CC' ? 'CC' : 'PARA';
    const tipoIn = String(it.tipo || it.TIPO || '').trim();
    const tipo = CORREOS_TIPOS.indexOf(tipoIn) !== -1 ? tipoIn : '';
    const modulo = String(it.modulo || it.MODULO || opciones.modulo || '').trim();
    const idx = indice[clave];
    if (idx !== undefined) {
      const fila = data[idx];
      const set = (c, v) => { if (v !== '' && v !== undefined && v !== null) fila[H.indexOf(c)] = v; };
      set('NOMBRE', it.nombre || it.NOMBRE);
      set('ID_PERSONAL', it.id_personal || it.ID_PERSONAL);
      set('TRABAJADOR', it.trabajador || it.TRABAJADOR);
      set('AREA', it.area || it.AREA);
      if (tipo) fila[H.indexOf('TIPO')] = tipo;
      fila[H.indexOf('CAMPO')] = campo;
      if (opciones.sumarUso) { fila[H.indexOf('USOS')] = (parseInt(fila[H.indexOf('USOS')], 10) || 0) + 1; fila[H.indexOf('ULTIMO_USO')] = ahora; }
      if (modulo) {
        const mods = String(fila[H.indexOf('MODULOS')] || '').split(',').map(s => s.trim()).filter(Boolean);
        if (mods.indexOf(modulo) === -1) mods.push(modulo);
        fila[H.indexOf('MODULOS')] = mods.join(', ');
      }
      sh.getRange(idx + 1, 1, 1, H.length).setValues([fila]);
      actualizados++;
    } else {
      const fila = new Array(H.length).fill('');
      const put = (c, v) => { fila[H.indexOf(c)] = v; };
      put('ID_CORREO', 'CR-' + String(siguiente++).padStart(6, '0'));
      put('EMAIL', email); put('NOMBRE', it.nombre || it.NOMBRE || ''); put('CODE', code);
      put('ID_PERSONAL', it.id_personal || it.ID_PERSONAL || ''); put('TRABAJADOR', it.trabajador || it.TRABAJADOR || '');
      put('AREA', it.area || it.AREA || ''); put('TIPO', tipo || 'Otro'); put('CAMPO', campo);
      put('USOS', opciones.sumarUso ? 1 : 0); put('ULTIMO_USO', opciones.sumarUso ? ahora : '');
      put('FECHA_REGISTRO', ahora); put('ORIGEN', opciones.origen || 'ENVIO'); put('MODULOS', modulo); put('USUARIO', opciones.usuario || '');
      nuevas.push(fila);
      indice[clave] = data.length + nuevas.length - 1;   // evita duplicar dentro del mismo lote
      data.push(fila);
      nuevos++;
    }
  });
  if (nuevas.length) sh.getRange(sh.getLastRow() + 1, 1, nuevas.length, H.length).setValues(nuevas);
  return { nuevos: nuevos, actualizados: actualizados, omitidos: omitidos };
}

function parsearItemsCorreo_(txt) {
  let v;
  try { v = JSON.parse(txt || '[]'); } catch (e) { return null; }
  return Array.isArray(v) ? v : null;
}

// Guarda los destinatarios de un envío real. params: DESTINATARIOS_JSON
// [{email, campo, tipo?, nombre?}], CODE, ID_PERSONAL, TRABAJADOR, AREA, MODULO.
function registrarCorreosUso(params) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const lista = parsearItemsCorreo_(params.DESTINATARIOS_JSON);
    if (!lista) return createJsonResponse(false, 'DESTINATARIOS_JSON inválido');
    const base = { code: params.CODE || '', id_personal: params.ID_PERSONAL || '', trabajador: params.TRABAJADOR || '', area: params.AREA || '' };
    const items = lista.map(x => Object.assign({}, base, x, { code: x.code !== undefined ? x.code : base.code }));
    const r = upsertCorreos_(items, { sumarUso: true, origen: 'ENVIO', modulo: params.MODULO || '', usuario: params.__usuario || '' });
    return createJsonResponse(true, 'Destinatarios guardados', r);
  } catch (e) { return createJsonResponse(false, e.toString()); }
  finally { try { lock.releaseLock(); } catch (e2) {} }
}

// Importación masiva (Excel). params: ITEMS_JSON (cuerpo POST).
function importarCorreos(params) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const lista = parsearItemsCorreo_(params.ITEMS_JSON);
    if (!lista || !lista.length) return createJsonResponse(false, 'No hay correos para importar');
    const r = upsertCorreos_(lista, { sumarUso: false, origen: 'IMPORTACION', usuario: params.__usuario || '' });
    registrarAuditoria(params.__usuario, 'IMPORTAR', 'Correos', `Importación de correos: ${r.nuevos} nuevo(s), ${r.actualizados} actualizado(s), ${r.omitidos} omitido(s)`, '');
    return createJsonResponse(true, 'Importación completada', r);
  } catch (e) { return createJsonResponse(false, e.toString()); }
  finally { try { lock.releaseLock(); } catch (e2) {} }
}

// Alta/edición manual de un contacto. params: ID_CORREO (si edita), EMAIL, NOMBRE, CODE, TRABAJADOR, AREA, TIPO, CAMPO.
function saveCorreo(params) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const email = normalizarEmailCorreo_(params.EMAIL);
    if (!email) return createJsonResponse(false, 'El correo no es válido');
    const sh = getCorreosSheet_(), data = sh.getDataRange().getValues(), H = CORREOS_HEADERS;
    if (params.ID_CORREO) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(params.ID_CORREO)) {
          const f = data[i];
          f[H.indexOf('EMAIL')] = email; f[H.indexOf('NOMBRE')] = params.NOMBRE || '';
          f[H.indexOf('TRABAJADOR')] = params.TRABAJADOR || ''; f[H.indexOf('AREA')] = params.AREA || '';
          if (params.CODE !== undefined) f[H.indexOf('CODE')] = params.CODE;
          if (params.ID_PERSONAL !== undefined) f[H.indexOf('ID_PERSONAL')] = params.ID_PERSONAL;
          if (CORREOS_TIPOS.indexOf(params.TIPO) !== -1) f[H.indexOf('TIPO')] = params.TIPO;
          f[H.indexOf('CAMPO')] = String(params.CAMPO).toUpperCase() === 'CC' ? 'CC' : 'PARA';
          sh.getRange(i + 1, 1, 1, H.length).setValues([f]);
          return createJsonResponse(true, 'Correo actualizado');
        }
      }
      return createJsonResponse(false, 'No se encontró el correo a editar');
    }
    const r = upsertCorreos_([{ email: email, nombre: params.NOMBRE, code: params.CODE || '', id_personal: params.ID_PERSONAL, trabajador: params.TRABAJADOR, area: params.AREA, tipo: params.TIPO, campo: params.CAMPO }],
      { sumarUso: false, origen: 'MANUAL', usuario: params.__usuario || '' });
    return createJsonResponse(true, r.nuevos ? 'Correo agregado' : 'El correo ya existía: se actualizó', r);
  } catch (e) { return createJsonResponse(false, e.toString()); }
  finally { try { lock.releaseLock(); } catch (e2) {} }
}

function deleteCorreo(params) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const id = params.ID_CORREO || params.idCorreo;
    if (!id) return createJsonResponse(false, 'ID_CORREO es requerido');
    const sh = getCorreosSheet_(), data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { sh.deleteRow(i + 1); return createJsonResponse(true, 'Correo eliminado de la base'); }
    }
    return createJsonResponse(false, 'No se encontró el correo');
  } catch (e) { return createJsonResponse(false, e.toString()); }
  finally { try { lock.releaseLock(); } catch (e2) {} }
}

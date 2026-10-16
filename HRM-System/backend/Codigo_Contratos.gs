// ============================================================
// CODIGO_CONTRATOS.GS — Historial de períodos contractuales
// ============================================================
// Reutiliza lo que ya expone Codigo_corregido.gs (mismo proyecto de
// Apps Script): getSpreadsheet(), getSheet(), findRowByCode(),
// createJsonResponse(), registrarAuditoria(), formatearFechaSoloDia(),
// getCodeParam(), requerirAdmin_().
//
// MODELO
//   · Hoja "tabla" (personal): FECHA_VINCULACION es el primer ingreso y
//     NO cambia con las renovaciones. INICIO_PERIODO / CESE_PERIODO /
//     CANT_PERIODO pasan a ser un REFLEJO del contrato más reciente de
//     BD_CONTRATOS (se recalculan solos tras cada cambio), de modo que
//     el listado, el portal del personal y los informes que ya leen
//     esas columnas siguen funcionando sin tocarlos.
//   · Hoja "BD_CONTRATOS": UNA fila por contrato (período). Renovar =
//     insertar una fila nueva. Nunca se borra ni se sobrescribe un
//     contrato anterior; corregir uno exige un motivo y deja constancia
//     en la propia fila (CORREGIDO / MOTIVO_CORRECCION) y en
//     BD_AUDITORIA con el valor anterior y el nuevo.
//   · CESE_PERIODO vacío = contrato sin fecha de término (p. ej.
//     Permanente). Mientras esté abierto no se puede registrar otro.
//
// Fechas: siempre "YYYY-MM-DD" (texto), igual que el resto del sistema.
// ============================================================

const CONTRATOS_SHEET_NAME = 'BD_CONTRATOS';
const CONTRATOS_HEADERS = [
  'ID_CONTRATO', 'FECHA_REGISTRO', 'CODE', 'NUMERO', 'TIPO_CONTRATO',
  'INICIO_PERIODO', 'CESE_PERIODO', 'OBSERVACION', 'USUARIO_REGISTRO',
  'CORREGIDO', 'MOTIVO_CORRECCION', 'FECHA_CORRECCION', 'USUARIO_CORRECCION'
];
// Índices (base 0) dentro de CONTRATOS_HEADERS
const CT = { ID: 0, REG: 1, CODE: 2, NUM: 3, TIPO: 4, INI: 5, CESE: 6, OBS: 7, USR: 8, CORR: 9, MOT: 10, FCORR: 11, UCORR: 12 };

// Columnas (base 1) de la hoja "tabla" que se reflejan desde el contrato vigente
const TABLA_COL_TIPO_CONTRATO = 15;
const TABLA_COL_FECHA_VINCULACION = 18;
const TABLA_COL_INICIO_PERIODO = 19;
const TABLA_COL_CESE_PERIODO = 20;
const TABLA_COL_CANT_PERIODO = 21;

function getContratosSheet() {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(CONTRATOS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONTRATOS_SHEET_NAME);
    sh.appendRow(CONTRATOS_HEADERS);
    sh.getRange(1, 1, 1, CONTRATOS_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Fechas como texto plano para que Sheets no las convierta en Date.
    [CT.INI + 1, CT.CESE + 1, CT.FCORR + 1].forEach(function (c) {
      sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  }
  return sh;
}

// ---------- utilidades de fecha (puras) ----------
function esFechaISO_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

function diaNumContrato_(s) {
  const p = String(s).split('-');
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000;
}

// ---------- lectura ----------
function filaAContrato_(row, rowIndex) {
  const reg = row[CT.REG];
  return {
    rowIndex: rowIndex,
    ID_CONTRATO: String(row[CT.ID] || ''),
    FECHA_REGISTRO: reg instanceof Date ? reg.toISOString() : (reg || ''),
    CODE: String(row[CT.CODE] || ''),
    NUMERO: Number(row[CT.NUM]) || 0,
    TIPO_CONTRATO: row[CT.TIPO] || '',
    INICIO_PERIODO: formatearFechaSoloDia(row[CT.INI]),
    CESE_PERIODO: formatearFechaSoloDia(row[CT.CESE]),
    OBSERVACION: row[CT.OBS] || '',
    USUARIO_REGISTRO: row[CT.USR] || '',
    CORREGIDO: String(row[CT.CORR]).toUpperCase() === 'SI',
    MOTIVO_CORRECCION: row[CT.MOT] || '',
    FECHA_CORRECCION: formatearFechaSoloDia(row[CT.FCORR]),
    USUARIO_CORRECCION: row[CT.UCORR] || ''
  };
}

// Contratos de un trabajador, ordenados por fecha de inicio.
function leerContratos_(sh, code, data) {
  data = data || sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][CT.ID]) continue;
    if (code && String(data[i][CT.CODE]) !== String(code)) continue;
    out.push(filaAContrato_(data[i], i + 1));
  }
  out.sort(function (a, b) { return a.INICIO_PERIODO < b.INICIO_PERIODO ? -1 : a.INICIO_PERIODO > b.INICIO_PERIODO ? 1 : 0; });
  return out;
}

function generarIdContrato_(data) {
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][CT.ID] || '').match(/^CT-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'CT-' + String(max + 1).padStart(6, '0');
}

// ---------- validación ----------
// excluirId: al corregir un contrato no se compara contra sí mismo.
// Devuelve un mensaje de error (string) o '' si todo está bien.
function validarContrato_(existentes, inicio, cese, vinculacion, excluirId, esNuevo) {
  if (!esFechaISO_(inicio)) return 'La fecha de inicio del contrato es obligatoria (formato AAAA-MM-DD)';
  if (cese && !esFechaISO_(cese)) return 'La fecha de cese no es válida';
  if (cese && diaNumContrato_(cese) < diaNumContrato_(inicio)) return 'La fecha de cese no puede ser anterior a la de inicio';
  if (vinculacion && diaNumContrato_(inicio) < diaNumContrato_(vinculacion)) {
    return 'El inicio del contrato (' + inicio + ') es anterior a la fecha de vinculación (' + vinculacion + '). Si la vinculación es incorrecta, corríjala primero indicando el motivo.';
  }
  const otros = existentes.filter(function (c) { return c.ID_CONTRATO !== excluirId; });
  if (esNuevo) {
    const abierto = otros.filter(function (c) { return !c.CESE_PERIODO; })[0];
    if (abierto) return 'El contrato N.º ' + abierto.NUMERO + ' no tiene fecha de cese. Regístrela antes de añadir una renovación.';
  }
  for (let i = 0; i < otros.length; i++) {
    const o = otros[i];
    const oIni = diaNumContrato_(o.INICIO_PERIODO);
    const oFin = o.CESE_PERIODO ? diaNumContrato_(o.CESE_PERIODO) : Infinity;
    const nIni = diaNumContrato_(inicio);
    const nFin = cese ? diaNumContrato_(cese) : Infinity;
    if (nIni <= oFin && nFin >= oIni) {
      return 'Las fechas se solapan con el contrato N.º ' + o.NUMERO + ' (' + o.INICIO_PERIODO + ' a ' + (o.CESE_PERIODO || 'sin cese') + ')';
    }
  }
  return '';
}

// ---------- efectos sobre la ficha ----------
// Reasigna NUMERO (1..n) por orden de inicio, para un trabajador.
function renumerarContratos_(sh, code) {
  const lista = leerContratos_(sh, code);
  lista.forEach(function (c, i) {
    if (c.NUMERO !== i + 1) sh.getRange(c.rowIndex, CT.NUM + 1).setValue(i + 1);
  });
  return lista.map(function (c, i) { c.NUMERO = i + 1; return c; });
}

// Refleja en la hoja "tabla" el contrato más reciente y la cantidad.
function sincronizarFichaPersonal_(code, lista) {
  const tabla = getSheet();
  const r = findRowByCode(tabla, code);
  if (!r) return;
  const fila = r.rowIndex;
  tabla.getRange(fila, TABLA_COL_CANT_PERIODO).setValue(lista.length);
  if (!lista.length) {
    // Sin contratos (p. ej. se eliminó el único): se limpia el reflejo; la vinculación no se toca.
    tabla.getRange(fila, TABLA_COL_INICIO_PERIODO).setValue('');
    tabla.getRange(fila, TABLA_COL_CESE_PERIODO).setValue('');
    return;
  }
  const ultimo = lista[lista.length - 1];
  tabla.getRange(fila, TABLA_COL_INICIO_PERIODO).setValue(ultimo.INICIO_PERIODO);
  tabla.getRange(fila, TABLA_COL_CESE_PERIODO).setValue(ultimo.CESE_PERIODO || '');
  if (ultimo.TIPO_CONTRATO) tabla.getRange(fila, TABLA_COL_TIPO_CONTRATO).setValue(ultimo.TIPO_CONTRATO);
  // La vinculación solo se completa si estaba vacía; nunca se pisa.
  if (!formatearFechaSoloDia(r.data[TABLA_COL_FECHA_VINCULACION - 1])) {
    tabla.getRange(fila, TABLA_COL_FECHA_VINCULACION).setValue(lista[0].INICIO_PERIODO);
  }
}

function conBloqueo_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// Inserta un contrato (sin validar permisos). Usado por createContrato,
// por el alta de personal y por la migración.
function insertarContrato_(sh, code, tipo, inicio, cese, obs, usuario) {
  const data = sh.getDataRange().getValues();
  const id = generarIdContrato_(data);
  sh.appendRow([id, new Date(), code, 0, tipo || '', inicio, cese || '', obs || '', usuario || '', '', '', '', '']);
  const lista = renumerarContratos_(sh, code);
  sincronizarFichaPersonal_(code, lista);
  return { id: id, lista: lista };
}

// ---------- acciones ----------
function listContratos(params) {
  try {
    const sh = getContratosSheet();
    const lista = leerContratos_(sh, getCodeParam(params));
    lista.forEach(function (c) { delete c.rowIndex; });
    return createJsonResponse(true, 'Contratos obtenidos', lista);
  } catch (e) { return createJsonResponse(false, e.toString()); }
}

// Registrar una renovación (o el primer contrato) — NUEVA FILA.
function createContrato(params) {
  try {
    return conBloqueo_(function () {
      const code = getCodeParam(params);
      if (!code) return createJsonResponse(false, 'CODE del trabajador es requerido');
      const tabla = getSheet();
      const emp = findRowByCode(tabla, code);
      if (!emp) return createJsonResponse(false, 'Trabajador no encontrado');

      const sh = getContratosSheet();
      const existentes = leerContratos_(sh, code);
      const vinc = formatearFechaSoloDia(emp.data[TABLA_COL_FECHA_VINCULACION - 1]);
      const inicio = String(params.INICIO_PERIODO || '').trim();
      const cese = String(params.CESE_PERIODO || '').trim();

      const err = validarContrato_(existentes, inicio, cese, vinc, '', true);
      if (err) return createJsonResponse(false, err);

      const res = insertarContrato_(sh, code, params.TIPO_CONTRATO || emp.data[TABLA_COL_TIPO_CONTRATO - 1], inicio, cese, params.OBSERVACION, params.__usuario);
      const nuevo = res.lista.filter(function (c) { return c.ID_CONTRATO === res.id; })[0];
      registrarAuditoria(params.__usuario, 'CREAR', 'Contratos',
        'Contrato N.º ' + nuevo.NUMERO + ' de ' + code + ': ' + inicio + ' a ' + (cese || 'sin cese') + ' (' + res.id + ')', code);
      return createJsonResponse(true, 'Contrato registrado', { ID_CONTRATO: res.id, NUMERO: nuevo.NUMERO, CANT_PERIODO: res.lista.length });
    });
  } catch (e) { return createJsonResponse(false, e.toString()); }
}

// Corregir fechas/tipo de un contrato existente. Exige motivo.
function updateContrato(params) {
  try {
    return conBloqueo_(function () {
      const id = params.ID_CONTRATO;
      const motivo = String(params.MOTIVO_CORRECCION || '').trim();
      if (!id) return createJsonResponse(false, 'ID_CONTRATO es requerido');
      if (motivo.length < 5) return createJsonResponse(false, 'Debe indicar el motivo de la corrección (mínimo 5 caracteres)');

      const sh = getContratosSheet();
      const todos = leerContratos_(sh, '');
      const actual = todos.filter(function (c) { return c.ID_CONTRATO === String(id); })[0];
      if (!actual) return createJsonResponse(false, 'Contrato no encontrado');

      const code = actual.CODE;
      const emp = findRowByCode(getSheet(), code);
      const vinc = emp ? formatearFechaSoloDia(emp.data[TABLA_COL_FECHA_VINCULACION - 1]) : '';
      const inicio = params.INICIO_PERIODO !== undefined ? String(params.INICIO_PERIODO).trim() : actual.INICIO_PERIODO;
      const cese = params.CESE_PERIODO !== undefined ? String(params.CESE_PERIODO).trim() : actual.CESE_PERIODO;
      const tipo = params.TIPO_CONTRATO !== undefined ? params.TIPO_CONTRATO : actual.TIPO_CONTRATO;

      const mismos = todos.filter(function (c) { return c.CODE === code; });
      const err = validarContrato_(mismos, inicio, cese, vinc, actual.ID_CONTRATO, false);
      if (err) return createJsonResponse(false, err);

      const f = actual.rowIndex;
      sh.getRange(f, CT.TIPO + 1).setValue(tipo || '');
      sh.getRange(f, CT.INI + 1).setValue(inicio);
      sh.getRange(f, CT.CESE + 1).setValue(cese || '');
      if (params.OBSERVACION !== undefined) sh.getRange(f, CT.OBS + 1).setValue(params.OBSERVACION);
      sh.getRange(f, CT.CORR + 1).setValue('SI');
      sh.getRange(f, CT.MOT + 1).setValue(motivo);
      sh.getRange(f, CT.FCORR + 1).setValue(formatearFechaSoloDia(new Date()));
      sh.getRange(f, CT.UCORR + 1).setValue(params.__usuario || '');

      const lista = renumerarContratos_(sh, code);
      sincronizarFichaPersonal_(code, lista);
      registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Contratos',
        'Corrección de ' + actual.ID_CONTRATO + ' (' + code + '): ' + actual.INICIO_PERIODO + ' a ' + (actual.CESE_PERIODO || 'sin cese') +
        ' → ' + inicio + ' a ' + (cese || 'sin cese') + '. Motivo: ' + motivo, code);
      return createJsonResponse(true, 'Contrato corregido');
    });
  } catch (e) { return createJsonResponse(false, e.toString()); }
}

// Eliminar un contrato registrado (p. ej. cargado por error). Exige motivo,
// renumera los restantes, recalcula la ficha y deja el detalle completo del
// contrato borrado en BD_AUDITORIA.
function deleteContrato(params) {
  try {
    return conBloqueo_(function () {
      const id = String(params.ID_CONTRATO || '');
      const motivo = String(params.MOTIVO_CORRECCION || '').trim();
      if (!id) return createJsonResponse(false, 'ID_CONTRATO es requerido');
      if (motivo.length < 5) return createJsonResponse(false, 'Debe indicar el motivo de la eliminación (mínimo 5 caracteres)');

      const sh = getContratosSheet();
      const actual = leerContratos_(sh, '').filter(function (c) { return c.ID_CONTRATO === id; })[0];
      if (!actual) return createJsonResponse(false, 'Contrato no encontrado');

      sh.deleteRow(actual.rowIndex);
      const lista = renumerarContratos_(sh, actual.CODE);
      sincronizarFichaPersonal_(actual.CODE, lista);
      registrarAuditoria(params.__usuario, 'ELIMINAR', 'Contratos',
        'Contrato eliminado ' + actual.ID_CONTRATO + ' (N.º ' + actual.NUMERO + ') de ' + actual.CODE + ': ' + actual.INICIO_PERIODO + ' a ' +
        (actual.CESE_PERIODO || 'sin cese') + ' [' + (actual.TIPO_CONTRATO || 'sin tipo') + ']. Motivo: ' + motivo, actual.CODE);
      return createJsonResponse(true, 'Contrato eliminado', { CANT_PERIODO: lista.length });
    });
  } catch (e) { return createJsonResponse(false, e.toString()); }
}

// Corrección justificada de la fecha de PRIMERA vinculación.
function corregirVinculacion(params) {
  try {
    return conBloqueo_(function () {
      const code = getCodeParam(params);
      const nueva = String(params.FECHA_VINCULACION || '').trim();
      const motivo = String(params.MOTIVO_CORRECCION || '').trim();
      if (!code) return createJsonResponse(false, 'CODE del trabajador es requerido');
      if (!esFechaISO_(nueva)) return createJsonResponse(false, 'Fecha de vinculación no válida');
      if (motivo.length < 5) return createJsonResponse(false, 'Debe indicar el motivo de la corrección (mínimo 5 caracteres)');

      const tabla = getSheet();
      const emp = findRowByCode(tabla, code);
      if (!emp) return createJsonResponse(false, 'Trabajador no encontrado');

      const lista = leerContratos_(getContratosSheet(), code);
      if (lista.length && diaNumContrato_(nueva) > diaNumContrato_(lista[0].INICIO_PERIODO)) {
        return createJsonResponse(false, 'La vinculación no puede ser posterior al primer contrato registrado (' + lista[0].INICIO_PERIODO + ')');
      }
      const anterior = formatearFechaSoloDia(emp.data[TABLA_COL_FECHA_VINCULACION - 1]);
      tabla.getRange(emp.rowIndex, TABLA_COL_FECHA_VINCULACION).setValue(nueva);
      registrarAuditoria(params.__usuario, 'ACTUALIZAR', 'Contratos',
        'Corrección de FECHA_VINCULACION de ' + code + ': ' + (anterior || '(vacía)') + ' → ' + nueva + '. Motivo: ' + motivo, code);
      return createJsonResponse(true, 'Fecha de vinculación corregida');
    });
  } catch (e) { return createJsonResponse(false, e.toString()); }
}

// Migración única (solo administrador): convierte el contrato que ya
// guardaba cada ficha (INICIO/CESE_PERIODO) en el contrato N.º 1 de
// BD_CONTRATOS. Idempotente: salta a quien ya tiene contratos.
// params.simular = '1' solo informa, sin escribir.
// OJO: CANT_PERIODO pasa a ser el nº de contratos registrados; el valor
// anterior de la ficha se conserva en la OBSERVACION del contrato 1.
function migrarContratos(params) {
  try {
    const adm = requerirAdmin_(params);
    if (adm.error) return adm.error;
    return conBloqueo_(function () {
      const simular = String(params.simular || '') === '1';
      const tabla = getSheet();
      const datos = tabla.getDataRange().getValues();
      const sh = getContratosSheet();
      const yaTienen = {};
      leerContratos_(sh, '').forEach(function (c) { yaTienen[c.CODE] = true; });

      const migrados = [], omitidos = [];
      for (let i = 1; i < datos.length; i++) {
        const row = datos[i], code = String(row[0] || '');
        if (!code) continue;
        const ini = formatearFechaSoloDia(row[TABLA_COL_INICIO_PERIODO - 1]);
        const cese = formatearFechaSoloDia(row[TABLA_COL_CESE_PERIODO - 1]);
        if (yaTienen[code]) { omitidos.push(code + ' (ya tiene contratos)'); continue; }
        if (!esFechaISO_(ini)) { omitidos.push(code + ' (sin INICIO_PERIODO)'); continue; }
        if (cese && !esFechaISO_(cese)) { omitidos.push(code + ' (CESE_PERIODO inválido)'); continue; }
        if (cese && diaNumContrato_(cese) < diaNumContrato_(ini)) { omitidos.push(code + ' (cese anterior al inicio)'); continue; }
        migrados.push(code);
        if (simular) continue;
        const cantAnterior = row[TABLA_COL_CANT_PERIODO - 1];
        const obs = 'Migrado desde la ficha de personal' + (cantAnterior !== '' ? ' (CANT_PERIODO anterior: ' + cantAnterior + ')' : '');
        insertarContrato_(sh, code, row[TABLA_COL_TIPO_CONTRATO - 1], ini, cese, obs, params.__usuario || 'migración');
      }
      if (!simular) registrarAuditoria(params.__usuario, 'CREAR', 'Contratos', 'Migración de contratos: ' + migrados.length + ' migrados, ' + omitidos.length + ' omitidos', '');
      return createJsonResponse(true, simular ? 'Simulación (no se escribió nada)' : 'Migración completada', { migrados: migrados, omitidos: omitidos });
    });
  } catch (e) { return createJsonResponse(false, e.toString()); }
}

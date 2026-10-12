// ============================================================
// CODIGO_PROPUESTAS.GS — Bandeja temporal de PROPUESTAS del personal
// ============================================================
// El trabajador (sesión del portal, la misma de Codigo_PortalPersonal.gs)
// PLANTEA propuestas de: HORARIO, PERMISO, VACACION y LICENCIA.
// Nada de esto toca las hojas oficiales (BD_HORARIOS, BD_PERMISOS,
// BD_VACACIONES, BD_LICENCIAS): se guarda aparte en BD_PROPUESTAS
// con ESTADO = PENDIENTE.
//
// El administrador (jefe) las revisa en su módulo "Propuestas",
// puede ajustar los datos y recién al APROBAR se registran en la hoja
// oficial reutilizando createHorario / createPermiso / createVacacion /
// registrarGoceVacacion / createLicencia. Si RECHAZA, queda el
// comentario y no se registra nada oficial.
//
// INSTALACIÓN: pegar como archivo nuevo "Codigo_Propuestas" en el
// mismo proyecto de Apps Script y volver a publicar (Nueva versión).
// ============================================================

const PROPUESTAS_SHEET_NAME = 'BD_PROPUESTAS';
const PROPUESTAS_HEADERS = [
  'ID_PROPUESTA', 'FECHA_REGISTRO', 'CODE', 'ID_PERSONAL', 'EMPLEADO',
  'TIPO', 'RESUMEN', 'DATOS_JSON', 'ESTADO',
  'FECHA_RESOLUCION', 'RESUELTO_POR', 'COMENTARIO_ADMIN', 'ID_REGISTRO_OFICIAL'
];
const PROPUESTAS_TIPOS = ['HORARIO', 'PERMISO', 'VACACION', 'LICENCIA'];
const PROPUESTAS_MAX_PENDIENTES_POR_TIPO = 5; // evita que se llene la bandeja

function getPropuestasSheet_() {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(PROPUESTAS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PROPUESTAS_SHEET_NAME);
    sh.appendRow(PROPUESTAS_HEADERS);
    sh.getRange(1, 1, 1, PROPUESTAS_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function siguienteIdPropuesta_(data) {
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][0] || '').match(/^PP-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'PP-' + String(max + 1).padStart(6, '0');
}

function objPropuesta_(row) {
  const h = PROPUESTAS_HEADERS, g = c => row[h.indexOf(c)];
  const f = v => v instanceof Date ? v.toISOString() : (v || '');
  let datos = {};
  try { datos = JSON.parse(g('DATOS_JSON') || '{}'); } catch (e) {}
  return {
    ID_PROPUESTA: g('ID_PROPUESTA') || '', FECHA_REGISTRO: f(g('FECHA_REGISTRO')),
    CODE: g('CODE') || '', ID_PERSONAL: g('ID_PERSONAL') || '', EMPLEADO: g('EMPLEADO') || '',
    TIPO: g('TIPO') || '', RESUMEN: g('RESUMEN') || '', DATOS: datos, ESTADO: g('ESTADO') || '',
    FECHA_RESOLUCION: f(g('FECHA_RESOLUCION')), RESUELTO_POR: g('RESUELTO_POR') || '',
    COMENTARIO_ADMIN: g('COMENTARIO_ADMIN') || '', ID_REGISTRO_OFICIAL: g('ID_REGISTRO_OFICIAL') || ''
  };
}

// ---- Validación por tipo (la misma exigencia mínima del módulo oficial) ----
function validarDatosPropuesta_(tipo, d, code) {
  const hhmm = /^\d{2}:\d{2}$/, iso = /^\d{4}-\d{2}-\d{2}$/;
  if (tipo === 'HORARIO') {
    if (!iso.test(d.FECHA_INICIO || '')) return 'Indica la fecha desde la que rige tu horario propuesto.';
    if (d.FECHA_FIN && (!iso.test(d.FECHA_FIN) || d.FECHA_FIN < d.FECHA_INICIO)) return 'La fecha fin no puede ser anterior a la de inicio.';
    if (!Array.isArray(d.DIAS) || !d.DIAS.length) return 'Marca al menos un día con horario.';
    // Mismos criterios que HorarioValidacion (módulo oficial): refrigerio ambos o
    // ninguno, jornada neta > 0 y, si la hora final es <= a la inicial, se asume
    // que cruza la medianoche.
    const mm = s => { const m = /^(\d{2}):(\d{2})$/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
    const dif = (a, b) => { let x = mm(b) - mm(a); if (x <= 0) x += 1440; return x; };
    for (const x of d.DIAS) {
      if (!x.dia || !hhmm.test(x.ingreso || '') || !hhmm.test(x.salida || '')) return 'Cada día marcado necesita hora de ingreso y de salida.';
      const ir = String(x.inicioRef || ''), fr = String(x.finRef || '');
      if ((ir && !fr) || (!ir && fr)) return `El día ${x.dia}: falta inicio o fin de refrigerio (ambos o ninguno).`;
      if (ir && (!hhmm.test(ir) || !hhmm.test(fr))) return `El día ${x.dia}: la hora de refrigerio no es válida.`;
      let m = dif(x.ingreso, x.salida); if (ir) m -= dif(ir, fr);
      if (m <= 0) return `El día ${x.dia}: el refrigerio no puede ser mayor o igual a la jornada.`;
    }
    return '';
  }
  if (tipo === 'PERMISO') {
    if (!iso.test(d.FECHA_PERMISO || '')) return 'Indica la fecha del permiso.';
    // Igual que validarPermiso del registro oficial: las horas NO son obligatorias.
    // Vacías (o "S/R") quedan como "S/R" (sin registro) y la duración también.
    const sal = String(d.HORA_SALIDA || '').trim(), ret = String(d.HORA_RETORNO || '').trim();
    const horaOk = h => h === '' || h === 'S/R' || hhmm.test(h);
    if (!horaOk(sal) || !horaOk(ret)) return 'La hora de salida o de retorno no es válida.';
    const hayHoras = hhmm.test(sal) && hhmm.test(ret);
    if (hayHoras && sal === ret) return 'La hora de salida y de retorno no pueden ser iguales.';
    d.HORA_SALIDA = sal || 'S/R'; d.HORA_RETORNO = ret || 'S/R';
    if (!hayHoras) d.DURACION_TOTAL = 'S/R';
    if (!String(d.MOTIVO_SALIDA || '').trim()) return 'Indica el motivo de la salida.';
    if (!d.CLASE_PERMISO) return 'Indica la clase de permiso.';
    if (d.CLASE_PERMISO === 'Otra' && !String(d.OTRA_ESPECIFICAR || '').trim()) return 'Especifica la clase de permiso.';
    if (d.CLASE_PERMISO === 'Comisión de Servicio' && !String(d.LUGAR_DESTINO || '').trim()) return 'Indica el lugar de destino.';
    if (d.CLASE_PERMISO === 'Capacitación' && !String(d.DETALLE_CAPACITACION || '').trim()) return 'Indica el detalle de la capacitación.';
    // Los campos que no aplican a la clase no se guardan.
    if (d.CLASE_PERMISO !== 'Otra') d.OTRA_ESPECIFICAR = '';
    if (d.CLASE_PERMISO !== 'Comisión de Servicio') d.LUGAR_DESTINO = '';
    if (d.CLASE_PERMISO !== 'Capacitación') d.DETALLE_CAPACITACION = '';
    return '';
  }
  if (tipo === 'VACACION') {
    if (!String(d.PERIODO_VACACIONAL || '').trim()) return 'Indica el período vacacional (ej. 2025-2026).';
    if (!iso.test(d.FECHA_INICIO || '') || !iso.test(d.FECHA_FIN || '')) return 'Indica fecha de inicio y de fin de tus vacaciones.';
    if (d.FECHA_FIN < d.FECHA_INICIO) return 'La fecha fin no puede ser anterior a la de inicio.';
    // Mismos criterios que validarFase2 de Vacaciones: el tramo no puede exceder
    // los días pendientes del período (si el período ya existe) ni el máximo.
    const diasTramo = Math.round((new Date(d.FECHA_FIN + 'T12:00:00') - new Date(d.FECHA_INICIO + 'T12:00:00')) / 86400000) + 1;
    if (diasTramo > DIAS_ASIGNADOS_MAXIMO_VACACIONES) return `Un período vacacional no puede superar ${DIAS_ASIGNADOS_MAXIMO_VACACIONES} días.`;
    if (code) {
      try {
        const v = getVacacionesSheet().getDataRange().getValues();
        for (let i = 1; i < v.length; i++) {
          if (String(v[i][3]) === String(code) && String(v[i][6]).trim() === String(d.PERIODO_VACACIONAL).trim()) {
            const pend = Math.max((parseInt(v[i][7], 10) || 0) - sumarDiasGoces_(parsearGoces_(v[i][11])), 0);
            if (diasTramo > pend) return `Solo quedan ${pend} día(s) pendientes en el período ${String(d.PERIODO_VACACIONAL).trim()}.`;
            break;
          }
        }
      } catch (e) { /* si no se puede consultar, el módulo oficial vuelve a validar al aprobar */ }
    }
    return '';
  }
  if (tipo === 'LICENCIA') {
    if (!iso.test(d.FECHA_INICIO || '') || !iso.test(d.FECHA_FIN || '')) return 'Indica fecha de inicio y de fin de la licencia.';
    if (d.FECHA_FIN < d.FECHA_INICIO) return 'La fecha fin no puede ser anterior a la de inicio.';
    if (!String(d.MOTIVO || '').trim()) return 'Indica el motivo de la licencia.';
    return '';
  }
  return 'Tipo de propuesta no válido.';
}

function resumenPropuesta_(tipo, d) {
  if (tipo === 'HORARIO') return `Horario desde ${d.FECHA_INICIO}${d.FECHA_FIN ? ' hasta ' + d.FECHA_FIN : ''} — ${d.DIAS.length} día(s)`;
  if (tipo === 'PERMISO') return `Permiso ${d.FECHA_PERMISO} ${d.HORA_SALIDA}–${d.HORA_RETORNO} (${d.CLASE_PERMISO})`;
  if (tipo === 'VACACION') return `Vacaciones ${d.FECHA_INICIO} a ${d.FECHA_FIN} (período ${d.PERIODO_VACACIONAL})`;
  if (tipo === 'LICENCIA') return `Licencia ${d.FECHA_INICIO} a ${d.FECHA_FIN}`;
  return '';
}

// ============================================================
// ACCIONES DEL TRABAJADOR (sesión del portal; ver PUBLIC_ACTIONS)
// ============================================================
function crearPropuesta(params) {
  try {
    const sesion = obtenerSesionEmpleado_(params.token);
    if (!sesion) return createJsonResponse(false, 'Sesión inválida o expirada. Vuelve a iniciar sesión.');

    const tipo = String(params.tipo || '').toUpperCase();
    if (PROPUESTAS_TIPOS.indexOf(tipo) === -1) return createJsonResponse(false, 'Tipo de propuesta no válido.');

    let datos;
    try { datos = JSON.parse(params.datos || '{}'); } catch (e) { return createJsonResponse(false, 'Datos de la propuesta inválidos.'); }
    const err = validarDatosPropuesta_(tipo, datos, sesion.code);
    if (err) return createJsonResponse(false, err);

    // Datos del trabajador SIEMPRE desde la hoja, nunca desde lo que mande el navegador.
    const reg = findRowByCode(getSheet(), sesion.code);
    if (!reg) return createJsonResponse(false, 'No se pudo identificar tu registro.');
    const r = reg.data;
    // Igual que el registro oficial de licencias: se exige el DNI del trabajador.
    if (tipo === 'LICENCIA' && !String(r[CAMPOS_PERSONAL.indexOf('DNI')] || '').trim()) {
      return createJsonResponse(false, 'Tu registro no tiene DNI. Comunícate con administración para completarlo antes de proponer una licencia.');
    }
    const empleado = `${r[4] || ''} ${r[2] || ''} ${r[3] || ''}`.trim();

    const sh = getPropuestasSheet_();
    const data = sh.getDataRange().getValues();
    let pendientes = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]) === String(sesion.code) && data[i][5] === tipo && data[i][8] === 'PENDIENTE') pendientes++;
    }
    if (pendientes >= PROPUESTAS_MAX_PENDIENTES_POR_TIPO) {
      return createJsonResponse(false, `Ya tienes ${pendientes} propuestas pendientes de este tipo. Espera a que sean evaluadas o cancela alguna.`);
    }

    const id = siguienteIdPropuesta_(data);
    sh.appendRow([id, new Date(), sesion.code, sesion.idPersonal, empleado, tipo,
      resumenPropuesta_(tipo, datos), JSON.stringify(datos), 'PENDIENTE', '', '', '', '']);

    registrarAuditoria(sesion.idPersonal, 'CREAR', 'Propuestas', `Propuesta de ${tipo} enviada por ${empleado}`, id);
    return createJsonResponse(true, 'Tu propuesta fue enviada. Quedará pendiente hasta que tu jefe la evalúe.', { ID_PROPUESTA: id });
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

function misPropuestas(params) {
  try {
    const sesion = obtenerSesionEmpleado_(params.token);
    if (!sesion) return createJsonResponse(false, 'Sesión inválida o expirada. Vuelve a iniciar sesión.');
    const data = getPropuestasSheet_().getDataRange().getValues();
    const out = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0] || String(data[i][2]) !== String(sesion.code)) continue;
      const o = objPropuesta_(data[i]);
      delete o.DATOS; // el trabajador solo necesita el resumen y el estado
      out.push(o);
    }
    out.reverse();
    return createJsonResponse(true, 'Propuestas obtenidas', out);
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

function cancelarPropuesta(params) {
  try {
    const sesion = obtenerSesionEmpleado_(params.token);
    if (!sesion) return createJsonResponse(false, 'Sesión inválida o expirada. Vuelve a iniciar sesión.');
    const sh = getPropuestasSheet_();
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== String(params.id)) continue;
      if (String(data[i][2]) !== String(sesion.code)) return createJsonResponse(false, 'No puedes modificar esta propuesta.');
      if (data[i][8] !== 'PENDIENTE') return createJsonResponse(false, 'Solo se pueden cancelar propuestas pendientes.');
      sh.getRange(i + 1, 9).setValue('CANCELADA');
      sh.getRange(i + 1, 10).setValue(new Date());
      registrarAuditoria(sesion.idPersonal, 'ACTUALIZAR', 'Propuestas', 'Propuesta cancelada por el trabajador', params.id);
      return createJsonResponse(true, 'Propuesta cancelada.');
    }
    return createJsonResponse(false, 'No se encontró la propuesta.');
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// ============================================================
// ACCIONES DEL ADMINISTRADOR (sesión admin; requerirAdmin_)
// ============================================================
function listPropuestas(params) {
  const adm = requerirAdmin_(params);
  if (adm.error) return adm.error;
  try {
    const estado = String(params.estado || '').toUpperCase();
    const tipo = String(params.tipo || '').toUpperCase();
    const data = getPropuestasSheet_().getDataRange().getValues();
    const out = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const o = objPropuesta_(data[i]);
      if (estado && o.ESTADO !== estado) continue;
      if (tipo && o.TIPO !== tipo) continue;
      out.push(o);
    }
    out.reverse(); // más recientes primero
    return createJsonResponse(true, 'Propuestas obtenidas', out);
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// accion = APROBAR | RECHAZAR. En APROBAR, "datos" (JSON) trae los
// valores finales que el jefe revisó/ajustó, más lo que solo él decide
// (p. ej. FUNCIONARIO_EXPIDE en permisos).
function resolverPropuesta(params) {
  const adm = requerirAdmin_(params);
  if (adm.error) return adm.error;
  try {
    const accion = String(params.accion || '').toUpperCase();
    if (accion !== 'APROBAR' && accion !== 'RECHAZAR') return createJsonResponse(false, 'Acción no válida.');

    const sh = getPropuestasSheet_();
    const data = sh.getDataRange().getValues();
    let fila = -1;
    for (let i = 1; i < data.length; i++) if (String(data[i][0]) === String(params.id)) { fila = i; break; }
    if (fila < 0) return createJsonResponse(false, 'No se encontró la propuesta.');
    if (data[fila][8] !== 'PENDIENTE') return createJsonResponse(false, 'Esta propuesta ya fue resuelta.');

    const usuario = adm.sesion.usuario;
    const comentario = String(params.comentario || '').trim();
    let idOficial = '';

    if (accion === 'RECHAZAR') {
      if (!comentario) return createJsonResponse(false, 'Escribe un comentario con el motivo del rechazo.');
    } else {
      const tipo = data[fila][5];
      let datos;
      try { datos = JSON.parse(params.datos || data[fila][7] || '{}'); } catch (e) { return createJsonResponse(false, 'Datos inválidos.'); }
      const err = validarDatosPropuesta_(tipo, datos);
      if (err) return createJsonResponse(false, err);

      const reg = findRowByCode(getSheet(), data[fila][2]);
      if (!reg) return createJsonResponse(false, 'El trabajador ya no existe en la base de personal.');
      const r = reg.data;
      const base = {
        CODE: data[fila][2], ID_PERSONAL: data[fila][3], EMPLEADO: data[fila][4],
        __usuario: usuario
      };
      const res = registrarPropuestaAprobada_(tipo, base, datos, r);
      if (!res.ok) return createJsonResponse(false, res.message);
      idOficial = res.id;
    }

    const n = fila + 1;
    sh.getRange(n, 9).setValue(accion === 'APROBAR' ? 'APROBADA' : 'RECHAZADA');
    sh.getRange(n, 10).setValue(new Date());
    sh.getRange(n, 11).setValue(usuario);
    sh.getRange(n, 12).setValue(comentario);
    sh.getRange(n, 13).setValue(idOficial);
    if (accion === 'APROBAR') sh.getRange(n, 8).setValue(params.datos || data[fila][7]); // queda lo realmente aprobado

    registrarAuditoria(usuario, accion === 'APROBAR' ? 'CREAR' : 'ACTUALIZAR', 'Propuestas',
      `Propuesta ${accion === 'APROBAR' ? 'aprobada' : 'rechazada'} (${data[fila][5]}, ${data[fila][4]})${idOficial ? ' → ' + idOficial : ''}`, params.id);
    return createJsonResponse(true, accion === 'APROBAR' ? 'Propuesta aprobada y registrada en el módulo oficial.' : 'Propuesta rechazada.', { ID_REGISTRO_OFICIAL: idOficial });
  } catch (error) {
    return createJsonResponse(false, error.toString());
  }
}

// Convierte una propuesta aprobada en el registro oficial, reutilizando
// las funciones de cada módulo (así se aplican sus mismas validaciones).
function registrarPropuestaAprobada_(tipo, base, d, filaPersonal) {
  const leer = resp => { try { return JSON.parse(resp.getContent()); } catch (e) { return { success: false, message: 'Respuesta inválida del módulo.' }; } };
  const dni = String(filaPersonal[CAMPOS_PERSONAL.indexOf('DNI')] || '');

  if (tipo === 'HORARIO') {
    const dias = d.DIAS.map(x => ({
      dia: x.dia, ingreso: x.ingreso, inicioRef: x.inicioRef || '', finRef: x.finRef || '',
      salida: x.salida, horas: x.horas || '', obs: ''
    }));
    const p = Object.assign({}, base, {
      FECHA_INICIO: d.FECHA_INICIO, FECHA_FIN: d.FECHA_FIN || '',
      HORAS_SEMANA: d.HORAS_SEMANA || '', DIAS_JSON: JSON.stringify(dias)
    });
    const r = leer(createHorario(p));
    return r.success ? { ok: true, id: (r.data || {}).ID_GRUPO || '' } : { ok: false, message: r.message };
  }

  if (tipo === 'PERMISO') {
    if (!String(d.FUNCIONARIO_EXPIDE || '').trim()) return { ok: false, message: 'Indica el funcionario que expide la boleta antes de aprobar.' };
    // Horas vacías = "S/R" (sin registro), igual que al registrar un permiso.
    const hs = String(d.HORA_SALIDA || '').trim() || 'S/R', hr = String(d.HORA_RETORNO || '').trim() || 'S/R';
    const sinRegistro = hs === 'S/R' || hr === 'S/R';
    const p = Object.assign({}, base, {
      DEPENDENCIA: 'OFICINA DE GESTIÓN DE LABORATORIO- OGL',
      FUNCIONARIO_EXPIDE: d.FUNCIONARIO_EXPIDE, CARGO_FUNCIONARIO: d.CARGO_FUNCIONARIO || '',
      FECHA_PERMISO: d.FECHA_PERMISO, HORA_SALIDA: hs, HORA_RETORNO: hr,
      DURACION_TOTAL: sinRegistro ? 'S/R' : (d.DURACION_TOTAL || ''), MOTIVO_SALIDA: d.MOTIVO_SALIDA,
      CLASE_PERMISO: d.CLASE_PERMISO, OTRA_ESPECIFICAR: d.OTRA_ESPECIFICAR || '', LUGAR_DESTINO: d.LUGAR_DESTINO || '',
      CAPACITACION_DETALLE: d.DETALLE_CAPACITACION || ''
    });
    const r = leer(createPermiso(p));
    return r.success ? { ok: true, id: (r.data || {}).ID_PERMISO || '' } : { ok: false, message: r.message };
  }

  if (tipo === 'VACACION') {
    // Reutiliza el período vacacional del trabajador si ya existe; si no, lo crea.
    const sh = getVacacionesSheet();
    const v = sh.getDataRange().getValues();
    let idVac = '';
    for (let i = 1; i < v.length; i++) {
      if (String(v[i][3]) === String(base.CODE) && String(v[i][6]).trim() === String(d.PERIODO_VACACIONAL).trim()) { idVac = v[i][0]; break; }
    }
    if (!idVac) {
      if (!d.FECHA_LIMITE) return { ok: false, message: 'Ese período vacacional aún no existe: indica la fecha límite de goce antes de aprobar.' };
      const rc = leer(createVacacion(Object.assign({}, base, {
        PERIODO_VACACIONAL: d.PERIODO_VACACIONAL, DIAS_ASIGNADOS: d.DIAS_ASIGNADOS || DIAS_ASIGNADOS_DEFECTO_VACACIONES,
        FECHA_LIMITE: d.FECHA_LIMITE, OBSERVACION: '', DNI: dni
      })));
      if (!rc.success) return { ok: false, message: rc.message };
      idVac = rc.data.ID_VACACION;
    }
    const dias = Math.round((new Date(d.FECHA_FIN + 'T12:00:00') - new Date(d.FECHA_INICIO + 'T12:00:00')) / 86400000) + 1;
    const rg = leer(registrarGoceVacacion({
      ID_VACACION: idVac, FECHA_INICIO: d.FECHA_INICIO, FECHA_FIN: d.FECHA_FIN,
      DIAS_TOMADOS: d.DIAS_TOMADOS || dias, OBSERVACION_GOCE: d.OBSERVACION || '', __usuario: base.__usuario
    }));
    return rg.success ? { ok: true, id: idVac } : { ok: false, message: rg.message };
  }

  if (tipo === 'LICENCIA') {
    const ix = c => filaPersonal[CAMPOS_PERSONAL.indexOf(c)] || '';
    const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const p = Object.assign({}, base, {
      DNI: dni, DIRECCION: ix('DIRECCION'), EMAIL: ix('EMAIL_INSTITUCIONAL'), TELEFONO: ix('TELEFONO'),
      CARGO: ix('CARGO'), AREA: 'OFICINA DE GESTIÓN DE LABORATORIO- OGL',
      FECHA_SOLICITUD: d.FECHA_SOLICITUD || hoy,
      TIPO_LICENCIA: d.TIPO_LICENCIA || 'Licencia sin goce de haber por motivos personales',
      FECHA_INICIO: d.FECHA_INICIO, FECHA_FIN: d.FECHA_FIN, MOTIVO: d.MOTIVO, ANEXOS: d.ANEXOS || ''
    });
    const r = leer(createLicencia(p));
    return r.success ? { ok: true, id: (r.data || {}).ID_LICENCIA || '' } : { ok: false, message: r.message };
  }
  return { ok: false, message: 'Tipo no soportado.' };
}

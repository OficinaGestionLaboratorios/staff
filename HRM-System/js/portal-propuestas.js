// ============================================================
// PORTAL-PROPUESTAS.JS — El trabajador PLANTEA propuestas de
// horario, permiso, vacaciones y licencia desde el portal.
// ============================================================
// Depende de portal-personal.js (sesión, llamarApi, mostrarVista...).
// Nada se registra oficialmente aquí: todo va a la bandeja temporal
// BD_PROPUESTAS (backend Codigo_Propuestas.gs) como PENDIENTE, y el
// jefe la evalúa/aprueba desde su módulo "Propuestas".
// ============================================================

const PP_DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const PP_ESTANDAR = { ingreso: '08:00', inicioRef: '13:00', finRef: '14:00', salida: '17:48' };
const PP_TITULOS = {
  HORARIO:  ['Horario propuesto', 'Indica los días y horas que propones para tu jornada'],
  PERMISO:  ['Propuesta de permiso', 'Salida del centro de trabajo'],
  VACACION: ['Propuesta de vacaciones', 'Fechas en las que propones tomar tu descanso'],
  LICENCIA: ['Propuesta de licencia', 'Solicitud de licencia']
};
let ppTipoActual = null;

const ppVal = id => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
const ppEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ppMin = h => { const m = /^(\d{2}):(\d{2})$/.exec(h || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const ppFechaTxt = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };

function ppMinutosDia(ing, ini, fin, sal) {
  const a = ppMin(ing), b = ppMin(sal);
  if (a == null || b == null || b <= a) return 0;
  let m = b - a;
  const r1 = ppMin(ini), r2 = ppMin(fin);
  if (r1 != null && r2 != null && r2 > r1) m -= (r2 - r1);
  return Math.max(m, 0);
}
const ppTxtHoras = min => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

// ---------- Menú ----------
document.querySelectorAll('.portal-menu-card').forEach(btn => {
  btn.addEventListener('click', () => {
    const a = btn.dataset.accion;
    if (a === 'datos') return cargarMisDatos();
    if (a === 'mis') return ppMostrarMisPropuestas();
    ppAbrirFormulario(a);
  });
});
$('btnCerrarSesionMenu').addEventListener('click', cerrarSesion);
$('btnDatosVolverMenu').addEventListener('click', mostrarMenu);
$('btnConfirmVolverMenu').addEventListener('click', mostrarMenu);
$('btnPropuestaVolver').addEventListener('click', mostrarMenu);
$('btnMisPropuestasVolver').addEventListener('click', mostrarMenu);

// ---------- Formularios ----------
function ppAbrirFormulario(tipo) {
  ppTipoActual = tipo;
  $('propuestaTitulo').textContent = PP_TITULOS[tipo][0];
  $('propuestaSub').textContent = PP_TITULOS[tipo][1];
  $('propuestaError').textContent = '';
  $('propuestaForm').innerHTML = ({ HORARIO: ppHtmlHorario, PERMISO: ppHtmlPermiso, VACACION: ppHtmlVacacion, LICENCIA: ppHtmlLicencia })[tipo]();
  ppEnlazarEventos(tipo);
  mostrarVista('vistaPropuesta');
}

function ppHtmlHorario() {
  const filas = PP_DIAS.map((d, i) => `
    <tr data-dia="${d}">
      <td><label style="display:flex;gap:6px;align-items:center;margin:0;font-weight:600;"><input type="checkbox" class="pp-chk" data-i="${i}"> ${d}</label></td>
      <td><input type="time" class="pp-ing" disabled></td>
      <td><input type="time" class="pp-ini" disabled></td>
      <td><input type="time" class="pp-fin" disabled></td>
      <td><input type="time" class="pp-sal" disabled></td>
      <td class="pp-horas">—</td>
    </tr>`).join('');
  return `
    <div class="pp-grid">
      <div class="pp-field"><label>Rige desde <span class="pp-req">*</span></label><input type="date" id="ppHorIni"></div>
      <div class="pp-field"><label>Hasta (opcional)</label><input type="date" id="ppHorFin"></div>
    </div>
    <button type="button" class="pp-link" id="ppEstandar"><i class="fas fa-wand-magic-sparkles"></i> Cargar horario estándar (Lunes a Viernes)</button>
    <div style="overflow-x:auto;">
      <table class="pp-dias">
        <thead><tr><th>Día</th><th>Ingreso</th><th>Inicio refrigerio</th><th>Fin refrigerio</th><th>Salida</th><th>Horas</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <p class="pp-total">Total semanal propuesto: <strong id="ppHorTotal">0:00</strong></p>
    <div class="pp-field"><label>Observación (opcional)</label><textarea id="ppHorObs" rows="2" placeholder="Motivo o detalle de tu propuesta"></textarea></div>`;
}

function ppHtmlPermiso() {
  return `
    <div class="pp-grid">
      <div class="pp-field"><label>Fecha del permiso <span class="pp-req">*</span></label><input type="date" id="ppPerFecha"></div>
      <div class="pp-field"><label>Hora de salida <span class="pp-req">*</span></label><input type="time" id="ppPerSal"></div>
      <div class="pp-field"><label>Hora de retorno <span class="pp-req">*</span></label><input type="time" id="ppPerRet"></div>
      <div class="pp-field"><label>Duración</label><input type="text" id="ppPerDur" readonly placeholder="—"></div>
    </div>
    <div class="pp-grid">
      <div class="pp-field"><label>Clase de permiso <span class="pp-req">*</span></label>
        <select id="ppPerClase">
          <option value="">Selecciona...</option>
          <option>Personal</option><option>Comisión de Servicio</option><option>Capacitación</option>
          <option>Enfermedad</option><option>Lactancia</option><option>Otra</option>
        </select></div>
      <div class="pp-field" id="ppPerOtraW" style="display:none;"><label>Especificar <span class="pp-req">*</span></label><input type="text" id="ppPerOtra"></div>
      <div class="pp-field" id="ppPerDestW" style="display:none;"><label>Lugar de destino <span class="pp-req">*</span></label><input type="text" id="ppPerDest"></div>
      <div class="pp-field" id="ppPerCapW" style="display:none;"><label>Detalle de la capacitación <span class="pp-req">*</span></label><input type="text" id="ppPerCap" placeholder="Nombre / tema"></div>
    </div>
    <div class="pp-field"><label>Motivo de la salida <span class="pp-req">*</span></label><textarea id="ppPerMotivo" rows="2"></textarea></div>`;
}

function ppHtmlVacacion() {
  return `
    <div class="pp-grid">
      <div class="pp-field"><label>Período vacacional <span class="pp-req">*</span></label><input type="text" id="ppVacPeriodo" placeholder="Ej. 2025-2026"></div>
      <div class="pp-field"><label>Desde <span class="pp-req">*</span></label><input type="date" id="ppVacIni"></div>
      <div class="pp-field"><label>Hasta <span class="pp-req">*</span></label><input type="date" id="ppVacFin"></div>
      <div class="pp-field"><label>Días calendario</label><input type="text" id="ppVacDias" readonly placeholder="—"></div>
    </div>
    <div class="pp-field"><label>Observación (opcional)</label><textarea id="ppVacObs" rows="2"></textarea></div>`;
}

function ppHtmlLicencia() {
  return `
    <div class="pp-grid">
      <div class="pp-field"><label>Tipo de licencia</label>
        <select id="ppLicTipo"><option value="Licencia sin goce de haber por motivos personales">Sin goce de haber – motivos personales</option></select></div>
      <div class="pp-field"><label>Desde <span class="pp-req">*</span></label><input type="date" id="ppLicIni"></div>
      <div class="pp-field"><label>Hasta <span class="pp-req">*</span></label><input type="date" id="ppLicFin"></div>
      <div class="pp-field"><label>Días</label><input type="text" id="ppLicDias" readonly placeholder="—"></div>
    </div>
    <div class="pp-field"><label>Motivo <span class="pp-req">*</span></label><textarea id="ppLicMotivo" rows="3"></textarea></div>
    <div class="pp-field" style="margin-top:12px;"><label>Anexos (opcional)</label><input type="text" id="ppLicAnexos" placeholder="Documentos que adjuntarás"></div>`;
}

// ---------- Eventos por tipo ----------
function ppDiasEntre(a, b) {
  if (!a || !b) return 0;
  const d = Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000) + 1;
  return d > 0 ? d : 0;
}

function ppEnlazarEventos(tipo) {
  if (tipo === 'HORARIO') {
    const recalcular = () => {
      let total = 0;
      document.querySelectorAll('.pp-dias tbody tr').forEach(tr => {
        const on = tr.querySelector('.pp-chk').checked;
        tr.querySelectorAll('input[type=time]').forEach(i => { i.disabled = !on; });
        const m = on ? ppMinutosDia(tr.querySelector('.pp-ing').value, tr.querySelector('.pp-ini').value, tr.querySelector('.pp-fin').value, tr.querySelector('.pp-sal').value) : 0;
        tr.querySelector('.pp-horas').textContent = on && m ? ppTxtHoras(m) : '—';
        total += m;
      });
      $('ppHorTotal').textContent = ppTxtHoras(total);
    };
    document.querySelectorAll('.pp-dias input').forEach(i => i.addEventListener('input', recalcular));
    document.querySelectorAll('.pp-chk').forEach(c => c.addEventListener('change', recalcular));
    $('ppEstandar').addEventListener('click', () => {
      document.querySelectorAll('.pp-dias tbody tr').forEach((tr, i) => {
        const laborable = i < 5;
        tr.querySelector('.pp-chk').checked = laborable;
        tr.querySelector('.pp-ing').value = laborable ? PP_ESTANDAR.ingreso : '';
        tr.querySelector('.pp-ini').value = laborable ? PP_ESTANDAR.inicioRef : '';
        tr.querySelector('.pp-fin').value = laborable ? PP_ESTANDAR.finRef : '';
        tr.querySelector('.pp-sal').value = laborable ? PP_ESTANDAR.salida : '';
      });
      recalcular();
    });
  }
  if (tipo === 'PERMISO') {
    const dur = () => {
      const a = ppMin(ppVal('ppPerSal')), b = ppMin(ppVal('ppPerRet'));
      $('ppPerDur').value = (a != null && b != null && b > a) ? ppTxtHoras(b - a) + ' h' : '';
    };
    $('ppPerSal').addEventListener('input', dur);
    $('ppPerRet').addEventListener('input', dur);
    $('ppPerClase').addEventListener('change', () => {
      const c = ppVal('ppPerClase');
      $('ppPerOtraW').style.display = c === 'Otra' ? '' : 'none';
      $('ppPerDestW').style.display = c === 'Comisión de Servicio' ? '' : 'none';
      $('ppPerCapW').style.display = c === 'Capacitación' ? '' : 'none';
    });
  }
  if (tipo === 'VACACION') {
    const f = () => { const d = ppDiasEntre(ppVal('ppVacIni'), ppVal('ppVacFin')); $('ppVacDias').value = d ? d : ''; };
    $('ppVacIni').addEventListener('input', f); $('ppVacFin').addEventListener('input', f);
  }
  if (tipo === 'LICENCIA') {
    const f = () => { const d = ppDiasEntre(ppVal('ppLicIni'), ppVal('ppLicFin')); $('ppLicDias').value = d ? d : ''; };
    $('ppLicIni').addEventListener('input', f); $('ppLicFin').addEventListener('input', f);
  }
}

// ---------- Recolectar + validar en el navegador (el backend vuelve a validar) ----------
function ppRecolectar(tipo) {
  if (tipo === 'HORARIO') {
    const dias = [];
    let totalMin = 0;
    document.querySelectorAll('.pp-dias tbody tr').forEach(tr => {
      if (!tr.querySelector('.pp-chk').checked) return;
      const ingreso = tr.querySelector('.pp-ing').value, inicioRef = tr.querySelector('.pp-ini').value,
            finRef = tr.querySelector('.pp-fin').value, salida = tr.querySelector('.pp-sal').value;
      const m = ppMinutosDia(ingreso, inicioRef, finRef, salida);
      totalMin += m;
      dias.push({ dia: tr.dataset.dia, ingreso, inicioRef, finRef, salida, horas: (m / 60).toFixed(2) });
    });
    return { FECHA_INICIO: ppVal('ppHorIni'), FECHA_FIN: ppVal('ppHorFin'), DIAS: dias,
             HORAS_SEMANA: (totalMin / 60).toFixed(2), OBSERVACION: ppVal('ppHorObs') };
  }
  if (tipo === 'PERMISO') {
    const a = ppMin(ppVal('ppPerSal')), b = ppMin(ppVal('ppPerRet'));
    return { FECHA_PERMISO: ppVal('ppPerFecha'), HORA_SALIDA: ppVal('ppPerSal'), HORA_RETORNO: ppVal('ppPerRet'),
             DURACION_TOTAL: (a != null && b != null && b > a) ? ppTxtHoras(b - a) : '',
             MOTIVO_SALIDA: ppVal('ppPerMotivo'), CLASE_PERMISO: ppVal('ppPerClase'),
             OTRA_ESPECIFICAR: ppVal('ppPerOtra'), LUGAR_DESTINO: ppVal('ppPerDest'), DETALLE_CAPACITACION: ppVal('ppPerCap') };
  }
  if (tipo === 'VACACION') {
    return { PERIODO_VACACIONAL: ppVal('ppVacPeriodo'), FECHA_INICIO: ppVal('ppVacIni'), FECHA_FIN: ppVal('ppVacFin'),
             DIAS_TOMADOS: ppDiasEntre(ppVal('ppVacIni'), ppVal('ppVacFin')), OBSERVACION: ppVal('ppVacObs') };
  }
  return { TIPO_LICENCIA: ppVal('ppLicTipo'), FECHA_INICIO: ppVal('ppLicIni'), FECHA_FIN: ppVal('ppLicFin'),
           MOTIVO: ppVal('ppLicMotivo'), ANEXOS: ppVal('ppLicAnexos') };
}

function ppValidar(tipo, d) {
  if (tipo === 'HORARIO') {
    if (!d.FECHA_INICIO) return 'Indica desde qué fecha rige tu horario.';
    if (d.FECHA_FIN && d.FECHA_FIN < d.FECHA_INICIO) return 'La fecha final no puede ser anterior a la inicial.';
    if (!d.DIAS.length) return 'Marca al menos un día.';
    for (const x of d.DIAS) {
      if (!x.ingreso || !x.salida) return `Completa ingreso y salida de ${x.dia}.`;
      if (ppMin(x.salida) <= ppMin(x.ingreso)) return `En ${x.dia} la salida debe ser posterior al ingreso.`;
    }
  } else if (tipo === 'PERMISO') {
    if (!d.FECHA_PERMISO || !d.HORA_SALIDA || !d.HORA_RETORNO) return 'Completa fecha, hora de salida y de retorno.';
    if (ppMin(d.HORA_RETORNO) <= ppMin(d.HORA_SALIDA)) return 'La hora de retorno debe ser posterior a la de salida.';
    if (!d.CLASE_PERMISO) return 'Selecciona la clase de permiso.';
    if (d.CLASE_PERMISO === 'Otra' && !d.OTRA_ESPECIFICAR) return 'Especifica la clase de permiso.';
    if (d.CLASE_PERMISO === 'Comisión de Servicio' && !d.LUGAR_DESTINO) return 'Indica el lugar de destino.';
    if (d.CLASE_PERMISO === 'Capacitación' && !d.DETALLE_CAPACITACION) return 'Indica el detalle de la capacitación.';
    if (!d.MOTIVO_SALIDA) return 'Indica el motivo de la salida.';
  } else if (tipo === 'VACACION') {
    if (!d.PERIODO_VACACIONAL) return 'Indica el período vacacional.';
    if (!d.FECHA_INICIO || !d.FECHA_FIN) return 'Indica las fechas de inicio y fin.';
    if (d.FECHA_FIN < d.FECHA_INICIO) return 'La fecha final no puede ser anterior a la inicial.';
  } else {
    if (!d.FECHA_INICIO || !d.FECHA_FIN) return 'Indica las fechas de inicio y fin.';
    if (d.FECHA_FIN < d.FECHA_INICIO) return 'La fecha final no puede ser anterior a la inicial.';
    if (!d.MOTIVO) return 'Indica el motivo de la licencia.';
  }
  return '';
}

$('btnPropuestaEnviar').addEventListener('click', async function () {
  const btn = this, tipo = ppTipoActual;
  const datos = ppRecolectar(tipo);
  const err = ppValidar(tipo, datos);
  $('propuestaError').textContent = err;
  if (err) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
  const result = await llamarApi('crearPropuesta', { tipo, datos: JSON.stringify(datos) }, true);
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar propuesta';

  if (!result.success) {
    if (/sesión inválida|sesión expirada/i.test(result.message || '')) return manejarSesionExpirada(result.message);
    $('propuestaError').textContent = result.message || 'No se pudo enviar la propuesta.';
    return;
  }
  mostrarToast(result.message || 'Propuesta enviada.', 'success');
  ppMostrarMisPropuestas();
});

// ---------- Mis propuestas ----------
async function ppMostrarMisPropuestas() {
  mostrarVista('vistaMisPropuestas');
  const cont = $('listaMisPropuestas');
  cont.innerHTML = '<p class="portal-hint"><i class="fas fa-spinner fa-spin"></i> Cargando...</p>';
  const r = await llamarApi('misPropuestas');
  if (!r.success) {
    if (/sesión inválida|sesión expirada/i.test(r.message || '')) return manejarSesionExpirada(r.message);
    cont.innerHTML = `<p class="portal-error">${ppEsc(r.message || 'No se pudo cargar.')}</p>`;
    return;
  }
  const nombres = { HORARIO: 'Horario', PERMISO: 'Permiso', VACACION: 'Vacaciones', LICENCIA: 'Licencia' };
  if (!r.data.length) { cont.innerHTML = '<p class="portal-hint">Aún no has enviado propuestas.</p>'; return; }
  cont.innerHTML = r.data.map(p => `
    <div class="pp-item">
      <div>
        <b>${nombres[p.TIPO] || p.TIPO}</b> · ${ppEsc(p.RESUMEN)}
        <small>Enviada el ${ppFechaTxt(p.FECHA_REGISTRO)}</small>
        ${p.ESTADO === 'RECHAZADA' && p.COMENTARIO_ADMIN ? `<small class="pp-coment"><i class="fas fa-comment"></i> ${ppEsc(p.COMENTARIO_ADMIN)}</small>` : ''}
        ${p.ESTADO === 'PENDIENTE' ? `<small><button type="button" class="pp-link" data-cancelar="${ppEsc(p.ID_PROPUESTA)}">Cancelar propuesta</button></small>` : ''}
      </div>
      <span class="pp-estado ${p.ESTADO}">${{ PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada' }[p.ESTADO] || p.ESTADO}</span>
    </div>`).join('');
  cont.querySelectorAll('[data-cancelar]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Cancelar esta propuesta?')) return;
    const res = await llamarApi('cancelarPropuesta', { id: b.dataset.cancelar }, true);
    mostrarToast(res.message || '', res.success ? 'success' : 'error');
    ppMostrarMisPropuestas();
  }));
}

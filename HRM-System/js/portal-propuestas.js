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
  LICENCIA: ['Propuesta de licencia', 'Solicitud de licencia'],
  DESCANSO: ['Descanso médico', 'Comunica tu descanso médico para que tu jefe lo gestione'],
  BONUS:    ['Propuesta de bonus', 'Usa tus horas extra acumuladas como descanso compensatorio']
};
let ppTipoActual = null;
let ppEditandoId = null;   // id de la propuesta que se está editando (null = propuesta nueva)
let ppMisPropuestas = [];  // última lista cargada (para editar sin volver a pedirla)

const ppVal = id => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
const ppEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ppMin = h => { const m = /^(\d{2}):(\d{2})$/.exec(h || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const ppFechaTxt = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };

// Mismo criterio que el módulo oficial (Horarios / Permisos): si la hora
// final es menor o igual a la inicial se asume que cruza la medianoche.
function ppDifMin(ini, fin) {
  const a = ppMin(ini), b = ppMin(fin);
  if (a == null || b == null) return 0;
  let d = b - a;
  if (d <= 0) d += 24 * 60;
  return d;
}
function ppMinutosDia(ing, ini, fin, sal) {
  if (ppMin(ing) == null || ppMin(sal) == null) return 0;
  let m = ppDifMin(ing, sal);
  if (ppMin(ini) != null && ppMin(fin) != null) m -= ppDifMin(ini, fin);
  return Math.max(m, 0);
}
// Duración del permiso igual que en el módulo oficial (decimal, ej. "1.50").
const ppDuracionPermiso = (sal, ret) => (ppMin(sal) == null || ppMin(ret) == null) ? 'S/R' : (ppDifMin(sal, ret) / 60).toFixed(2);
const ppTxtHoras = min => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const ppH = n => (Math.round((parseFloat(n) || 0) * 100) / 100).toFixed(2);

// ---------- Saldos: horas extra (banco) y vacaciones ----------
// Se piden al servidor (solo lectura) para que el técnico arme su propuesta
// sabiendo cuántas horas acumuladas y cuántos días de vacaciones tiene.
let ppSaldo = null;
async function ppObtenerSaldo() {
  const r = await llamarApi('miSaldoPortal');
  if (!r.success) {
    ppSaldo = null;
    if (/sesión inválida|sesión expirada/i.test(r.message || '')) manejarSesionExpirada(r.message);
    return null;
  }
  ppSaldo = r.data;
  return ppSaldo;
}
async function ppActualizarTarjetas() {
  const s = await ppObtenerSaldo();
  if (!s) return;
  const b = $('saldoTarjetaBonus'), v = $('saldoTarjetaVac');
  if (b) b.textContent = `Disponibles: ${ppH(s.BANCO.DISPONIBLES)} h`;
  if (v) v.textContent = `Pendientes: ${s.VACACIONES.TOTAL_PENDIENTES} día(s)`;
}
const ppPeriodoVac = per => ppSaldo ? (ppSaldo.VACACIONES.PERIODOS || []).find(p => String(p.PERIODO_VACACIONAL).trim() === String(per || '').trim()) : null;

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
// Si estaba editando una propuesta, "Volver" regresa a Mis propuestas; si era nueva, al menú.
$('btnPropuestaVolver').addEventListener('click', () => { const editaba = ppEditandoId; ppEditandoId = null; if (editaba) ppMostrarMisPropuestas(); else mostrarMenu(); });
$('btnMisPropuestasVolver').addEventListener('click', mostrarMenu);

// ---------- Formularios ----------
async function ppAbrirFormulario(tipo, propuesta) {
  ppTipoActual = tipo;
  ppEditandoId = propuesta ? propuesta.ID_PROPUESTA : null;
  $('propuestaTitulo').textContent = (propuesta ? 'Editar · ' : '') + PP_TITULOS[tipo][0];
  $('propuestaSub').textContent = propuesta ? 'Puedes corregir tu propuesta mientras siga pendiente de evaluación' : PP_TITULOS[tipo][1];
  $('propuestaError').textContent = '';
  const btnEnviar = $('btnPropuestaEnviar');
  btnEnviar.disabled = false;
  if (tipo === 'BONUS' || tipo === 'VACACION') {
    // Estos formularios necesitan el saldo del trabajador: se consulta antes de dibujarlos.
    btnEnviar.disabled = true;
    $('propuestaForm').innerHTML = '<p class="portal-hint"><i class="fas fa-spinner fa-spin"></i> Consultando tu saldo...</p>';
    mostrarVista('vistaPropuesta');
    await ppObtenerSaldo();
    if (ppTipoActual !== tipo) return; // el usuario ya salió de esta pantalla
    btnEnviar.disabled = false;
    if (!ppSaldo && tipo === 'BONUS') {
      $('propuestaForm').innerHTML = '<p class="portal-error">No se pudo consultar tu banco de horas. Intenta de nuevo más tarde.</p>';
      btnEnviar.disabled = true;
      return;
    }
  }
  $('propuestaForm').innerHTML = ({ HORARIO: ppHtmlHorario, PERMISO: ppHtmlPermiso, VACACION: ppHtmlVacacion, LICENCIA: ppHtmlLicencia, DESCANSO: ppHtmlDescanso, BONUS: ppHtmlBonus })[tipo]();
  ppEnlazarEventos(tipo);
  if (propuesta) ppPrellenar(tipo, propuesta.DATOS || {});
  $('btnPropuestaEnviar').innerHTML = propuesta
    ? '<i class="fas fa-floppy-disk"></i> Guardar cambios'
    : '<i class="fas fa-paper-plane"></i> Enviar propuesta';
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
        <thead><tr><th>Día</th><th class="th-ing">Ingreso</th><th class="th-ref">Inicio refrigerio</th><th class="th-ref">Fin refrigerio</th><th class="th-ing">Salida</th><th>Horas</th></tr></thead>
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
      <div class="pp-field"><label>Hora de salida</label><input type="time" id="ppPerSal"></div>
      <div class="pp-field"><label>Hora de retorno</label><input type="time" id="ppPerRet"></div>
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
    <p class="pp-total" style="font-weight:400;font-size:12.5px;">Las horas no son obligatorias: si las dejas vacías, la boleta indicará “S/R” (sin registro).</p>
    <div class="pp-field"><label>Motivo de la salida <span class="pp-req">*</span></label><textarea id="ppPerMotivo" rows="2"></textarea></div>`;
}

function ppHtmlVacacion() {
  const V = ppSaldo ? ppSaldo.VACACIONES : null;
  const panel = !V ? '' : (V.PERIODOS.length ? `
    <div class="pp-kpis">
      <div class="pp-kpi"><span>Días asignados</span><b>${V.TOTAL_ASIGNADOS}</b></div>
      <div class="pp-kpi"><span>Días tomados</span><b>${V.TOTAL_TOMADOS}</b></div>
      <div class="pp-kpi destacado"><span>Días pendientes</span><b>${V.TOTAL_PENDIENTES}</b></div>
    </div>
    <div style="overflow-x:auto;"><table class="pp-dias">
      <thead><tr><th>Período</th><th class="num">Asignados</th><th class="num">Tomados</th><th class="num">Por evaluar</th><th class="num">Pendientes</th><th>Fecha límite</th><th></th></tr></thead>
      <tbody>${V.PERIODOS.map(p => `<tr class="${p.DIAS_PENDIENTES <= 0 ? 'pp-agotada' : ''}">
        <td><b>${ppEsc(p.PERIODO_VACACIONAL)}</b></td><td class="num">${p.DIAS_ASIGNADOS}</td><td class="num">${p.DIAS_TOMADOS}</td>
        <td class="num">${p.DIAS_PROPUESTOS || 0}</td><td class="num"><b>${p.DIAS_PENDIENTES}</b></td><td>${p.FECHA_LIMITE ? ppFechaTxt(p.FECHA_LIMITE) : '—'}</td>
        <td>${p.DIAS_PENDIENTES > 0 ? `<button type="button" class="pp-link" data-periodo="${ppEsc(p.PERIODO_VACACIONAL)}">Elegir</button>` : ''}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="pp-hint">«Por evaluar» son los días de propuestas tuyas que tu jefe aún no resuelve.</p>`
    : '<div class="pp-aviso-saldo"><i class="fas fa-circle-info"></i> Aún no tienes períodos vacacionales registrados. Indica el período que propones y tu jefe lo creará al aprobar (máximo 30 días).</div>');
  const lista = V ? `<datalist id="ppVacPeriodos">${V.PERIODOS.map(p => `<option value="${ppEsc(p.PERIODO_VACACIONAL)}">`).join('')}</datalist>` : '';
  return `
    ${panel}
    <div class="pp-grid">
      <div class="pp-field"><label>Período vacacional <span class="pp-req">*</span></label><input type="text" id="ppVacPeriodo" placeholder="Ej. 2025-2026" ${V ? 'list="ppVacPeriodos"' : ''}>${lista}</div>
      <div class="pp-field"><label>Desde <span class="pp-req">*</span></label><input type="date" id="ppVacIni"></div>
      <div class="pp-field"><label>Hasta <span class="pp-req">*</span></label><input type="date" id="ppVacFin"></div>
      <div class="pp-field"><label>Días calendario</label><input type="text" id="ppVacDias" readonly placeholder="—"></div>
    </div>
    <div id="ppVacInfo" style="display:none;"></div>
    <div class="pp-field"><label>Observación (opcional)</label><textarea id="ppVacObs" rows="2"></textarea></div>`;
}

// ---------- Bonus: descanso compensatorio con horas extra del banco ----------
function ppBnFilaFecha(f) {
  f = f || {};
  return `<tr>
    <td><input type="date" class="pp-bn-f" value="${ppEsc(f.fecha || '')}"></td>
    <td><input type="time" class="pp-bn-i" value="${ppEsc(f.horaInicio || '')}"></td>
    <td><input type="time" class="pp-bn-t" value="${ppEsc(f.horaFin || '')}"></td>
    <td class="pp-horas pp-bn-h">—</td>
    <td><button type="button" class="pp-link pp-link-peligro pp-bn-quitar" title="Quitar fecha"><i class="fas fa-xmark"></i></button></td>
  </tr>`;
}

function ppHtmlBonus() {
  const B = ppSaldo.BANCO, det = B.DETALLE || [];
  const filas = det.map(x => {
    const libre = x.HORAS_DISPONIBLES > 0.001;
    return `<tr class="${libre ? '' : 'pp-agotada'}">
      <td>${ppFechaTxt(x.FECHA_SOBRETIEMPO)}</td><td>${ppEsc(x.DIA || '')}</td>
      <td class="num">${ppH(x.HORAS_GENERADAS)}</td><td class="num">${ppH(x.HORAS_UTILIZADAS)}</td><td class="num">${ppH(x.HORAS_COMPROMETIDAS)}</td>
      <td class="num"><b>${ppH(x.HORAS_DISPONIBLES)}</b></td>
      <td><input type="number" class="pp-bn-uso" step="0.25" min="0" max="${ppH(x.HORAS_DISPONIBLES)}" data-max="${ppH(x.HORAS_DISPONIBLES)}" data-id="${ppEsc(x.ID_SOLICITUD_ORIGEN)}" data-fecha="${ppEsc(x.FECHA_SOBRETIEMPO)}" ${libre ? '' : 'disabled'} placeholder="0.00"></td>
    </tr>`;
  }).join('');
  const sinHoras = !det.length || B.DISPONIBLES <= 0.001;
  return `
    <div class="pp-kpis">
      <div class="pp-kpi"><span>Horas generadas</span><b>${ppH(B.GENERADAS)} h</b></div>
      <div class="pp-kpi"><span>Utilizadas</span><b>${ppH(B.UTILIZADAS)} h</b></div>
      <div class="pp-kpi"><span>Comprometidas</span><b>${ppH(B.COMPROMETIDAS)} h</b></div>
      <div class="pp-kpi destacado"><span>Disponibles</span><b>${ppH(B.DISPONIBLES)} h</b></div>
    </div>
    ${B.PENDIENTES_APROBACION > 0 ? `<p class="pp-hint"><i class="fas fa-hourglass-half"></i> Tienes ${ppH(B.PENDIENTES_APROBACION)} h de sobretiempo pendientes de aprobación; recién suman al banco cuando se aprueben.</p>` : ''}
    ${sinHoras ? '<div class="pp-aviso-saldo"><i class="fas fa-circle-info"></i> Por ahora no tienes horas extra disponibles en tu banco. Solo suman las horas de sobretiempo aprobadas.</div>' : `
    <p class="pp-sub-titulo">1. Elige cuántas horas de cada fecha quieres utilizar</p>
    <div style="overflow-x:auto;"><table class="pp-dias">
      <thead><tr><th>Fecha</th><th>Día</th><th class="num">Generadas</th><th class="num">Utilizadas</th><th class="num">Comprom.</th><th class="num">Disponibles</th><th>A utilizar (h)</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    <button type="button" class="pp-link" id="ppBnTodo"><i class="fas fa-wand-magic-sparkles"></i> Usar todas las horas disponibles</button>
    <p class="pp-total">Horas a utilizar: <strong id="ppBnTotal">0.00 h</strong></p>

    <p class="pp-sub-titulo">2. Propón cuándo tomarías tu descanso</p>
    <div style="overflow-x:auto;"><table class="pp-dias">
      <thead><tr><th>Fecha</th><th>Desde (opcional)</th><th>Hasta (opcional)</th><th>Horas</th><th></th></tr></thead>
      <tbody id="ppBnFechas">${ppBnFilaFecha()}</tbody>
    </table></div>
    <button type="button" class="pp-link" id="ppBnAgregar"><i class="fas fa-plus"></i> Agregar otra fecha</button>
    <p class="pp-total" id="ppBnDesc"></p>
    <div class="pp-field"><label>Observación (opcional)</label><textarea id="ppBnObs" rows="2" placeholder="Detalle que quieras comunicar a tu jefe"></textarea></div>`}`;
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

function ppHtmlDescanso() {
  return `
    <div class="pp-grid">
      <div class="pp-field"><label>Inicio del descanso <span class="pp-req">*</span></label><input type="date" id="ppDmIni"></div>
      <div class="pp-field"><label>Fin del descanso <span class="pp-req">*</span></label><input type="date" id="ppDmFin"></div>
      <div class="pp-field"><label>Total de días</label><input type="text" id="ppDmDias" readonly placeholder="—"></div>
      <div class="pp-field"><label>Fecha de otorgamiento <span class="pp-req">*</span></label><input type="date" id="ppDmOtor"></div>
    </div>
    <div class="pp-grid">
      <div class="pp-field"><label>¿Ya cuentas con la constancia (CITT / certificado)?</label>
        <select id="ppDmConst"><option value="SI">Sí, ya la tengo</option><option value="NO">Aún no, la enviaré oportunamente</option></select></div>
    </div>
    <p class="pp-total" style="font-weight:400;font-size:12.5px;">Tu jefe revisará estos datos, registrará el descanso y te enviará un correo de confirmación. Recuerda entregar físicamente tu constancia al concluir tu descanso.</p>
    <div class="pp-field"><label>Observación (opcional)</label><textarea id="ppDmObs" rows="2" placeholder="Detalle que quieras comunicar"></textarea></div>`;
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
      $('ppPerDur').value = (a != null && b != null) ? ppDuracionPermiso(ppVal('ppPerSal'), ppVal('ppPerRet')) + ' h' : '';
    };
    $('ppPerSal').addEventListener('input', dur);
    $('ppPerRet').addEventListener('input', dur);
    $('ppPerClase').addEventListener('change', () => {
      const c = ppVal('ppPerClase');
      $('ppPerOtraW').style.display = c === 'Otra' ? '' : 'none';
      $('ppPerDestW').style.display = c === 'Comisión de Servicio' ? '' : 'none';
      $('ppPerCapW').style.display = c === 'Capacitación' ? '' : 'none';
      // Un campo que no aplica a la clase elegida no debe conservar texto.
      if (c !== 'Otra') $('ppPerOtra').value = '';
      if (c !== 'Comisión de Servicio') $('ppPerDest').value = '';
      if (c !== 'Capacitación') $('ppPerCap').value = '';
    });
  }
  if (tipo === 'VACACION') {
    const f = () => {
      const d = ppDiasEntre(ppVal('ppVacIni'), ppVal('ppVacFin')), per = ppVal('ppVacPeriodo');
      $('ppVacDias').value = d ? d : '';
      const box = $('ppVacInfo'); if (!box) return;
      if (!ppSaldo || !per) { box.style.display = 'none'; return; }
      const p = ppPeriodoVac(per);
      box.style.display = '';
      if (!p) { box.className = 'pp-aviso-saldo'; box.textContent = `El período ${per} aún no existe en tu registro: tu jefe lo creará al aprobar (máximo 30 días).`; return; }
      let t = `Período ${p.PERIODO_VACACIONAL}: te quedan ${p.DIAS_PENDIENTES} día(s) pendientes${p.DIAS_PROPUESTOS ? ` (${p.DIAS_PROPUESTOS} ya propuestos y por evaluar)` : ''}${p.FECHA_LIMITE ? ` · fecha límite de goce: ${ppFechaTxt(p.FECHA_LIMITE)}` : ''}.`;
      let alerta = false;
      if (d) { t += ` Con esta propuesta usarías ${d} día(s).`; if (d > p.DIAS_PENDIENTES) { t += ' ⚠ Supera tus días pendientes.'; alerta = true; } }
      if (ppVal('ppVacFin') && p.FECHA_LIMITE && ppVal('ppVacFin') > p.FECHA_LIMITE) { t += ' ⚠ Termina después de la fecha límite de goce.'; alerta = true; }
      box.className = alerta ? 'pp-aviso-saldo' : 'pp-info-ok'; box.textContent = t;
    };
    ['ppVacIni', 'ppVacFin', 'ppVacPeriodo'].forEach(id => $(id).addEventListener('input', f));
    document.querySelectorAll('[data-periodo]').forEach(b => b.addEventListener('click', () => { $('ppVacPeriodo').value = b.dataset.periodo; f(); }));
  }
  if (tipo === 'BONUS' && $('ppBnFechas')) {
    const recalcular = () => {
      let tot = 0;
      document.querySelectorAll('.pp-bn-uso').forEach(i => {
        let v = parseFloat(i.value) || 0; const max = parseFloat(i.dataset.max) || 0;
        if (v > max) { v = max; i.value = ppH(max); }
        if (v < 0) { v = 0; i.value = ''; }
        tot += v;
      });
      $('ppBnTotal').textContent = ppH(tot) + ' h';
      let desc = 0, conHoras = 0, filas = 0;
      document.querySelectorAll('#ppBnFechas tr').forEach(tr => {
        const i = tr.querySelector('.pp-bn-i').value, t = tr.querySelector('.pp-bn-t').value, c = tr.querySelector('.pp-bn-h');
        if (tr.querySelector('.pp-bn-f').value) filas++;
        if (i && t) { const m = ppDifMin(i, t); c.textContent = ppH(m / 60) + ' h'; desc += m / 60; conHoras++; } else c.textContent = '—';
      });
      const p = $('ppBnDesc');
      if (!filas) { p.textContent = ''; return; }
      p.textContent = conHoras ? `Descanso propuesto con horario: ${ppH(desc)} h · Horas del banco a utilizar: ${ppH(tot)} h` + (conHoras === filas && Math.abs(desc - tot) > 0.01 ? ' — no coinciden; tu jefe podrá ajustarlo al evaluar.' : '') : '';
    };
    document.querySelectorAll('.pp-bn-uso').forEach(i => i.addEventListener('input', recalcular));
    $('ppBnFechas').addEventListener('input', recalcular);
    $('ppBnFechas').addEventListener('click', e => {
      const b = e.target.closest('.pp-bn-quitar'); if (!b) return;
      if ($('ppBnFechas').rows.length > 1) b.closest('tr').remove(); else { b.closest('tr').querySelectorAll('input').forEach(i => { i.value = ''; }); }
      recalcular();
    });
    $('ppBnAgregar').addEventListener('click', () => {
      if ($('ppBnFechas').rows.length >= 10) return;
      $('ppBnFechas').insertAdjacentHTML('beforeend', ppBnFilaFecha()); recalcular();
    });
    $('ppBnTodo').addEventListener('click', () => {
      document.querySelectorAll('.pp-bn-uso:not(:disabled)').forEach(i => { i.value = i.dataset.max; }); recalcular();
    });
    recalcular();
  }
  if (tipo === 'LICENCIA') {
    const f = () => { const d = ppDiasEntre(ppVal('ppLicIni'), ppVal('ppLicFin')); $('ppLicDias').value = d ? d : ''; };
    $('ppLicIni').addEventListener('input', f); $('ppLicFin').addEventListener('input', f);
  }
  if (tipo === 'DESCANSO') {
    const f = () => { const d = ppDiasEntre(ppVal('ppDmIni'), ppVal('ppDmFin')); $('ppDmDias').value = d ? d : ''; };
    $('ppDmIni').addEventListener('input', f); $('ppDmFin').addEventListener('input', f);
  }
}

// Carga en el formulario los datos de una propuesta pendiente (para editarla).
function ppPrellenar(tipo, d) {
  const set = (id, v) => { const el = $(id); if (el) { el.value = v == null ? '' : v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
  const hora = h => (h && h !== 'S/R') ? h : '';
  if (tipo === 'HORARIO') {
    set('ppHorIni', d.FECHA_INICIO); set('ppHorFin', d.FECHA_FIN); set('ppHorObs', d.OBSERVACION);
    const porDia = {}; (d.DIAS || []).forEach(x => { porDia[x.dia] = x; });
    document.querySelectorAll('.pp-dias tbody tr').forEach(tr => {
      const x = porDia[tr.dataset.dia]; if (!x) return;
      tr.querySelector('.pp-chk').checked = true;
      tr.querySelectorAll('input[type=time]').forEach(i => { i.disabled = false; });
      tr.querySelector('.pp-ing').value = x.ingreso || ''; tr.querySelector('.pp-ini').value = x.inicioRef || '';
      tr.querySelector('.pp-fin').value = x.finRef || ''; tr.querySelector('.pp-sal').value = x.salida || '';
    });
    const c = document.querySelector('.pp-chk'); if (c) c.dispatchEvent(new Event('change', { bubbles: true })); // recalcula horas
  } else if (tipo === 'PERMISO') {
    set('ppPerFecha', d.FECHA_PERMISO); set('ppPerSal', hora(d.HORA_SALIDA)); set('ppPerRet', hora(d.HORA_RETORNO));
    set('ppPerClase', d.CLASE_PERMISO); set('ppPerOtra', d.OTRA_ESPECIFICAR); set('ppPerDest', d.LUGAR_DESTINO);
    set('ppPerCap', d.DETALLE_CAPACITACION); set('ppPerMotivo', d.MOTIVO_SALIDA);
  } else if (tipo === 'VACACION') {
    set('ppVacPeriodo', d.PERIODO_VACACIONAL); set('ppVacIni', d.FECHA_INICIO); set('ppVacFin', d.FECHA_FIN); set('ppVacObs', d.OBSERVACION);
  } else if (tipo === 'LICENCIA') {
    set('ppLicTipo', d.TIPO_LICENCIA); set('ppLicIni', d.FECHA_INICIO); set('ppLicFin', d.FECHA_FIN);
    set('ppLicMotivo', d.MOTIVO); set('ppLicAnexos', d.ANEXOS);
  } else if (tipo === 'DESCANSO') {
    set('ppDmIni', d.FECHA_INICIO); set('ppDmFin', d.FECHA_FIN); set('ppDmOtor', d.FECHA_OTORGAMIENTO);
    set('ppDmConst', d.CONSTANCIA || 'SI'); set('ppDmObs', d.OBSERVACION);
  } else if (tipo === 'BONUS' && $('ppBnFechas')) {
    const usos = {}; (d.SELECCIONES || []).forEach(x => { usos[x.ID_SOLICITUD_ORIGEN + '|' + x.FECHA_SOBRETIEMPO] = x.HORAS_A_UTILIZAR; });
    document.querySelectorAll('.pp-bn-uso').forEach(i => { const v = usos[i.dataset.id + '|' + i.dataset.fecha]; if (v != null) i.value = v; });
    if ((d.FECHAS_DESCANSO || []).length) $('ppBnFechas').innerHTML = d.FECHAS_DESCANSO.map(ppBnFilaFecha).join('');
    set('ppBnObs', d.OBSERVACION);
    $('ppBnFechas').dispatchEvent(new Event('input', { bubbles: true }));
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
    const clase = ppVal('ppPerClase');
    return { FECHA_PERMISO: ppVal('ppPerFecha'), HORA_SALIDA: ppVal('ppPerSal'), HORA_RETORNO: ppVal('ppPerRet'),
             DURACION_TOTAL: ppDuracionPermiso(ppVal('ppPerSal'), ppVal('ppPerRet')),
             MOTIVO_SALIDA: ppVal('ppPerMotivo'), CLASE_PERMISO: clase,
             // Solo se envía lo que aplica a la clase elegida (igual que el registro oficial).
             OTRA_ESPECIFICAR: clase === 'Otra' ? ppVal('ppPerOtra') : '',
             LUGAR_DESTINO: clase === 'Comisión de Servicio' ? ppVal('ppPerDest') : '',
             DETALLE_CAPACITACION: clase === 'Capacitación' ? ppVal('ppPerCap') : '' };
  }
  if (tipo === 'VACACION') {
    return { PERIODO_VACACIONAL: ppVal('ppVacPeriodo'), FECHA_INICIO: ppVal('ppVacIni'), FECHA_FIN: ppVal('ppVacFin'),
             DIAS_TOMADOS: ppDiasEntre(ppVal('ppVacIni'), ppVal('ppVacFin')), OBSERVACION: ppVal('ppVacObs') };
  }
  if (tipo === 'BONUS') {
    const sel = []; let total = 0;
    document.querySelectorAll('.pp-bn-uso').forEach(i => {
      const v = parseFloat(i.value) || 0;
      if (v > 0) { sel.push({ ID_SOLICITUD_ORIGEN: i.dataset.id, FECHA_SOBRETIEMPO: i.dataset.fecha, HORAS_A_UTILIZAR: ppH(v) }); total += v; }
    });
    const fechas = [];
    document.querySelectorAll('#ppBnFechas tr').forEach(tr => {
      const fecha = tr.querySelector('.pp-bn-f').value; if (!fecha) return;
      const hi = tr.querySelector('.pp-bn-i').value, hf = tr.querySelector('.pp-bn-t').value;
      fechas.push({ fecha, horaInicio: hi, refrigerioInicio: '', refrigerioFin: '', horaFin: hf, horas: (hi && hf) ? ppH(ppDifMin(hi, hf) / 60) : '' });
    });
    return { SELECCIONES: sel, FECHAS_DESCANSO: fechas, TOTAL_HORAS: ppH(total), OBSERVACION: ppVal('ppBnObs') };
  }
  if (tipo === 'DESCANSO') {
    return { FECHA_INICIO: ppVal('ppDmIni'), FECHA_FIN: ppVal('ppDmFin'), FECHA_OTORGAMIENTO: ppVal('ppDmOtor'),
             DIAS: ppDiasEntre(ppVal('ppDmIni'), ppVal('ppDmFin')), CONSTANCIA: ppVal('ppDmConst') || 'SI', OBSERVACION: ppVal('ppDmObs') };
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
      if (!x.ingreso || !x.salida) return `${x.dia}: falta ingreso o salida.`;
      if ((x.inicioRef && !x.finRef) || (!x.inicioRef && x.finRef)) return `${x.dia}: falta inicio o fin de refrigerio (ambos o ninguno).`;
      if (ppMinutosDia(x.ingreso, x.inicioRef, x.finRef, x.salida) <= 0) return `${x.dia}: el refrigerio no puede ser mayor o igual a la jornada.`;
    }
  } else if (tipo === 'PERMISO') {
    // Mismo orden y criterios que PermisosValidacion (registro del administrador):
    // las horas NO son obligatorias; solo se rechaza que sean iguales.
    if (!d.FECHA_PERMISO) return 'Indica la fecha del permiso.';
    if (d.HORA_SALIDA && d.HORA_RETORNO && d.HORA_SALIDA === d.HORA_RETORNO) return 'La hora de salida y de retorno no pueden ser iguales.';
    if (!d.MOTIVO_SALIDA) return 'Indica el motivo de la salida.';
    if (!d.CLASE_PERMISO) return 'Selecciona la clase de permiso.';
    if (d.CLASE_PERMISO === 'Otra' && !d.OTRA_ESPECIFICAR) return 'Especifica la clase de permiso.';
    if (d.CLASE_PERMISO === 'Comisión de Servicio' && !d.LUGAR_DESTINO) return 'Indica el lugar de destino.';
    if (d.CLASE_PERMISO === 'Capacitación' && !d.DETALLE_CAPACITACION) return 'Indica el detalle de la capacitación.';
  } else if (tipo === 'VACACION') {
    if (!d.PERIODO_VACACIONAL) return 'Indica el período vacacional.';
    if (!d.FECHA_INICIO || !d.FECHA_FIN) return 'Indica las fechas de inicio y fin.';
    if (d.FECHA_FIN < d.FECHA_INICIO) return 'La fecha final no puede ser anterior a la inicial.';
    const pv = ppPeriodoVac(d.PERIODO_VACACIONAL);
    if (pv && d.DIAS_TOMADOS > pv.DIAS_PENDIENTES) return `Solo te quedan ${pv.DIAS_PENDIENTES} día(s) pendientes en el período ${pv.PERIODO_VACACIONAL}.`;
    if (!pv && d.DIAS_TOMADOS > 30) return 'Un período vacacional no puede superar 30 días.';
  } else if (tipo === 'BONUS') {
    if (!d.SELECCIONES.length) return 'Indica cuántas horas quieres utilizar de tu banco de horas.';
    if (!d.FECHAS_DESCANSO.length) return 'Indica al menos una fecha propuesta para tu descanso.';
    for (const f of d.FECHAS_DESCANSO) {
      if ((f.horaInicio && !f.horaFin) || (!f.horaInicio && f.horaFin)) return `${ppFechaTxt(f.fecha)}: indica la hora desde y hasta (ambas o ninguna).`;
      if (f.horaInicio && f.horaInicio === f.horaFin) return `${ppFechaTxt(f.fecha)}: la hora desde y hasta no pueden ser iguales.`;
    }
  } else if (tipo === 'DESCANSO') {
    if (!d.FECHA_INICIO || !d.FECHA_FIN) return 'Indica las fechas de inicio y fin del descanso.';
    if (d.FECHA_FIN < d.FECHA_INICIO) return 'La fecha final no puede ser anterior a la inicial.';
    if (!d.FECHA_OTORGAMIENTO) return 'Indica la fecha de otorgamiento del descanso médico.';
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

  // Igual que el registro del administrador: si falta alguna hora se avisa y,
  // solo si acepta, se guarda "S/R" (sin registro) en ambas.
  if (tipo === 'PERMISO' && (!datos.HORA_SALIDA || !datos.HORA_RETORNO)) {
    const faltantes = [];
    if (!datos.HORA_SALIDA) faltantes.push('la hora de salida');
    if (!datos.HORA_RETORNO) faltantes.push('la hora de retorno');
    if (!confirm(`No se ha registrado ${faltantes.join(' ni ')}. En la boleta aparecerá como "sin registro". ¿Deseas continuar?`)) return;
    if (!datos.HORA_SALIDA) datos.HORA_SALIDA = 'S/R';
    if (!datos.HORA_RETORNO) datos.HORA_RETORNO = 'S/R';
    datos.DURACION_TOTAL = 'S/R';
  }

  const editando = ppEditandoId;
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${editando ? 'Guardando...' : 'Enviando...'}`;
  const result = editando
    ? await llamarApi('editarPropuesta', { id: editando, datos: JSON.stringify(datos) }, true)
    : await llamarApi('crearPropuesta', { tipo, datos: JSON.stringify(datos) }, true);
  btn.disabled = false;
  btn.innerHTML = editando ? '<i class="fas fa-floppy-disk"></i> Guardar cambios' : '<i class="fas fa-paper-plane"></i> Enviar propuesta';

  if (!result.success) {
    if (/sesión inválida|sesión expirada/i.test(result.message || '')) return manejarSesionExpirada(result.message);
    $('propuestaError').textContent = result.message || 'No se pudo enviar la propuesta.';
    return;
  }
  mostrarToast(result.message || (editando ? 'Propuesta actualizada.' : 'Propuesta enviada.'), 'success');
  ppEditandoId = null;
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
  const nombres = { HORARIO: 'Horario', PERMISO: 'Permiso', VACACION: 'Vacaciones', LICENCIA: 'Licencia', DESCANSO: 'Descanso médico', BONUS: 'Bonus de horas extra' };
  ppMisPropuestas = r.data || [];
  if (!ppMisPropuestas.length) { cont.innerHTML = '<p class="portal-hint">Aún no has enviado propuestas.</p>'; return; }
  cont.innerHTML = ppMisPropuestas.map(p => `
    <div class="pp-item">
      <div>
        <b>${nombres[p.TIPO] || p.TIPO}</b> · ${ppEsc(p.RESUMEN)}
        <small>Enviada el ${ppFechaTxt(p.FECHA_REGISTRO)}</small>
        ${p.ESTADO === 'RECHAZADA' && p.COMENTARIO_ADMIN ? `<small class="pp-coment"><i class="fas fa-comment"></i> ${ppEsc(p.COMENTARIO_ADMIN)}</small>` : ''}
        <small class="pp-acciones-item">
          ${p.ESTADO === 'PENDIENTE' ? `<button type="button" class="pp-link" data-editar="${ppEsc(p.ID_PROPUESTA)}"><i class="fas fa-pen"></i> Editar</button>
          <button type="button" class="pp-link" data-cancelar="${ppEsc(p.ID_PROPUESTA)}"><i class="fas fa-ban"></i> Cancelar propuesta</button>` : ''}
          <button type="button" class="pp-link pp-link-peligro" data-eliminar="${ppEsc(p.ID_PROPUESTA)}"><i class="fas fa-trash-can"></i> Eliminar</button>
        </small>
      </div>
      <span class="pp-estado ${p.ESTADO}">${{ PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada' }[p.ESTADO] || p.ESTADO}</span>
    </div>`).join('');

  cont.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => {
    const p = ppMisPropuestas.find(x => x.ID_PROPUESTA === b.dataset.editar);
    if (p) ppAbrirFormulario(p.TIPO, p);
  }));
  cont.querySelectorAll('[data-cancelar]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Cancelar esta propuesta? Quedará en tu historial como cancelada.')) return;
    const res = await llamarApi('cancelarPropuesta', { id: b.dataset.cancelar }, true);
    mostrarToast(res.message || '', res.success ? 'success' : 'error');
    ppMostrarMisPropuestas();
  }));
  cont.querySelectorAll('[data-eliminar]').forEach(b => b.addEventListener('click', async () => {
    const p = ppMisPropuestas.find(x => x.ID_PROPUESTA === b.dataset.eliminar);
    const aviso = p && p.ESTADO === 'APROBADA'
      ? '\n\nEsta propuesta ya fue APROBADA: se quitará de tu historial, pero el registro oficial que hizo tu jefe NO se elimina.'
      : (p && p.ESTADO === 'PENDIENTE' ? '\n\nTu jefe ya no la verá para evaluarla.' : '');
    if (!confirm('¿Eliminar esta propuesta de tu historial? Esta acción no se puede deshacer.' + aviso)) return;
    b.disabled = true;
    const res = await llamarApi('eliminarPropuesta', { id: b.dataset.eliminar }, true);
    if (!res.success && /sesión inválida|sesión expirada/i.test(res.message || '')) return manejarSesionExpirada(res.message);
    mostrarToast(res.message || '', res.success ? 'success' : 'error');
    ppMostrarMisPropuestas();
  }));
}

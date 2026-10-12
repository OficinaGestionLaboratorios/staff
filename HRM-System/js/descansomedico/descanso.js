// ============================================================
// DESCANSO.JS — Orquestador del módulo Descanso médico
// Flujo: seleccionar personal → Descanso médico → datos (+ foto
// opcional) → registrar → vista previa del correo (modal único
// js/core/correo-modal.js: copiar o enviar con la cuenta corporativa).
// ============================================================
let descansoRegistros = [];
let descansoArchivos = [];      // adjuntos {name,type,dataUrl,esImagen} (no se guardan en BD)

function dmEl(id) { return document.getElementById(id); }
function dmSet(id, v) { const el = dmEl(id); if (el) el.value = v ?? ''; }
function dmGet(id) { return dmEl(id)?.value || ''; }

function dmNombre(p) {
    if (!p) return '';
    return [p.NOMBRES, p.APE_PATERNO, p.APE_MATERNO].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

window.dmActualizarDias = function () {
    const n = window.DescansoMedicoCorreo.calcularDias(dmGet('dmFechaInicio'), dmGet('dmFechaFin'));
    const out = dmEl('dmDias'); if (out) out.textContent = n ? `${n} día${n === 1 ? '' : 's'}` : '—';
};

function dmLimpiarCampos() {
    dmSet('dmFechaInicio', ''); dmSet('dmFechaFin', ''); dmSet('dmFechaOtorgamiento', ''); dmSet('dmObservacion', '');
    dmMsg(''); window.dmActualizarDias();
}
function dmLimpiar() { dmLimpiarCampos(); dmQuitarFotoInterna(); }
function dmMsg(t) { const el = dmEl('dmMsg'); if (el) el.textContent = t || ''; }

// ---------- Adjuntos: imágenes (se pegan en el cuerpo) y PDF (van como adjunto) ----------
// Nada de esto se guarda en la BD; solo se registra si hubo adjuntos.
function dmLeerImagen(file) {
    return new Promise(resolve => {
        const fr = new FileReader();
        fr.onload = () => {
            const img = new Image();
            img.onload = () => {
                const max = 1200, k = Math.min(1, max / Math.max(img.width, img.height));
                const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
                cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                resolve({ name: (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', dataUrl: cv.toDataURL('image/jpeg', 0.82), esImagen: true });
            };
            img.onerror = () => resolve(null);
            img.src = fr.result;
        };
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(file);
    });
}
function dmLeerPdf(file) {
    return new Promise(resolve => {
        const fr = new FileReader();
        fr.onload = () => resolve({ name: file.name || 'descanso_medico.pdf', type: 'application/pdf', dataUrl: fr.result, esImagen: false });
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(file);
    });
}
function dmPintarFoto() {
    const box = dmEl('dmFotoPreview');
    if (box) box.innerHTML = descansoArchivos.length ? descansoArchivos.map((f, i) => `
        <span style="display:inline-flex;align-items:center;gap:6px;margin:0 8px 6px 0;padding:4px 8px;border:1px solid #CBD5E1;border-radius:6px;background:#F8FAFC;font-size:12px;">
            ${f.esImagen ? `<img src="${f.dataUrl}" style="height:36px;border-radius:4px;">` : '<i class="fas fa-file-pdf" style="color:#BB0000;font-size:18px;"></i>'}
            ${window.esc(f.name)}
            <button type="button" onclick="window.dmQuitarArchivo(${i})" title="Quitar" style="border:none;background:none;cursor:pointer;color:#BB0000;"><i class="fas fa-times"></i></button>
        </span>`).join('') : '<span style="color:#64748B;font-size:13px;">Sin adjuntos: el correo solo declarará el descanso médico.</span>';
    const q = dmEl('dmFotoQuitar'); if (q) q.style.display = descansoArchivos.length ? 'inline-flex' : 'none';
}
function dmQuitarFotoInterna() { descansoArchivos = []; const f = dmEl('dmFoto'); if (f) f.value = ''; dmPintarFoto(); }
window.dmQuitarFoto = function () { dmQuitarFotoInterna(); };
window.dmQuitarArchivo = function (i) { descansoArchivos.splice(i, 1); dmPintarFoto(); };
window.dmArchivosElegidos = async function (input) {
    const files = Array.from(input.files || []);
    for (const f of files) {
        const esPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
        const esImg = (f.type || '').startsWith('image/');
        if (!esPdf && !esImg) { window.toast(`⚠️ "${f.name}" no es imagen ni PDF`, 'warning'); continue; }
        if (esPdf && f.size > 10 * 1024 * 1024) { window.toast(`⚠️ "${f.name}" pesa más de 10 MB`, 'warning'); continue; }
        const r = esPdf ? await dmLeerPdf(f) : await dmLeerImagen(f);
        if (r) descansoArchivos.push(r); else window.toast(`⚠️ No se pudo leer "${f.name}"`, 'warning');
    }
    input.value = '';
    dmPintarFoto();
};

// ---------- Modal ----------
window.abrirModalDescansoMedico = async function () {
    if (!window.personalSeleccionado) { window.toast('⚠️ Primero selecciona un empleado en la Lista de Personal', 'warning'); return; }
    const modal = dmEl('modalDescansoMedico'); if (!modal) return;
    dmSet('dmEmpleado', window.formatearPersonalSeleccionado(window.personalSeleccionado));
    dmSet('dmIdPersonal', window.personalSeleccionado.ID_PERSONAL || '');
    dmSet('dmDni', window.personalSeleccionado.DNI || '');
    dmSet('dmCargo', window.personalSeleccionado.CARGO || '');
    dmLimpiar();
    modal.style.display = 'flex'; modal.classList.add('active'); document.body.style.overflow = 'hidden';
    await window.dmCargarLista();
};
window.cerrarModalDescansoMedico = function () {
    const modal = dmEl('modalDescansoMedico');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
    document.body.style.overflow = '';
};

window.dmCargarLista = async function () {
    const wrap = dmEl('dmListaWrap'), cont = dmEl('dmLista'); if (!wrap || !cont) return;
    const r = await window.DescansoMedicoAPI.listar(window.personalSeleccionado?.CODE);
    descansoRegistros = (r.success && Array.isArray(r.data)) ? r.data : [];
    if (!descansoRegistros.length) { wrap.style.display = 'none'; cont.innerHTML = ''; return; }
    wrap.style.display = 'block';
    cont.innerHTML = descansoRegistros.map(x => `
        <div class="horario-grupo-item">
            <div>
                <strong>${window.esc(x.FECHA_INICIO)} → ${window.esc(x.FECHA_FIN)}</strong>
                <small>${window.esc(String(x.DIAS || ''))} día(s) · otorgado el ${window.esc(x.FECHA_OTORGAMIENTO)} · ${x.CON_FOTO === 'SI' ? 'con adjunto' : 'sin adjunto'}</small>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
                <span class="badge-estado estado-programado"><i class="fas fa-notes-medical"></i> Registrado</span>
                <button class="action-btn btn-mail-uniform" data-dm-correo="${window.esc(x.ID_DESCANSO)}" title="Generar correo"><i class="fas fa-envelope"></i></button>
                <button class="action-btn btn-delete-uniform" data-dm-eliminar="${window.esc(x.ID_DESCANSO)}" title="Eliminar descanso médico"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');
    cont.querySelectorAll('[data-dm-correo]').forEach(b => b.addEventListener('click', () => {
        const x = descansoRegistros.find(r => String(r.ID_DESCANSO) === b.dataset.dmCorreo); if (x) dmAbrirCorreo(x);
    }));
    cont.querySelectorAll('[data-dm-eliminar]').forEach(b => b.addEventListener('click', () => window.dmEliminar(b.dataset.dmEliminar)));
};

window.dmNuevo = function () { dmLimpiar(); };

window.dmGuardar = async function () {
    dmMsg('');
    const p = window.personalSeleccionado; if (!p) { window.toast('⚠️ No hay empleado seleccionado', 'error'); return; }
    const ini = dmGet('dmFechaInicio'), fin = dmGet('dmFechaFin'), otor = dmGet('dmFechaOtorgamiento');
    const errores = [];
    if (!p.CODE) errores.push('empleado');
    if (!ini) errores.push('fecha de inicio'); if (!fin) errores.push('fecha de fin');
    if (ini && fin && fin < ini) errores.push('la fecha de fin no puede ser anterior a la de inicio');
    if (!otor) errores.push('fecha de otorgamiento');
    if (errores.length) { const t = 'Falta completar: ' + errores.join('; '); dmMsg(t); window.toast('⚠️ ' + t, 'error'); return; }
    const obs = dmGet('dmObservacion').trim();
    const payload = { CODE: p.CODE, ID_PERSONAL: p.ID_PERSONAL || '', EMPLEADO: dmNombre(p), DNI: p.DNI || '', CARGO: p.CARGO || '',
        FECHA_INICIO: ini, FECHA_FIN: fin, FECHA_OTORGAMIENTO: otor, CON_FOTO: descansoArchivos.length ? 'SI' : 'NO', OBSERVACION: obs };
    const btn = dmEl('dmBtnGuardar'); if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }
    try {
        const r = await window.DescansoMedicoAPI.crear(payload);
        if (!r.success) { window.toast('❌ ' + (r.message || 'No se pudo registrar el descanso médico'), 'error'); return; }
        window.toast('✅ Descanso médico registrado', 'success');
        dmAbrirCorreo({ ID_DESCANSO: r.data?.ID_DESCANSO || '', FECHA_INICIO: ini, FECHA_FIN: fin, FECHA_OTORGAMIENTO: otor, OBSERVACION: obs }, true);
        await window.dmCargarLista();
        dmLimpiarCampos();
    } finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Guardar y generar correo'; } }
};

window.dmEliminar = async function (id) {
    if (!id) return;
    const x = descansoRegistros.find(r => String(r.ID_DESCANSO) === String(id));
    if (!confirm(`¿Eliminar el descanso médico ${id}${x ? ` (${x.FECHA_INICIO} → ${x.FECHA_FIN})` : ''}? Esta acción no se puede deshacer.`)) return;
    const r = await window.DescansoMedicoAPI.eliminar(id);
    if (!r.success) { window.toast('❌ ' + (r.message || 'No se pudo eliminar'), 'error'); return; }
    window.toast('🗑️ Descanso médico eliminado', 'success');
    await window.dmCargarLista();
};

// ---------- Vista previa y envío del correo (modal único) ----------
// registro: { ID_DESCANSO, FECHA_INICIO, FECHA_FIN, FECHA_OTORGAMIENTO, OBSERVACION }
// conFotoActual: true → el correo lleva los adjuntos que se eligieron al registrar.
function dmDatosCorreo(registro, archivos) {
    return { personal: window.personalSeleccionado, fechaInicio: registro.FECHA_INICIO, fechaFin: registro.FECHA_FIN,
        fechaOtorgamiento: registro.FECHA_OTORGAMIENTO, observacion: registro.OBSERVACION || '',
        imagenes: archivos.filter(f => f.esImagen).map(f => f.dataUrl), pdfs: archivos.filter(f => !f.esImagen).map(f => f.name) };
}
function dmAbrirCorreo(registro, conFotoActual) {
    const D = window.DescansoMedicoCorreo;
    // Los adjuntos elegidos al registrar pasan al modal de correo y se vacían aquí,
    // para que no se arrastren a otro registro si se cierra el correo sin enviarlo.
    const iniciales = conFotoActual ? descansoArchivos.slice() : [];
    descansoArchivos = []; dmPintarFoto();
    window.CorreoModal.abrir({
        clave: 'descanso',
        claveLegacy: { para: 'hrm_descanso_correo_para', cc: 'hrm_descanso_correo_cc' },
        titulo: 'Correo de descanso médico',
        // Para: por defecto, el correo institucional del personal involucrado (si no lo tiene, el último destinatario usado)
        paraInicial: String(window.personalSeleccionado?.EMAIL_INSTITUCIONAL || '').trim() || undefined,
        asunto: D.armar(dmDatosCorreo(registro, iniciales)).asunto,
        html: D.generarHTML(dmDatosCorreo(registro, iniciales)),
        textoPlano: () => D.generarTexto(dmDatosCorreo(registro, iniciales)),
        imagenesEnCuerpo: true,          // fotografías pegadas en el cuerpo; PDF como adjuntos
        archivos: iniciales,
        // el texto del correo menciona los adjuntos: se rearma si se agregan/quitan en el modal
        regenerar: archivos => D.generarHTML(dmDatosCorreo(registro, archivos))
    });
}


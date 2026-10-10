// ============================================================
// DESCANSO.JS — Orquestador del módulo Descanso médico
// Flujo: seleccionar personal → Descanso médico → datos (+ foto
// opcional) → registrar → vista previa del correo → copiar.
// ============================================================
let descansoRegistros = [];
let descansoArchivos = [];      // adjuntos {name,type,dataUrl,esImagen} (no se guardan en BD)
let descansoCorreoDatos = null; // datos del correo en vista previa

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
    const lista = dmEl('dmCorreoAdjuntos');
    if (lista) lista.innerHTML = descansoArchivos.length ? '<b>Archivos del correo:</b> ' + descansoArchivos.map(f => `${f.esImagen ? '🖼️ en el cuerpo' : '📎 adjunto'}: ${window.esc(f.name)}`).join(' · ') : '';
}
function dmQuitarFotoInterna() { descansoArchivos = []; ['dmFoto', 'dmFotoCorreo'].forEach(id => { const f = dmEl(id); if (f) f.value = ''; }); dmPintarFoto(); }
window.dmQuitarFoto = function () { dmQuitarFotoInterna(); if (descansoCorreoDatos) dmRepintarCorreo(); };
window.dmQuitarArchivo = function (i) { descansoArchivos.splice(i, 1); dmPintarFoto(); if (descansoCorreoDatos) dmRepintarCorreo(); };
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
    if (descansoCorreoDatos) dmRepintarCorreo();
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
        dmLimpiarCampos(); // la foto se conserva para el correo abierto; se borra al cerrarlo
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

// ---------- Vista previa del correo ----------
function dmDatosCorreo() {
    return { personal: window.personalSeleccionado, fechaInicio: descansoCorreoDatos.FECHA_INICIO, fechaFin: descansoCorreoDatos.FECHA_FIN,
        fechaOtorgamiento: descansoCorreoDatos.FECHA_OTORGAMIENTO, observacion: descansoCorreoDatos.OBSERVACION || '',
        imagenes: descansoArchivos.filter(f => f.esImagen).map(f => f.dataUrl), pdfs: descansoArchivos.filter(f => !f.esImagen).map(f => f.name) };
}
function dmRepintarCorreo() {
    const prev = dmEl('dmCorreoPreview'); if (prev && descansoCorreoDatos) prev.innerHTML = window.DescansoMedicoCorreo.generarHTML(dmDatosCorreo());
}
function dmAbrirCorreo(registro, conFotoActual) {
    descansoCorreoDatos = registro;
    if (!conFotoActual) { descansoArchivos = []; const f = dmEl('dmFotoCorreo'); if (f) f.value = ''; }
    dmPintarFoto(); dmRepintarCorreo(); dmPrecargarDestinatarios(); window.DescansoGmail?.precargar().catch(() => {});
    const modal = dmEl('modalCorreoDescansoMedico');
    if (modal) { modal.style.display = 'flex'; modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}
window.cerrarModalCorreoDescansoMedico = function () {
    const modal = dmEl('modalCorreoDescansoMedico');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
    // si el modal de registro sigue abierto, se mantiene el bloqueo de scroll
    document.body.style.overflow = dmEl('modalDescansoMedico')?.classList.contains('active') ? 'hidden' : '';
    descansoCorreoDatos = null; descansoArchivos = []; dmPintarFoto();
};

window.copiarCorreoDescansoMedico = async function () {
    if (!descansoCorreoDatos) return;
    const d = dmDatosCorreo(), html = window.DescansoMedicoCorreo.generarHTML(d), texto = window.DescansoMedicoCorreo.generarTexto(d);
    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    host.style.cssText = 'position:fixed;top:0;left:0;width:680px;overflow:hidden;opacity:0;pointer-events:none;background:#FFFFFF;';
    host.innerHTML = html; document.body.appendChild(host);
    let ok = false;
    try { const r = document.createRange(); r.selectNodeContents(host); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); ok = document.execCommand('copy'); s.removeAllRanges(); } catch (e) { ok = false; }
    document.body.removeChild(host);
    if (!ok) {
        try {
            if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texto], { type: 'text/plain' }) })]); ok = true; }
            else if (navigator.clipboard) { await navigator.clipboard.writeText(texto); ok = true; }
        } catch (e) { ok = false; }
    }
    window.toast(ok ? '📋 Copiado — pégalo directo en el cuerpo del correo' : '❌ No se pudo copiar; selecciona el texto manualmente', ok ? 'success' : 'error');
};

// Descarga un borrador .eml (imágenes en el cuerpo + PDF como adjuntos); se abre con Outlook / Correo.
window.dmDescargarEml = function () {
    if (!descansoCorreoDatos) return;
    const eml = window.DescansoMedicoCorreo.generarEml(dmDatosCorreo(), descansoArchivos);
    const nombre = 'descanso_medico_' + (descansoCorreoDatos.FECHA_INICIO || '') + '.eml';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([eml], { type: 'message/rfc822' })); a.download = nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    window.toast('📎 Borrador .eml descargado: ábrelo y se verá con los PDF adjuntos', 'success');
};

// ---------- Envío directo del correo (sin copiar/pegar) ----------
const DM_LS_PARA = 'hrm_descanso_correo_para', DM_LS_CC = 'hrm_descanso_correo_cc';
function dmLsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function dmLsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function dmPrecargarDestinatarios() { dmSet('dmCorreoPara', dmLsGet(DM_LS_PARA)); dmSet('dmCorreoCc', dmLsGet(DM_LS_CC)); }

window.dmEnviarCorreo = async function () {
    if (!descansoCorreoDatos) return;
    const para = dmGet('dmCorreoPara').trim(), cc = dmGet('dmCorreoCc').trim();
    if (!para) { window.toast('⚠️ Indica el destinatario del correo', 'warning'); dmEl('dmCorreoPara')?.focus(); return; }
    const d = dmDatosCorreo(), D = window.DescansoMedicoCorreo;
    const imgs = descansoArchivos.filter(f => f.esImagen), pdfs = descansoArchivos.filter(f => !f.esImagen);
    const directo = window.DescansoGmail.disponible();
    const resumen = `Para: ${para}${cc ? '\nCC: ' + cc : ''}\nAsunto: ${D.armar(d).asunto}\nImágenes en el cuerpo: ${imgs.length} · PDF adjuntos: ${pdfs.length}` +
        (directo ? '\n\nSe enviará con tu cuenta de Google corporativa.' : '');
    if (!confirm('¿Enviar ahora este correo?\n\n' + resumen)) return;
    const btn = dmEl('dmBtnEnviar'); if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; }
    try {
        if (directo) {
            // Gmail con la cuenta corporativa de quien usa el sistema
            const tokenP = window.DescansoGmail.obtenerToken(false);   // se llama dentro del clic
            const tk = await tokenP;
            const eml = D.generarEml(d, descansoArchivos, { enviar: true, para, cc });
            const r = await window.DescansoGmail.enviar(tk, eml);
            if (!r.ok) { window.toast('❌ ' + r.message, 'error'); return; }
            dmLsSet(DM_LS_PARA, para); dmLsSet(DM_LS_CC, cc);
            window.toast('✉️ Correo enviado desde ' + r.de + ' a ' + para, 'success');
            window.cerrarModalCorreoDescansoMedico();
            return;
        }
        // Método anterior (Apps Script)
        const b64 = f => String(f.dataUrl).split(',')[1] || '';
        const r = await window.DescansoMedicoAPI.enviarCorreo({
            PARA: para, CC: cc, ASUNTO: D.armar(d).asunto, HTML: D.generarHTML(d, { cid: true }), TEXTO: D.generarTexto(d),
            IMAGENES: imgs.map(f => ({ name: f.name, base64: b64(f) })), PDFS: pdfs.map(f => ({ name: f.name, base64: b64(f) })),
            ID_DESCANSO: descansoCorreoDatos.ID_DESCANSO || ''
        });
        if (!r.success) { window.toast('❌ ' + (r.message || 'No se pudo enviar el correo'), 'error'); return; }
        dmLsSet(DM_LS_PARA, para); dmLsSet(DM_LS_CC, cc);
        window.toast('✉️ Correo enviado a ' + para, 'success');
        window.cerrarModalCorreoDescansoMedico();
    } catch (e) {
        window.toast('❌ ' + (e.message || 'No se pudo enviar el correo'), 'error');
    } finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar correo'; } }
};

window.dmCambiarCuentaGoogle = async function () {
    try { window.DescansoGmail.olvidar(); await window.DescansoGmail.precargar(); await window.DescansoGmail.obtenerToken(true); window.toast('Cuenta de Google actualizada', 'success'); }
    catch (e) { window.toast('❌ ' + e.message, 'error'); }
};

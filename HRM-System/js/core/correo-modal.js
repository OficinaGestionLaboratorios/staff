// ============================================================
// CORREO-MODAL.JS — Modal ÚNICO de "Vista previa de correo" para
// todos los módulos (Sobretiempo, Horario, Descanso médico, Propuestas, Acciones).
// ============================================================
// Flujo v101: redactar y enviar desde la cuenta institucional individual mediante Gmail API.
//   · Destinatarios Para/CC editables, asunto y cuerpo con vista previa.
//   · Adjuntos propios y adjuntos generados por cada módulo.
//   · Envío directo con confirmación; no abre Gmail ni crea borradores.
//   · Copiar todo permanece como alternativa manual.
//
// Cada módulo solo redacta su correo y llama a:
//   window.CorreoModal.abrir({ ...cfg })
//
// cfg:
//   clave          'sobretiempo' | 'horario' | 'descanso' ...  (identificador del módulo)
//   titulo, subtitulo
//   asunto         string
//   html           string (cuerpo inicial)
//   regenerar      (archivos) => html. Si existe, el cuerpo se rearma al cambiar los adjuntos
//   textoPlano     () => string (respaldo de «Copiar todo»)
//   imagenesEnCuerpo  true → las imágenes se reducen y van pegadas en el cuerpo (cid:); los PDF van adjuntos
//   archivos       [{name,type,dataUrl,esImagen}] adjuntos iniciales
//   extras         (contenedor, api) => void   inserta controles propios del módulo
//   adjuntosAuto   [{ id, etiqueta, nota, cantidad, marcado, generar: async () => ({archivos, fallos, total}) }]
//                  casillas «Adjuntar …»: se generan al confirmar el envío
//   botones        [{ texto, icono, titulo, onClick }] botones extra del pie
//   alEnviar       (resultado) => void   se llama cuando Gmail confirma el envío
//   paraInicial    string de destinatarios iniciales, separados por coma o punto y coma
// api (para extras / botones): { setHTML, getHTML, setAsunto, cfg }
// ============================================================
window.CorreoModal = (function () {
    const MAX_ARCHIVO = 10 * 1024 * 1024, MAX_TOTAL = 18 * 1024 * 1024;
    let cfg = null, archivos = [], editado = false, ocupado = false;

    const $ = id => document.getElementById(id);
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const api = {
        setHTML(h) { const p = $('ogcPreview'); if (p) { p.innerHTML = h; editado = false; } },
        getHTML() { return ($('ogcPreview')?.innerHTML || '').trim(); },
        setAsunto(t) { const a = $('ogcAsunto'); if (a) a.value = t || ''; },
        get cfg() { return cfg; }
    };

    // ---------- MIME ----------
    const b64 = s => btoa(unescape(encodeURIComponent(s)));
    const lineas76 = b => (b.match(/.{1,76}/g) || []).join('\r\n');
    const datos64 = u => String(u).split(',')[1] || '';
    // Los encabezados MIME deben ser ASCII: sin tildes ni caracteres raros en el nombre del archivo.
    const limpiaNombre = n => String(n || 'adjunto').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]|["\\]/g, '_');

    // Mensaje RFC 822 listo para Gmail API. Las imágenes data: del cuerpo pasan a partes
    // inline (cid:), así se ven en cualquier cliente. adjuntos: [{name,type,dataUrl}]
    function generarEml({ para, cc, asunto, html, adjuntos }) {
        const t = Date.now(), b1 = '----=_OGL_mixed_' + t, b2 = '----=_OGL_rel_' + t, inline = [];
        const cuerpo = String(html).replace(/(<img\b[^>]*?\bsrc=")data:(image\/[\w.+-]+);base64,([^"]+)(")/gi, (m, a, tipo, dat, z) => {
            inline.push({ tipo, dat }); return `${a}cid:ogcimg${inline.length}${z}`;
        });
        const L = [...(para ? ['To: ' + para] : []), ...(cc ? ['Cc: ' + cc] : []), 'MIME-Version: 1.0', 'Subject: =?UTF-8?B?' + b64(asunto) + '?=',
            `Content-Type: multipart/mixed; boundary="${b1}"`, '',
            `--${b1}`, `Content-Type: multipart/related; boundary="${b2}"`, '',
            `--${b2}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', lineas76(b64('<html><body>' + cuerpo + '</body></html>')), ''];
        inline.forEach((im, i) => L.push(`--${b2}`, `Content-Type: ${im.tipo}`, 'Content-Transfer-Encoding: base64', `Content-ID: <ogcimg${i + 1}>`,
            `Content-Disposition: inline; filename="imagen${i + 1}"`, '', lineas76(im.dat), ''));
        L.push(`--${b2}--`, '');
        (adjuntos || []).forEach(a => {
            const n = limpiaNombre(a.name);
            L.push(`--${b1}`, `Content-Type: ${a.type || 'application/octet-stream'}; name="${n}"`, 'Content-Transfer-Encoding: base64',
                `Content-Disposition: attachment; filename="${n}"`, '', lineas76(datos64(a.dataUrl)), '');
        });
        L.push(`--${b1}--`, '');
        return L.join('\r\n');
    }

    // ---------- Adjuntos ----------
    const esPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const esImg = f => (f.type || '').startsWith('image/');
    const leerDataUrl = f => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(''); fr.readAsDataURL(f); });
    // Reduce la imagen (máx. 1200 px, JPEG) para que el correo no pese de más.
    function leerImagenReducida(file) {
        return new Promise(resolve => {
            leerDataUrl(file).then(src => {
                if (!src) return resolve(null);
                const img = new Image();
                img.onload = () => {
                    const k = Math.min(1, 1200 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
                    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
                    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                    const dataUrl = cv.toDataURL('image/jpeg', 0.82);
                    resolve({ name: (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', dataUrl, esImagen: true, size: Math.round(datos64(dataUrl).length * 0.75) });
                };
                img.onerror = () => resolve(null);
                img.src = src;
            });
        });
    }
    const enCuerpo = a => !!(cfg.imagenesEnCuerpo && a.esImagen);
    const adjuntosReales = () => archivos.filter(a => !enCuerpo(a));
    const pesoTotal = lista => lista.reduce((s, x) => s + (x.size || 0), 0);

    function pintarAdjuntos() {
        const el = $('ogcAdjuntos'); if (!el) return;
        el.innerHTML = archivos.map((f, i) => `<span class="ogc-chip">${f.esImagen && cfg.imagenesEnCuerpo ? '🖼️' : '📎'} ${esc(f.name)}${enCuerpo(f) ? ' <em>(en el cuerpo)</em>' : ''}
            <button type="button" title="Quitar" onclick="window.CorreoModal.quitarArchivo(${i})"><i class="fas fa-times"></i></button></span>`).join('');
    }
    function alCambiarArchivos() {
        pintarAdjuntos();
        if (!cfg.regenerar) return;
        if (editado && !confirm('Cambiaste los adjuntos: el texto del correo se vuelve a armar y se perderán tus ediciones del cuerpo.\n\n¿Continuar?')) return;
        api.setHTML(cfg.regenerar(archivos));
    }
    async function agregarArchivos(lista) {
        for (const f of Array.from(lista || [])) {
            if (!esPdf(f) && !esImg(f)) { window.toast(`⚠️ "${f.name}" no es imagen ni PDF`, 'warning'); continue; }
            if (f.size > MAX_ARCHIVO) { window.toast(`⚠️ "${f.name}" pesa más de 10 MB`, 'warning'); continue; }
            if (pesoTotal(archivos) + f.size > MAX_TOTAL) { window.toast('⚠️ Los adjuntos superan 18 MB en total', 'warning'); continue; }
            let r;
            if (esImg(f) && cfg.imagenesEnCuerpo) r = await leerImagenReducida(f);
            else {
                const dataUrl = await leerDataUrl(f);
                r = dataUrl ? { name: f.name, type: f.type || (esPdf(f) ? 'application/pdf' : 'application/octet-stream'), dataUrl, esImagen: esImg(f), size: f.size } : null;
            }
            if (r) archivos.push(r); else window.toast(`⚠️ No se pudo leer "${f.name}"`, 'warning');
        }
    }

    // Recupera sugerencias y contactos relacionados desde BD_CORREOS, si está disponible.
    async function cargarDestinatariosSugeridos(config) {
        const DB = window.CorreosDB;
        if (!DB || typeof DB.propuesta !== 'function') return;
        try {
            await DB.cargar(false);
            const persona = config.personal || window.personalSeleccionado || null;
            const propuesta = DB.propuesta(persona, config.clave || '', config.paraInicial || '');
            const para = $('ogcPara'), cc = $('ogcCC'), lista = $('ogcSugeridos');
            // Solo completar si el usuario no ha empezado a editar los campos.
            if (para && (!para.value || para.value === (config.paraInicial || '')) && propuesta.para?.length) para.value = propuesta.para.join('; ');
            if (cc && (!cc.value || cc.value === (config.ccInicial || '')) && propuesta.cc?.length) cc.value = propuesta.cc.join('; ');
            if (lista) lista.innerHTML = (propuesta.sugeridos || []).map(x => `<option value="${esc(x.email)}" label="${esc([x.nombre, x.detalle].filter(Boolean).join(' · '))}"></option>`).join('');
        } catch (e) { console.warn('No se pudieron cargar sugerencias de BD_CORREOS:', e); }
    }

    // ---------- Apertura / cierre ----------
    function abrir(c) {
        const modal = $('modalCorreo'), prev = $('ogcPreview');
        if (!modal || !prev) { console.error('Falta #modalCorreo en app.html'); return; }
        cfg = c || {}; archivos = []; editado = false; ocupado = false;
        $('ogcTitulo').textContent = cfg.titulo || 'Vista previa de correo';
        $('ogcSubtitulo').textContent = cfg.subtitulo || 'Revisa destinatarios, asunto, contenido y adjuntos. El mensaje se enviará desde tu cuenta institucional.';
        $('ogcPara').value = cfg.paraInicial || '';
        $('ogcCC').value = cfg.ccInicial || '';
        $('ogcSugeridos').innerHTML = '';
        cargarDestinatariosSugeridos(cfg);
        $('ogcAsunto').value = cfg.asunto || '';
        $('ogcArchivosInput').value = '';
        $('ogcNotaImg').style.display = cfg.imagenesEnCuerpo ? '' : 'none';

        // Casillas de adjuntos opcionales (se generan al confirmar el envío).
        $('ogcAuto').innerHTML = (cfg.adjuntosAuto || []).map(a => `<div class="ogc-auto"><label>
            <input type="checkbox" id="ogcAuto_${esc(a.id)}" ${a.cantidad === 0 ? 'disabled' : (a.marcado === false ? '' : 'checked')}>
            <span>${esc(a.etiqueta)}<br><small>${esc(a.nota || 'Se genera al enviar el correo. «Copiar todo» no lo incluye.')}</small></span></label></div>`).join('');

        // Controles propios del módulo
        const ex = $('ogcExtras'); ex.innerHTML = '';
        if (typeof cfg.extras === 'function') cfg.extras(ex, api);

        // Botones extra del pie
        const be = $('ogcBotonesExtra'); be.innerHTML = '';
        (cfg.botones || []).forEach(b => {
            const el = document.createElement('button');
            el.type = 'button'; el.className = 'btn btn-secondary'; el.style.padding = '8px 20px'; if (b.titulo) el.title = b.titulo;
            el.innerHTML = (b.icono ? `<i class="fas ${b.icono}"></i> ` : '') + esc(b.texto);
            el.addEventListener('click', () => b.onClick && b.onClick(api));
            be.appendChild(el);
        });

        prev.innerHTML = cfg.html || '';
        prev.contentEditable = 'true';   // el usuario puede corregir el texto antes de pasar a Gmail o copiar
        prev.oninput = () => { editado = true; };

        (c.archivos || []).forEach(a => archivos.push({ ...a, size: a.size || Math.round(datos64(a.dataUrl).length * 0.75) }));
        pintarAdjuntos();
        const ok0 = $('ogcGmailListo'); if (ok0) { ok0.style.display = 'none'; ok0.innerHTML = ''; }
        window.CorreoGmail?.precargar().catch(() => {});

        modal.style.display = 'flex'; modal.classList.add('active'); document.body.style.overflow = 'hidden';
    }

    function cerrar() {
        const modal = $('modalCorreo');
        if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
        // si hay otro modal abierto debajo (Sobretiempo, Descanso médico…), se mantiene el bloqueo de scroll
        document.body.style.overflow = document.querySelector('.modal.active') ? 'hidden' : '';
        cfg = null; archivos = [];
    }

    // ---------- Acciones del modal ----------
    function formato(cmd, valor) {
        const cuerpo = $('ogcPreview'), sel = window.getSelection();
        if (!cuerpo || !sel.rangeCount || sel.isCollapsed || !cuerpo.contains(sel.anchorNode)) { window.toast('⚠️ Selecciona primero un texto dentro del correo', 'warning'); return; }
        document.execCommand('styleWithCSS', false, true);
        if (cmd === 'resaltar') document.execCommand('hiliteColor', false, '#FFF3A8');
        else if (cmd === 'sinResalte') document.execCommand('hiliteColor', false, 'transparent');
        else document.execCommand(cmd, false, valor);
        editado = true;
    }

    async function copiarAsunto() {
        const t = $('ogcAsunto')?.value || ''; if (!t) return;
        try { await navigator.clipboard.writeText(t); window.toast('📋 Asunto copiado', 'success'); }
        catch (e) { window.toast('❌ No se pudo copiar el asunto', 'error'); }
    }

    async function cambiarCuenta() {
        try { window.CorreoGmail.olvidar(); await window.CorreoGmail.precargar(); const tk = await window.CorreoGmail.obtenerToken(true); const email = await window.CorreoGmail.verificarCuenta(tk); window.toast('Cuenta institucional conectada: ' + email, 'success'); }
        catch (e) { window.toast('❌ ' + e.message, 'error'); }
    }

    // Truco de contenteditable + execCommand('copy') (conserva tablas y formato en Outlook/Gmail),
    // con respaldo en la Clipboard API moderna.
    async function copiarTodo() {
        if (!cfg) return;
        const html = api.getHTML(), texto = $('ogcPreview')?.innerText || (cfg.textoPlano ? cfg.textoPlano() : '');
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
        window.toast(ok ? '📋 Copiado — pégalo directo en el cuerpo del correo' : '⚠️ No se pudo copiar automáticamente. Selecciona el texto y usa Ctrl+C.', ok ? 'success' : 'warning');
    }

    // Envío real desde la cuenta institucional individual autorizada.
    async function irAGmail() {
        if (!cfg || ocupado) return;
        const G = window.CorreoGmail;
        if (!G || !G.disponible()) { window.toast('No está configurada la conexión OAuth de Gmail. Usa «Copiar todo» como alternativa.', 'warning'); return; }
        const para = G.normalizarDestinatarios($('ogcPara')?.value || '');
        const cc = G.normalizarDestinatarios($('ogcCC')?.value || '');
        if (!para.lista.length) { window.toast('Ingresa al menos un destinatario en Para.', 'warning'); $('ogcPara')?.focus(); return; }
        if (para.invalidos.length || cc.invalidos.length) { window.toast('Revisa los correos inválidos: ' + [...para.invalidos, ...cc.invalidos].join(', '), 'error'); return; }
        const asunto = ($('ogcAsunto').value || '').trim() || cfg.asunto || '';
        const cuerpo = api.getHTML();
        if (!asunto) { window.toast('El asunto del correo está vacío.', 'warning'); return; }
        if (!cuerpo) { window.toast('El cuerpo del correo está vacío.', 'warning'); return; }
        const autos = (cfg.adjuntosAuto || []).filter(a => $('ogcAuto_' + a.id)?.checked);
        let adjuntos = adjuntosReales().slice();
        const btn = $('ogcBtnGmail'), html0 = btn.innerHTML, miCfg = cfg, aviso = $('ogcGmailListo');
        ocupado = true; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando cuenta...';
        if (aviso) { aviso.style.display = 'none'; aviso.innerHTML = ''; }
        try {
            // Obtener token se invoca desde el clic del usuario para permitir el popup OAuth.
            const tk = await G.obtenerToken(false);
            const cuenta = await G.verificarCuenta(tk);
            for (const a of autos) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando adjuntos...';
                const g = await a.generar();
                if (g.fallos?.length && !confirm(`No se pudo generar ${g.fallos.length} de ${g.total} adjunto(s):\n\n${g.fallos.join('\n')}\n\n¿Continuar sin esos archivos?`)) return;
                adjuntos = adjuntos.concat(g.archivos || []);
            }
            if (pesoTotal(adjuntos) > MAX_TOTAL) { window.toast('Los adjuntos superan 18 MB. Retira archivos antes de enviar.', 'warning'); return; }
            const mime = generarEml({ para: para.lista.join(', '), cc: cc.lista.join(', '), asunto, html: cuerpo, adjuntos });
            if (!confirm(`Se enviará este correo desde tu cuenta institucional${cuenta ? ` (${cuenta})` : ''}.\n\nPara: ${para.lista.join(', ')}${cc.lista.length ? `\nCC: ${cc.lista.join(', ')}` : ''}\nAsunto: ${asunto}\nAdjuntos: ${adjuntos.length}\n\n¿Confirmas el envío?`)) return;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            const r = await G.enviar(tk, mime);
            if (!r.ok) { window.toast('No se pudo confirmar el envío: ' + r.message + ' Puedes usar «Copiar todo».', 'error'); return; }
            if (aviso) {
                aviso.innerHTML = `<i class="fas fa-check-circle"></i> Correo enviado correctamente desde <strong>${esc(r.de)}</strong>. ID: <code>${esc(r.id || 'confirmado')}</code>`;
                aviso.style.display = 'block';
            }
            window.toast('Correo enviado correctamente desde ' + r.de, 'success');
            if (window.CorreosDB?.registrarEnvio) {
                try { await window.CorreosDB.registrarEnvio({ para: para.lista, cc: cc.lista, personal: miCfg.personal || window.personalSeleccionado || null, modulo: miCfg.clave || '' }); }
                catch (eLog) { console.warn('El correo se envió, pero no se pudo actualizar BD_CORREOS:', eLog); }
            }
            if (miCfg.alEnviar) miCfg.alEnviar({ asunto, de: r.de, id: r.id, threadId: r.threadId, para: para.lista, cc: cc.lista });
        } catch (e) {
            window.toast('Error de autorización o envío: ' + (e.message || 'No se pudo enviar el correo.') + ' Puedes usar «Copiar todo».', 'error');
        } finally { ocupado = false; btn.disabled = false; btn.innerHTML = html0; }
    }

    return {
        abrir, cerrar, irAGmail, copiarTodo, copiarAsunto, cambiarCuenta, formato, generarEml,
        quitarArchivo(i) { archivos.splice(i, 1); alCambiarArchivos(); },
        async archivosElegidos(input) { await agregarArchivos(input.files); input.value = ''; alCambiarArchivos(); }
    };
})();

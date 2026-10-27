// ============================================================
// CORREO-MODAL.JS — Modal ÚNICO de "Vista previa de correo" para
// todos los módulos (Sobretiempo, Horario, Descanso médico).
// ============================================================
// Estándar tomado del módulo Sobretiempo:
//   · Para / CC (se recuerdan por módulo en localStorage)
//   · Asunto editable + botón Copiar
//   · Cuerpo editable con barra de formato ("lo que ves es lo que se envía")
//   · Adjuntos propios (PDF / imágenes) y adjuntos que se generan al enviar
//   · «Copiar todo» (respaldo), «Cambiar cuenta» y «Enviar correo»
//     (Gmail API con la cuenta corporativa de quien usa el sistema:
//      ver core/correo-gmail.js)
//
// Cada módulo solo redacta su correo y llama a:
//   window.CorreoModal.abrir({ ...cfg })
//
// cfg:
//   clave          'sobretiempo' | 'horario' | 'descanso'  (namespace de localStorage)
//   claveLegacy    { para, cc }  claves antiguas de localStorage (solo lectura)
//   titulo, subtitulo
//   asunto         string
//   html           string (cuerpo inicial)
//   regenerar      (archivos) => html. Si existe, el cuerpo se rearma al cambiar los adjuntos
//   textoPlano     () => string (respaldo de «Copiar todo»)
//   personal       (opcional) trabajador del envío; por defecto window.personalSeleccionado. Con él se arman
//                  Para/CC desde la base de correos (js/core/correos-db.js): 1.ª línea = su correo institucional
//   paraInicial    string (normalmente EMAIL_INSTITUCIONAL del personal involucrado). Si viene, se usa en vez
//                  del último destinatario y NO se recuerda; '' = vacío; undefined = último destinatario usado
//   imagenesEnCuerpo  true → las imágenes se reducen y van pegadas en el cuerpo (cid:); los PDF van adjuntos
//   archivos       [{name,type,dataUrl,esImagen}] adjuntos iniciales
//   extras         (contenedor, api) => void   inserta controles propios del módulo
//   adjuntosAuto   [{ id, etiqueta, nota, cantidad, marcado, generar: async () => ({archivos, fallos, total}) }]
//                  casillas «Adjuntar …»: se generan solo al enviar
//   botones        [{ texto, icono, titulo, onClick }] botones extra del pie
//   alEnviar       (resultado) => void
// api (para extras / botones): { setHTML, getHTML, setAsunto, cfg }
// ============================================================
window.CorreoModal = (function () {
    const MAX_ARCHIVO = 10 * 1024 * 1024, MAX_TOTAL = 18 * 1024 * 1024;
    let cfg = null, archivos = [], editado = false, tocado = false, sel = -1;

    const $ = id => document.getElementById(id);
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const kPara = () => `ogl_correo_${cfg.clave}_para`, kCc = () => `ogl_correo_${cfg.clave}_cc`;

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
        const L = ['To: ' + para, ...(cc ? ['Cc: ' + cc] : []), 'MIME-Version: 1.0', 'Subject: =?UTF-8?B?' + b64(asunto) + '?=',
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

    // ---------- Destinatarios: base de correos + autocompletado ----------
    const personalEnvio = () => (cfg && cfg.personal) || window.personalSeleccionado || null;
    const DB = () => window.CorreosDB;
    const camposDest = () => [$('ogcPara'), $('ogcCc')];
    const enCampos = () => new Set(camposDest().flatMap(t => DB().extraerEmails(t.value)));

    function agregarA(campoId, email) {
        const ta = $(campoId), lista = DB().extraerEmails(ta.value);
        if (lista.includes(email)) return;
        ta.value = lista.concat(email).join('\n');
        tocado = true; pintarSugeridos();
    }

    function pintarSugeridos(sugeridos) {
        const box = $('ogcSugeridos'); if (!box) return;
        if (sugeridos) box.__sug = sugeridos;
        const usados = enCampos(), lista = (box.__sug || []).filter(x => !usados.has(x.email));
        const aviso = (!DB().estaDisponible() && DB().ultimoError()) ? '<div class="ogc-aviso-db" style="flex-basis:100%">La base de correos aún no está activa en el backend (publica la versión nueva de Apps Script). El envío funciona igual.</div>' : '';
        box.innerHTML = aviso + (lista.length ? '<span><i class="fas fa-address-book"></i> Sugeridos:</span>' + lista.map(x => `<span class="ogc-sug" title="${esc(x.detalle || x.nombre || '')}">
            <button type="button" data-add="ogcPara" data-email="${esc(x.email)}">${esc(x.nombre ? x.nombre + ' · ' : '')}${esc(x.email)}</button><button type="button" data-add="ogcCc" data-email="${esc(x.email)}" title="Agregar en copia (CC)">CC</button></span>`).join('') : '')
            + `<button type="button" class="btn-chip" style="margin-left:auto;" onclick="window.BaseCorreos && window.BaseCorreos.abrir()"><i class="fas fa-database"></i> Base de correos</button>`;
    }

    function iniciarDestinatarios() {
        const box = $('ogcSugeridos');
        if (box && !box.__enlazado) {
            box.__enlazado = true;
            box.addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (b) agregarA(b.dataset.add, b.dataset.email); });
        }
        camposDest().forEach(ta => {
            if (ta.__enlazado) return; ta.__enlazado = true;
            ta.addEventListener('input', () => { tocado = true; sugerir(ta); pintarSugeridos(); });
            ta.addEventListener('focus', () => sugerir(ta));
            ta.addEventListener('blur', () => setTimeout(ocultarLista, 150));
            ta.addEventListener('keydown', e => teclasLista(e, ta));
        });
        pintarSugeridos([]);
        const miCfg = cfg, p = personalEnvio();
        DB().cargar(false).then(() => {
            if (cfg !== miCfg) return;           // el modal ya se cerró o se abrió otro correo
            const prop = DB().propuesta(p, miCfg.clave, String(miCfg.paraInicial || '').trim());
            if (!tocado) {                       // no se pisa lo que el usuario ya escribió
                const actualPara = DB().extraerEmails($('ogcPara').value);
                const para = Array.from(new Set(prop.para.concat(prop.para.length ? [] : actualPara)));
                if (para.length) $('ogcPara').value = para.join('\n');
                if (prop.cc.length) $('ogcCc').value = prop.cc.join('\n');
            }
            pintarSugeridos(prop.sugeridos);
        }).catch(() => {});
    }

    // Línea (o fragmento tras coma/;) que se está escribiendo
    function fragmentoActivo(ta) {
        const pos = ta.selectionStart, v = ta.value;
        const ini = Math.max(v.lastIndexOf('\n', pos - 1), v.lastIndexOf(',', pos - 1), v.lastIndexOf(';', pos - 1)) + 1;
        let fin = v.length; ['\n', ',', ';'].forEach(c => { const k = v.indexOf(c, pos); if (k !== -1 && k < fin) fin = k; });
        return { ini, fin, texto: v.slice(ini, pos).trim() };
    }
    let listaActiva = null;
    function sugerir(ta) {
        const lista = $('ogcAutoList'); if (!lista) return;
        const f = fragmentoActivo(ta);
        const res = DB().buscar(f.texto, { excluir: Array.from(enCampos()), limite: 8 });
        if (!res.length) return ocultarLista();
        listaActiva = ta; sel = 0;
        ta.parentNode.appendChild(lista);
        lista.innerHTML = res.map((r, i) => `<div class="ogc-auto-item${i === 0 ? ' sel' : ''}" data-email="${esc(r.email)}"><strong>${esc(r.email)}</strong><small>${esc([r.nombre, r.detalle].filter(Boolean).join(' · '))}</small></div>`).join('');
        lista.classList.add('visible');
        lista.onmousedown = e => { const it = e.target.closest('.ogc-auto-item'); if (it) { e.preventDefault(); elegir(ta, it.dataset.email); } };
    }
    function ocultarLista() { const l = $('ogcAutoList'); if (l) l.classList.remove('visible'); listaActiva = null; }
    function elegir(ta, email) {
        const f = fragmentoActivo(ta), v = ta.value;
        ta.value = v.slice(0, f.ini) + email + '\n' + v.slice(f.fin).replace(/^[\n,;]+/, '');
        ta.selectionStart = ta.selectionEnd = f.ini + email.length + 1;
        tocado = true; ocultarLista(); pintarSugeridos(); ta.focus();
    }
    function teclasLista(e, ta) {
        const l = $('ogcAutoList'); if (!l || !l.classList.contains('visible') || listaActiva !== ta) return;
        const items = l.querySelectorAll('.ogc-auto-item');
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items.forEach((it, i) => it.classList.toggle('sel', i === sel));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (items[sel]) { e.preventDefault(); elegir(ta, items[sel].dataset.email); }
        } else if (e.key === 'Escape') ocultarLista();
    }

    // ---------- Apertura / cierre ----------
    function abrir(c) {
        const modal = $('modalCorreo'), prev = $('ogcPreview');
        if (!modal || !prev) { console.error('Falta #modalCorreo en app.html'); return; }
        cfg = c || {}; archivos = []; editado = false;
        $('ogcTitulo').textContent = cfg.titulo || 'Vista previa de correo';
        $('ogcSubtitulo').textContent = cfg.subtitulo || 'Cópialo al cuerpo del correo o envíalo directo con tu cuenta corporativa';
        tocado = false;
        const trabIni = String(cfg.paraInicial || '').trim();
        const legadoPara = cfg.paraInicial !== undefined ? cfg.paraInicial : (lsGet(kPara()) || lsGet(cfg.claveLegacy?.para || ''));
        $('ogcPara').value = trabIni || legadoPara || '';
        $('ogcCc').value = lsGet(kCc()) || lsGet(cfg.claveLegacy?.cc || '');
        iniciarDestinatarios();
        $('ogcAsunto').value = cfg.asunto || '';
        $('ogcArchivosInput').value = '';
        $('ogcNotaImg').style.display = cfg.imagenesEnCuerpo ? '' : 'none';

        // Casillas «Adjuntar …» (se generan al enviar)
        $('ogcAuto').innerHTML = (cfg.adjuntosAuto || []).map(a => `<div class="ogc-auto"><label>
            <input type="checkbox" id="ogcAuto_${esc(a.id)}" ${a.cantidad === 0 ? 'disabled' : (a.marcado === false ? '' : 'checked')}>
            <span>${esc(a.etiqueta)}<br><small>${esc(a.nota || 'Solo al enviar directo: se genera y viaja como adjunto. «Copiar todo» no lo incluye.')}</small></span></label></div>`).join('');

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
        prev.contentEditable = 'true';   // el usuario puede corregir el texto antes de enviar o copiar
        prev.oninput = () => { editado = true; };

        (c.archivos || []).forEach(a => archivos.push({ ...a, size: a.size || Math.round(datos64(a.dataUrl).length * 0.75) }));
        pintarAdjuntos();
        window.CorreoGmail?.precargar().catch(() => {});

        modal.style.display = 'flex'; modal.classList.add('active'); document.body.style.overflow = 'hidden';
    }

    function cerrar() {
        const modal = $('modalCorreo');
        if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
        // si hay otro modal abierto debajo (Sobretiempo, Descanso médico…), se mantiene el bloqueo de scroll
        document.body.style.overflow = document.querySelector('.modal.active') ? 'hidden' : '';
        cfg = null; archivos = []; ocultarLista();
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
        try { window.CorreoGmail.olvidar(); await window.CorreoGmail.precargar(); await window.CorreoGmail.obtenerToken(true); window.toast('Cuenta de Google actualizada', 'success'); }
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

    // Envío directo con Gmail (cuenta corporativa de quien usa el sistema).
    async function enviar() {
        if (!cfg) return;
        const G = window.CorreoGmail;
        if (!G || !G.disponible()) { window.toast('⚠️ El envío directo no está configurado: usa «Copiar todo»', 'warning'); return; }
        const malos = DB().fragmentosInvalidos($('ogcPara').value).concat(DB().fragmentosInvalidos($('ogcCc').value));
        if (malos.length) { window.toast('⚠️ Dirección(es) de correo no válida(s): ' + malos.join(', '), 'warning'); return; }
        const listaPara = DB().extraerEmails($('ogcPara').value), listaCc = DB().extraerEmails($('ogcCc').value).filter(e => !listaPara.includes(e));
        const para = listaPara.join(', '), cc = listaCc.join(', ');
        if (!para) { window.toast('⚠️ Indica el correo del destinatario', 'warning'); $('ogcPara').focus(); return; }
        const asunto = ($('ogcAsunto').value || '').trim() || cfg.asunto || '';
        const cuerpo = api.getHTML();
        if (!cuerpo) { window.toast('⚠️ El cuerpo del correo está vacío', 'warning'); return; }
        const autos = (cfg.adjuntosAuto || []).filter(a => $('ogcAuto_' + a.id)?.checked);
        const propios = adjuntosReales(), nEnCuerpo = archivos.length - propios.length;
        const resumen = `Para: ${para}${cc ? '\nCC: ' + cc : ''}\nAsunto: ${asunto}\nAdjuntos: ${propios.length} archivo(s) tuyos` +
            (nEnCuerpo ? ` · ${nEnCuerpo} imagen(es) en el cuerpo` : '') + autos.map(a => ` + ${a.cantidad ?? 1} ${a.etiquetaCorta || a.etiqueta}`).join('');
        if (!confirm(`¿Enviar ahora este correo?\n\n${resumen}\n\nSe enviará con tu cuenta de Google corporativa.`)) return;

        const btn = $('ogcBtnEnviar'), html0 = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        const miCfg = cfg;
        try {
            // El token se pide primero, dentro del clic (si no, el navegador bloquea la ventana de Google).
            const tk = await G.obtenerToken(false);
            let adjuntos = propios.slice();
            for (const a of autos) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando adjunto...';
                const g = await a.generar();
                if (g.fallos && g.fallos.length && !confirm(`No se pudo generar ${g.fallos.length} de ${g.total} adjunto(s):\n\n${g.fallos.join('\n')}\n\n¿Enviar el correo de todos modos, sin ese(os) adjunto(s)?`)) return;
                adjuntos = adjuntos.concat(g.archivos || []);
            }
            if (pesoTotal(adjuntos) > MAX_TOTAL) { window.toast('⚠️ Los adjuntos superan 18 MB: quita alguno o usa «Copiar todo»', 'warning'); return; }
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            const r = await G.enviar(tk, generarEml({ para, cc, asunto, html: cuerpo, adjuntos }));
            if (!r.ok) { window.toast('❌ ' + r.message + ' (puedes usar «Copiar todo»)', 'error'); return; }
            if (miCfg.paraInicial === undefined) lsSet(kPara(), para);
            lsSet(kCc(), cc);
            // Historial persistente (BD_CORREOS): no bloquea ni interrumpe el envío
            DB().registrarEnvio({ para: listaPara, cc: listaCc, personal: personalEnvio(), modulo: miCfg.clave }).catch(() => {});
            window.toast('✉️ Correo enviado desde ' + r.de + ' a ' + para, 'success');
            cerrar();
            if (miCfg.alEnviar) miCfg.alEnviar({ para, cc, asunto, de: r.de });
        } catch (e) {
            window.toast('❌ ' + (e.message || 'No se pudo enviar el correo') + ' (puedes usar «Copiar todo»)', 'error');
        } finally { btn.disabled = false; btn.innerHTML = html0; }
    }

    return {
        abrir, cerrar, enviar, copiarTodo, copiarAsunto, cambiarCuenta, formato, generarEml,
        quitarArchivo(i) { archivos.splice(i, 1); alCambiarArchivos(); },
        async archivosElegidos(input) { await agregarArchivos(input.files); input.value = ''; alCambiarArchivos(); }
    };
})();

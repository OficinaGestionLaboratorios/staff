// ============================================================
// ACCIONES-REGISTRO.JS — Botones de acción UNIFORMES por registro
// ============================================================
// Mismos cinco iconos en Horarios, Sobretiempo (solicitudes y
// descansos), Vacaciones, Permisos, Licencias y Descanso médico:
//   Editar (lápiz) · Exportar · Copiar al portapapeles · Correo · Eliminar
// Una sola línea, tooltips al pasar el cursor / recibir foco / tocar.
//
//   AccionesRegistro.html(id, { mostrar, desactivar })  → HTML del grupo
//   AccionesRegistro.enlazar(contenedor, { editar(id), ... }) → delegación (se puede llamar varias veces)
//   AccionesRegistro.exportarFilasXLSX(titulo, filas, nombre) → Excel genérico (campo/valor)
//   AccionesRegistro.copiar(texto)  → portapapeles
// ============================================================
window.AccionesRegistro = (function () {
    const DEF = {
        editar:   { icono: 'fa-pen',      tip: 'Editar',                clase: 'acc-editar' },
        exportar: { icono: 'fa-download', tip: 'Exportar',              clase: 'acc-exportar' },
        copiar:   { icono: 'fa-copy',     tip: 'Copiar al portapapeles', clase: 'acc-copiar' },
        correo:   { icono: 'fa-envelope', tip: 'Enviar correo electrónico', clase: 'acc-correo' },
        eliminar: { icono: 'fa-trash',    tip: 'Eliminar',              clase: 'acc-eliminar' }
    };
    const ORDEN = ['editar', 'exportar', 'copiar', 'correo', 'eliminar'];
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // opciones.mostrar: subconjunto de acciones (por defecto las cinco)
    // opciones.desactivar: { accion: 'motivo' } → botón atenuado con ese tooltip
    function html(id, opciones) {
        const o = opciones || {}, mostrar = o.mostrar || ORDEN, des = o.desactivar || {};
        const btns = ORDEN.filter(k => mostrar.includes(k)).map(k => {
            const d = DEF[k], tip = des[k] ? `${d.tip} (no disponible: ${des[k]})` : d.tip;
            return `<button type="button" class="acc-btn ${d.clase}${des[k] ? ' acc-off' : ''}" data-acc="${k}" data-id="${esc(id)}" data-tip="${esc(tip)}" aria-label="${esc(tip)}"><i class="fas ${d.icono}" aria-hidden="true"></i></button>`;
        }).join('');
        return `<div class="acciones-registro" role="group" aria-label="Acciones del registro">${btns}</div>`;
    }

    // Un único listener por contenedor; los manejadores se reemplazan en cada llamada.
    function enlazar(cont, manejadores) {
        if (!cont) return;
        cont.__accManejadores = manejadores || {};
        if (cont.__accEnlazado) return;
        cont.__accEnlazado = true;
        cont.addEventListener('click', e => {
            const b = e.target.closest('[data-acc]');
            if (!b || !cont.contains(b)) return;
            e.preventDefault(); e.stopPropagation();
            const fn = cont.__accManejadores[b.dataset.acc];
            if (typeof fn === 'function') fn(b.dataset.id, b);
        });
    }

    function copiar(texto) { window.copiarTexto(texto); }

    // ---- Excel genérico de un registro (campo / valor) ----
    function exportarFilasXLSX(titulo, filas, nombreArchivo) {
        if (typeof XLSX === 'undefined' || !XLSX.utils) { window.toast('⚠️ No se pudo cargar la librería de Excel (XLSX). Revisa tu conexión.', 'warning'); return false; }
        const aoa = [[titulo], [], ['Campo', 'Valor']].concat(filas.map(f => [f[0], f[1] == null ? '' : String(f[1])]));
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 30 }, { wch: 70 }];
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Registro');
        XLSX.writeFile(wb, (nombreArchivo || 'registro').replace(/[^\w\-À-ÿ]+/g, '_') + '.xlsx');
        window.toast('📥 Registro exportado', 'success');
        return true;
    }

    // Texto legible "Campo: valor" por líneas
    function filasATexto(titulo, filas) {
        return titulo + '\n' + filas.filter(f => f[1] !== '' && f[1] != null).map(f => `${f[0]}: ${f[1]}`).join('\n');
    }


    // ---- Correo genérico de un registro (Vacaciones, Permisos, Licencias) ----
    // cfg: { clave, titulo, asunto, saludo?, intro, filas:[[campo,valor]], cierre?, personal?, adjuntosAuto? }
    // Abre el modal único de correo; Para/CC se arman desde la base de correos.
    function abrirCorreoRegistro(cfg) {
        if (!window.CorreoModal) { window.toast('⚠️ El módulo de correo no está disponible', 'warning'); return; }
        const p = cfg.personal || window.personalSeleccionado;
        const filas = (cfg.filas || []).filter(f => f[1] !== '' && f[1] != null);
        const saludo = cfg.saludo || 'Estimado(a):';
        const cierre = cfg.cierre || 'Quedo atento a sus comentarios. Un cordial saludo.';
        const html = () => `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#222;">
            <p>${esc(saludo)}</p><p>${esc(cfg.intro)}</p>
            <table style="border-collapse:collapse;"><tbody>${filas.map(f => `<tr><td style="border:1px solid #BFC8D1;background:#E3E8ED;padding:4px 10px;font-weight:bold;">${esc(f[0])}</td><td style="border:1px solid #BFC8D1;padding:4px 10px;">${esc(f[1])}</td></tr>`).join('')}</tbody></table>
            <p>${esc(cierre)}</p></div>`;
        window.CorreoModal.abrir({
            clave: cfg.clave, titulo: cfg.titulo, subtitulo: 'Cópialo al cuerpo del correo o envíalo directo con tu cuenta corporativa',
            asunto: cfg.asunto, html: html(), personal: p,
            paraInicial: String((p && p.EMAIL_INSTITUCIONAL) || '').trim() || undefined,
            textoPlano: () => `${saludo}\n\n${cfg.intro}\n\n${filasATexto('', filas).trim()}\n\n${cierre}`,
            adjuntosAuto: cfg.adjuntosAuto
        });
    }

    // ---- Tooltips (un solo elemento fijo, nunca recortado por scroll de modales) ----
    let tipEl = null, tipTimer = null;
    function tip() {
        if (!tipEl) { tipEl = document.createElement('div'); tipEl.id = 'accTooltip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
        return tipEl;
    }
    function mostrar(btn, auto) {
        const t = btn.dataset.tip; if (!t) return;
        const el = tip(); el.textContent = t; el.classList.add('visible');
        const r = btn.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
        let x = r.left + r.width / 2 - w / 2; x = Math.max(6, Math.min(x, window.innerWidth - w - 6));
        let y = r.top - h - 8; if (y < 6) y = r.bottom + 8;
        el.style.left = x + 'px'; el.style.top = y + 'px';
        clearTimeout(tipTimer); if (auto) tipTimer = setTimeout(ocultar, 1600);
    }
    function ocultar() { clearTimeout(tipTimer); if (tipEl) tipEl.classList.remove('visible'); }
    document.addEventListener('mouseover', e => { const b = e.target.closest && e.target.closest('.acc-btn[data-tip]'); if (b) mostrar(b); });
    document.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest('.acc-btn[data-tip]')) ocultar(); });
    document.addEventListener('focusin', e => { const b = e.target.closest && e.target.closest('.acc-btn[data-tip]'); if (b) mostrar(b); });
    document.addEventListener('focusout', e => { if (e.target.closest && e.target.closest('.acc-btn[data-tip]')) ocultar(); });
    document.addEventListener('touchstart', e => { const b = e.target.closest && e.target.closest('.acc-btn[data-tip]'); if (b) mostrar(b, true); else ocultar(); }, { passive: true });
    document.addEventListener('scroll', ocultar, true);

    return { html, enlazar, copiar, exportarFilasXLSX, filasATexto, abrirCorreoRegistro, ORDEN };
})();

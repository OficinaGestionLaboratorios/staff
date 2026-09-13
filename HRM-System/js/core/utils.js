// ============================================================
// UTILIDADES
// ============================================================

// Retrasa la ejecución de "fn" hasta que pasen "wait" ms sin nuevas
// llamadas. Útil para inputs de búsqueda: evita re-renderizar la
// tabla completa en cada tecla presionada.
window.debounce = function(fn, wait = 250) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
};

window.esc = function(s) {
    return String(s || '').replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
};

window.formatearFecha = function(f) {
    if (!f) return '';
    try {
        const d = new Date(f);
        if (isNaN(d)) return f;
        // Formato explícito dd/mm/aaaa (no se deja a toLocaleDateString,
        // que según el navegador/SO puede no rellenar con ceros o usar
        // otro orden aunque se le pida el locale 'es-ES').
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = d.getUTCFullYear();
        return `${dd}/${mm}/${yyyy}`;
    } catch (e) { return f; }
};

// ===== ACTIVO / INACTIVO =====
// Estado del personal: campo ESTADO ("Activo" / "Inactivo") como
// fuente de verdad manual. Los registros que aún no tengan este
// campo (todo lo cargado antes de este cambio) se consideran
// Activos por defecto, para no ocultar a nadie de golpe.
window.esPersonalActivo = function(item) {
    return String(item?.ESTADO || 'Activo').trim().toUpperCase() !== 'INACTIVO';
};

window.copiarTexto = function(texto) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(texto).then(() => window.toast('📋 Copiado', 'success'))
            .catch(() => fallbackCopy(texto));
    } else fallbackCopy(texto);
};

function fallbackCopy(texto) {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); window.toast('📋 Copiado', 'success'); } catch (e) { window.toast('❌ Error', 'error'); }
    document.body.removeChild(ta);
}
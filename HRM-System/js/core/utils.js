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
        return d.toLocaleDateString('es-ES');
    } catch (e) { return f; }
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
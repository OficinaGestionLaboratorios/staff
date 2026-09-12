// ============================================================
// MODALES GLOBALES
// ============================================================

window.cerrarModalUbicaciones = function() {
    const modal = document.getElementById('modalUbicaciones');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
};

window.cerrarDetalle = function() {
    const modal = document.getElementById('modalDetalle');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    window.currentDetail = null;
    document.body.style.overflow = '';
};

window.editarDesdeDetalle = function() {
    if (window.currentDetail && window.editarRegistro) {
        window.editarRegistro(window.currentDetail);
        window.cerrarDetalle();
    }
};
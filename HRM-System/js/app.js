// ============================================================
// APP - Orquestador principal
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    // Configurar navegación
    document.querySelectorAll('.sidebar-left .menu-item[data-view]').forEach(item => {
        item.addEventListener('click', function() {
            const view = this.dataset.view;
            window.Router.cambiarVista(view);
        });
    });

    document.querySelectorAll('.main-nav .nav-link[data-view]').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const view = this.dataset.view;
            if (view === 'inicio') {
                window.location.href = '../index.html';
                return;
            }
            window.Router.cambiarVista(view);
        });
    });

    // Cargar vista inicial
    window.Router.cambiarVista('listado');

    // Cerrar modales con ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            window.cerrarModalUbicaciones?.();
            window.cerrarDetalle?.();
            window.Horarios?.cerrarModal?.();
        }
    });

    // Cerrar modales haciendo clic fuera
    document.addEventListener('click', function(e) {
        const modalDetalle = document.getElementById('modalDetalle');
        if (modalDetalle && modalDetalle.classList.contains('active') && e.target === modalDetalle) {
            window.cerrarDetalle?.();
        }
        const modalUbic = document.getElementById('modalUbicaciones');
        if (modalUbic && modalUbic.classList.contains('active') && e.target === modalUbic) {
            window.cerrarModalUbicaciones?.();
        }
        const modalHorario = document.getElementById('modalHorario');
        if (modalHorario && modalHorario.classList.contains('active') && e.target === modalHorario) {
            window.Horarios?.cerrarModal?.();
        }
    });
});

// Exponer funciones globales
window.cambiarVista = function(vista) {
    window.Router.cambiarVista(vista);
};
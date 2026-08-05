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
    });

    // ============================================================
    // 🔽 NUEVO: CARGAR MÓDULO DE HORARIOS
    // ============================================================
    // Cargar módulo de horarios (solo si no está cargado)
    if (!document.querySelector('script[src="js/horarios/horarios.js"]')) {
        const script = document.createElement('script');
        script.src = 'js/horarios/horarios.js';
        script.onload = function() {
            console.log('✅ Módulo Horarios cargado');
        };
        script.onerror = function() {
            console.error('❌ Error al cargar módulo Horarios');
        };
        document.head.appendChild(script);
    }
});

// Exponer funciones globales
window.cambiarVista = function(vista) {
    window.Router.cambiarVista(vista);
};
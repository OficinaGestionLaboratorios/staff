// ============================================================
// APP - Orquestador principal (CORREGIDO)
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 App iniciada');

    // Configurar navegación del sidebar
    document.querySelectorAll('.sidebar-left .menu-item[data-view]').forEach(item => {
        item.addEventListener('click', function(e) {
            const view = this.dataset.view;
            console.log('📌 Navegando a:', view);
            
            // Si es horarios, verificar que el módulo esté cargado
            if (view === 'horarios') {
                if (typeof window.Horarios === 'undefined' || typeof window.Horarios.render !== 'function') {
                    console.error('❌ Módulo Horarios no está disponible');
                    window.toast('⚠️ Cargando módulo Horarios...', 'info');
                    // Intentar cargar dinámicamente
                    cargarModuloHorarios();
                    return;
                }
            }
            
            window.Router.cambiarVista(view);
        });
    });

    // Configurar navegación del header
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

// ============================================================
// CARGA DINÁMICA DEL MÓDULO HORARIOS (fallback)
// ============================================================
function cargarModuloHorarios() {
    // Verificar si ya está cargado
    if (typeof window.Horarios !== 'undefined' && typeof window.Horarios.render === 'function') {
        window.Router.cambiarVista('horarios');
        return;
    }

    window.toast('⏳ Cargando módulo Horarios...', 'info');
    
    // Crear elementos script dinámicamente
    const scripts = [
        'js/horarios/horarios.js',
        'js/horarios/modalHorario.js'
    ];

    let loaded = 0;
    scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = function() {
            loaded++;
            if (loaded === scripts.length) {
                window.toast('✅ Módulo Horarios cargado', 'success');
                // Intentar navegar nuevamente
                setTimeout(() => {
                    if (typeof window.Horarios !== 'undefined' && typeof window.Horarios.render === 'function') {
                        window.Router.cambiarVista('horarios');
                    } else {
                        window.toast('❌ Error al cargar Horarios', 'error');
                    }
                }, 200);
            }
        };
        script.onerror = function() {
            window.toast('❌ Error cargando: ' + src, 'error');
        };
        document.head.appendChild(script);
    });
}

// Exponer funciones globales
window.cambiarVista = function(vista) {
    window.Router.cambiarVista(vista);
};

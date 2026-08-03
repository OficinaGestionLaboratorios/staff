// ============================================================
// ROUTER - Navegación entre vistas
// ============================================================

let vistaActual = 'listado';

window.Router = {
    cambiarVista(vista) {
        vistaActual = vista;

        // Actualizar navegación
        document.querySelectorAll('.main-nav .nav-link').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.sidebar-left .menu-item').forEach(el => el.classList.remove('active'));

        const navGestion = document.getElementById('navGestion');
        const sidebarItems = document.querySelectorAll('.sidebar-left .menu-item');

        if (vista === 'listado') {
            if (navGestion) navGestion.classList.add('active');
            if (sidebarItems[0]) sidebarItems[0].classList.add('active');
            window.renderListado();
        } else if (vista === 'dashboard') {
            if (sidebarItems[sidebarItems.length - 1]) sidebarItems[sidebarItems.length - 1].classList.add('active');
            window.renderDashboard();
        } else if (vista === 'registro') {
            if (navGestion) navGestion.classList.add('active');
            window.renderRegistro();
        } else if (vista === 'horarios') {
            // Buscar el item de horarios en el sidebar
            const horariosItem = document.querySelector('.sidebar-left .menu-item[data-view="horarios"]');
            if (horariosItem) horariosItem.classList.add('active');
            
            // ✅ Verificar que window.Horarios existe
            if (typeof window.Horarios !== 'undefined' && typeof window.Horarios.render === 'function') {
                window.Horarios.render();
            } else {
                // Fallback: mostrar mensaje de error
                document.getElementById('mainContent').innerHTML = `
                    <div class="topbar"><h1><i class="fas fa-clock" style="color:#3B82F6;"></i> Horarios</h1></div>
                    <div class="card">
                        <div class="empty-state" style="color:#EF4444;">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Error: El módulo de Horarios no se cargó correctamente.</p>
                            <p style="font-size:13px;color:#94A3B8;">Verifica que los archivos js/horarios/horarios.js y js/horarios/modalHorario.js existan.</p>
                            <button class="btn btn-primary" onclick="location.reload()" style="margin-top:12px;">
                                <i class="fas fa-sync-alt"></i> Recargar
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    },

    getVistaActual() { return vistaActual; }
};

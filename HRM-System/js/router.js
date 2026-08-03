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
            // Cargar la vista de horarios
            window.Horarios.render();
        }
    },

    getVistaActual() { return vistaActual; }
};
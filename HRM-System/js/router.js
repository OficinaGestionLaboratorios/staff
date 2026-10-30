// ============================================================
// ROUTER - Navegación entre vistas
// ============================================================

let vistaActual = 'listado';

window.Router = {
    cambiarVista(vista) {
        // Al salir del formulario (Volver, menú, etc.) se descarta cualquier edición pendiente,
        // para que un «Nuevo» posterior no herede los datos de la persona editada.
        if (vistaActual === 'registro' && vista !== 'registro') window.limpiarEstadoEdicion?.();
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
        } else if (vista === 'informes') {
            document.getElementById('menuItemInformes')?.classList.add('active');
            window.renderInformes();
        } else if (vista === 'registro') {
            if (navGestion) navGestion.classList.add('active');
            window.renderRegistro();
       
        }
    },

    getVistaActual() { return vistaActual; }
};
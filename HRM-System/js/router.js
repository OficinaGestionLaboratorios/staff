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
        
        // ============================================================
        // 🔽 NUEVO: AGREGAR VISTA HORARIOS
        // ============================================================
        } else if (vista === 'horarios') {
            const horariosItem = document.querySelector('.sidebar-left .menu-item[data-view="horarios"]');
            if (horariosItem) horariosItem.classList.add('active');

            const main = document.getElementById('mainContent');
            
            // Cargar template
            fetch('templates/horarios.html')
                .then(response => response.text())
                .then(html => {
                    main.innerHTML = html;
                    
                    // Cargar CSS si no está cargado
                    if (!document.querySelector('link[href="css/horarios.css"]')) {
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = 'css/horarios.css';
                        document.head.appendChild(link);
                    }
                    
                    // Inicializar módulo
                    if (window.horarios && window.horarios.init) {
                        setTimeout(() => window.horarios.init(), 100);
                    }
                })
                .catch(error => {
                    console.error('Error al cargar horarios:', error);
                    main.innerHTML = `
                        <div class="topbar">
                            <h1><i class="fas fa-clock" style="color:#3B82F6;"></i> Horarios</h1>
                        </div>
                        <div class="card">
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle" style="color:#EF4444;"></i>
                                <p>Error al cargar el módulo de horarios.</p>
                                <p style="font-size:13px;color:#94A3B8;">${error.message}</p>
                            </div>
                        </div>
                    `;
                });
        }
    },

    getVistaActual() { return vistaActual; }
};
// ============================================================
// APP - Orquestador principal
// ============================================================
// El arranque real (navegación, carga de la vista inicial) ya NO
// ocurre directo en DOMContentLoaded: espera a que js/core/auth.js
// confirme que hay una sesión válida y llame a window.iniciarApp().
// Esto evita que se disparen peticiones al backend (que de todos
// modos serían rechazadas sin token) antes de haber iniciado sesión.
// ============================================================

let appYaIniciada = false;
let listenersGlobalesInstalados = false;

// Listeners que solo deben engancharse UNA vez en toda la vida de la
// página (no dependen de si hay sesión o no, y no deben duplicarse
// si el usuario cierra sesión y vuelve a entrar sin recargar).
function instalarListenersGlobales() {
    if (listenersGlobalesInstalados) return;
    listenersGlobalesInstalados = true;

    document.querySelectorAll('.sidebar-left .menu-item[data-view]').forEach(item => {
        item.addEventListener('click', function() {
            window.Router.cambiarVista(this.dataset.view);
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

    // Cerrar modales con ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            window.cerrarModalUbicaciones?.();
            window.cerrarDetalle?.();
            window.cerrarModalHorarios?.();
            window.cerrarModalActividad?.();
            window.cerrarModalCambiarPassword?.();
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
        const modalActividad = document.getElementById('modalActividad');
        if (modalActividad && modalActividad.classList.contains('active') && e.target === modalActividad) {
            window.cerrarModalActividad?.();
        }
        const modalPassword = document.getElementById('modalCambiarPassword');
        if (modalPassword && modalPassword.classList.contains('active') && e.target === modalPassword) {
            window.cerrarModalCambiarPassword?.();
        }

        // Menú de usuario: se cierra al hacer clic fuera de él.
        const userMenuWrap = document.getElementById('userMenuWrap');
        if (userMenuWrap && !userMenuWrap.contains(e.target)) {
            userMenuWrap.classList.remove('open');
        }
    });

    // ---- Menú de usuario ----
    const userMenuBtn = document.getElementById('userMenuBtn');
    if (userMenuBtn) {
        userMenuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            document.getElementById('userMenuWrap')?.classList.toggle('open');
        });
    }

    // ---- Cambiar contraseña ----
    const formPassword = document.getElementById('formCambiarPassword');
    if (formPassword) {
        formPassword.addEventListener('submit', async function(e) {
            e.preventDefault();
            const actual = document.getElementById('passwordActual').value;
            const nueva = document.getElementById('passwordNueva').value;
            const confirmar = document.getElementById('passwordNuevaConfirm').value;
            const errorEl = document.getElementById('cambiarPasswordError');
            if (errorEl) errorEl.textContent = '';

            if (nueva !== confirmar) {
                if (errorEl) errorEl.textContent = 'Las contraseñas nuevas no coinciden';
                return;
            }

            const result = await window.AUTH.cambiarPassword(actual, nueva);
            if (result.success) {
                window.toast('✅ Contraseña actualizada. Vuelve a iniciar sesión', 'success');
                window.cerrarModalCambiarPassword();
                appYaIniciada = false;
                await window.AUTH.logout();
            } else if (errorEl) {
                errorEl.textContent = result.message || 'No se pudo cambiar la contraseña';
            }
        });
    }
}

window.iniciarApp = function() {
    instalarListenersGlobales();

    if (appYaIniciada) return; // evita recargar la vista si el login se reintenta
    appYaIniciada = true;

    // Pinta los datos del usuario logueado en el menú superior.
    const nombreEl = document.getElementById('userMenuNombre');
    const rolEl = document.getElementById('userMenuRol');
    if (nombreEl) nombreEl.textContent = window.AUTH.getNombre() || window.AUTH.getUsuario();
    if (rolEl) rolEl.textContent = window.AUTH.getRol() || 'usuario';

    // Cargar vista inicial
    window.Router.cambiarVista('listado');
};

// Exponer funciones globales
window.cambiarVista = function(vista) {
    window.Router.cambiarVista(vista);
};

window.abrirModalCambiarPassword = function() {
    document.getElementById('userMenuWrap')?.classList.remove('open');
    const modal = document.getElementById('modalCambiarPassword');
    if (!modal) return;
    document.getElementById('formCambiarPassword')?.reset();
    const errorEl = document.getElementById('cambiarPasswordError');
    if (errorEl) errorEl.textContent = '';
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.cerrarModalCambiarPassword = function() {
    const modal = document.getElementById('modalCambiarPassword');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
};

window.cerrarSesionApp = async function() {
    document.getElementById('userMenuWrap')?.classList.remove('open');
    if (!confirm('¿Cerrar sesión?')) return;
    appYaIniciada = false;
    await window.AUTH.logout();
};

window.toggleMenuHorarios = function(event) {
    event.stopPropagation();
    const grupo = document.getElementById('menuGroupHorarios');
    if (!grupo) return;
    const abierto = grupo.classList.toggle('open');
    const toggleBtn = grupo.querySelector('.menu-item-toggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
};

window.toggleMenuVacaciones = function(event) {
    event.stopPropagation();
    const grupo = document.getElementById('menuGroupVacaciones');
    if (!grupo) return;
    const abierto = grupo.classList.toggle('open');
    const toggleBtn = grupo.querySelector('.menu-item-toggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
};

// ============================================================
// AUTH.JS — Acceso, sesión y peticiones autenticadas al backend
// ============================================================
// Todo el resto de la app (personal, horarios, auditoría) queda
// detrás de esta pantalla de acceso: nada se pinta ni se pide al
// backend hasta que exista una sesión válida.
//
// La sesión vive en sessionStorage (se pierde al cerrar la pestaña,
// a propósito: es un panel de gestión, no debe quedar "recordado"
// en un equipo compartido) y expira además por tiempo, en espejo con
// SESSION_DURATION_SEC del backend (Codigo_corregido.gs).
// ============================================================

const AUTH_STORAGE_KEY = 'staffHubSesion';

window.AUTH = (function() {
    let sesion = null; // { token, usuario, nombre, rol, expiraEn }

    function cargarDeStorage() {
        try {
            const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            if (!s || !s.token || !s.expiraEn) return null;
            if (Date.now() >= s.expiraEn) {
                sessionStorage.removeItem(AUTH_STORAGE_KEY);
                return null;
            }
            return s;
        } catch (e) {
            return null;
        }
    }

    sesion = cargarDeStorage();

    function guardar(s) {
        sesion = s;
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(s));
    }

    function limpiar() {
        sesion = null;
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }

    function estaAutenticado() {
        if (!sesion) return false;
        if (Date.now() >= sesion.expiraEn) { limpiar(); return false; }
        return true;
    }

    // ---- Peticiones centralizadas ----
    // Todo módulo (api.js, horario-api.js, auditoria.js) debe usar
    // esto en vez de fetch() a pelo, para que: (a) el token viaje
    // siempre, y (b) una sesión expirada/rechazada por el backend
    // muestre automáticamente la pantalla de acceso de nuevo, en vez
    // de fallar en silencio o con un error genérico.
    function conToken(url) {
        const sep = url.includes('?') ? '&' : '?';
        return url + sep + 'token=' + encodeURIComponent(sesion ? sesion.token : '');
    }

    async function request(url, { incluirToken = true } = {}) {
        const finalUrl = incluirToken ? conToken(url) : url;
        try {
            const resp = await fetch(finalUrl);
            const texto = await resp.text();
            let result;
            try { result = JSON.parse(texto); } catch (e) { result = { success: false, message: 'Respuesta no válida del servidor' }; }

            if (!result.success && typeof result.message === 'string' && /sesión inválida|sesión expirada/i.test(result.message)) {
                manejarSesionExpirada();
            }
            return result;
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    function manejarSesionExpirada() {
        if (!sesion) return; // ya estábamos deslogueados, no repetir el toast
        limpiar();
        window.toast?.('⏱️ Tu sesión expiró. Vuelve a iniciar sesión', 'warning');
        mostrarLogin();
    }

    // ---- Pantalla de acceso ----

    function mostrarLogin() {
        const overlay = document.getElementById('loginOverlay');
        const root = document.getElementById('appRoot');
        if (overlay) overlay.classList.add('active');
        if (root) root.style.display = 'none';
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('loginUsuario')?.focus(), 50);
    }

    function ocultarLogin() {
        const overlay = document.getElementById('loginOverlay');
        const root = document.getElementById('appRoot');
        if (overlay) overlay.classList.remove('active');
        if (root) root.style.display = '';
        document.body.style.overflow = '';
    }

    async function login(usuario, password) {
        const url = window.API_URL + '?action=login&usuario=' + encodeURIComponent(usuario) + '&password=' + encodeURIComponent(password);
        const result = await request(url, { incluirToken: false });
        if (result.success && result.data) {
            guardar({
                token: result.data.token,
                usuario: result.data.usuario,
                nombre: result.data.nombre,
                rol: result.data.rol,
                expiraEn: Date.now() + (result.data.expiraEnSegundos || 21600) * 1000
            });
        }
        return result;
    }

    async function logout(mostrarPantalla = true) {
        if (sesion) {
            try { await request(window.API_URL + '?action=logout'); } catch (e) {}
        }
        limpiar();
        if (mostrarPantalla) mostrarLogin();
    }

    async function cambiarPassword(passwordActual, passwordNueva) {
        const url = window.API_URL + '?action=cambiarPassword&passwordActual=' + encodeURIComponent(passwordActual) + '&passwordNueva=' + encodeURIComponent(passwordNueva);
        return request(url);
    }

    function getToken() { return sesion ? sesion.token : ''; }
    function getUsuario() { return sesion ? sesion.usuario : ''; }
    function getNombre() { return sesion ? sesion.nombre : ''; }
    function getRol() { return sesion ? sesion.rol : ''; }

    // ---- Arranque ----
    // Se ejecuta al cargar el script (antes de DOMContentLoaded de
    // app.js). Si ya hay una sesión válida en sessionStorage, deja
    // pasar directo a la app; si no, muestra el login y engancha el
    // formulario. En ambos casos, window.iniciarApp() (definida en
    // app.js) es quien realmente arranca el router.
    function init() {
        document.addEventListener('DOMContentLoaded', function() {
            const form = document.getElementById('loginForm');
            if (form) {
                form.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const usuario = document.getElementById('loginUsuario').value.trim();
                    const password = document.getElementById('loginPassword').value;
                    const btn = document.getElementById('loginBtn');
                    const errorEl = document.getElementById('loginError');
                    if (errorEl) errorEl.textContent = '';
                    if (!usuario || !password) return;

                    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...'; }
                    try {
                        const result = await login(usuario, password);
                        if (result.success) {
                            ocultarLogin();
                            document.getElementById('loginPassword').value = '';
                            window.iniciarApp?.();
                        } else {
                            if (errorEl) errorEl.textContent = result.message || 'No se pudo iniciar sesión';
                        }
                    } finally {
                        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar'; }
                    }
                });
            }

            if (estaAutenticado()) {
                ocultarLogin();
                window.iniciarApp?.();
            } else {
                mostrarLogin();
            }
        });
    }

    init();

    return {
        request, login, logout, cambiarPassword,
        estaAutenticado, getToken, getUsuario, getNombre, getRol,
        mostrarLogin, ocultarLogin
    };
})();

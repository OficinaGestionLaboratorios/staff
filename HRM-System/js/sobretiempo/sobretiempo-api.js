// ============================================================
// SOBRETIEMPO-API.JS — Comunicación con BD_SOBRETIEMPO (backend)
// ============================================================
// Mismo patrón que horario-api.js: reutiliza window.API_URL /
// window.API_KEY / window.AUTH.request ya expuestos por js/api.js.
// ============================================================

window.SobretiempoAPI = (function() {

    async function llamar(url) {
        return window.AUTH.request(url);
    }

    function construirQuery(payload) {
        let qs = '';
        Object.entries(payload).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') {
                qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
            }
        });
        return qs;
    }

    // Lista las solicitudes, opcionalmente filtradas por CODE de empleado.
    async function listar(code) {
        const url = window.API_URL + '?action=listSobretiempo' + (code ? '&code=' + encodeURIComponent(code) : '');
        return llamar(url);
    }

    async function obtener(idSolicitud) {
        const url = window.API_URL + '?action=getSobretiempo&idSolicitud=' + encodeURIComponent(idSolicitud);
        return llamar(url);
    }

    // Fase 1: crear la solicitud (generación de horas).
    async function crear(payload) {
        const url = window.API_URL + '?action=createSobretiempo&key=' + encodeURIComponent(window.API_KEY) + construirQuery(payload);
        return llamar(url);
    }

    // Editar los datos de Fase 1 (solo posible mientras siga "Pendiente
    // de descanso": el backend rechaza la edición si ya se completó).
    async function actualizar(idSolicitud, payload) {
        const url = window.API_URL + '?action=updateSobretiempo&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_SOLICITUD=' + encodeURIComponent(idSolicitud) + construirQuery(payload);
        return llamar(url);
    }

    // Fase 2: registrar el descanso compensatorio.
    async function registrarDescanso(payload) {
        const url = window.API_URL + '?action=registrarDescansoSobretiempo&key=' + encodeURIComponent(window.API_KEY) + construirQuery(payload);
        return llamar(url);
    }

    async function eliminar(idSolicitud) {
        const url = window.API_URL + '?action=deleteSobretiempo&key=' + encodeURIComponent(window.API_KEY) + '&idSolicitud=' + encodeURIComponent(idSolicitud);
        return llamar(url);
    }

    return { listar, obtener, crear, actualizar, registrarDescanso, eliminar };
})();

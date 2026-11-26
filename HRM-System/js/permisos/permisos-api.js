// ============================================================
// PERMISOS-API.JS — Comunicación con BD_PERMISOS (backend)
// ============================================================
// Mismo patrón que sobretiempo-api.js: reutiliza window.API_URL /
// window.API_KEY / window.AUTH.request ya expuestos por js/api.js.
// ============================================================

window.PermisosAPI = (function() {

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

    // Lista las boletas, opcionalmente filtradas por CODE de empleado.
    async function listar(code) {
        const url = window.API_URL + '?action=listPermisos' + (code ? '&code=' + encodeURIComponent(code) : '');
        return llamar(url);
    }

    async function obtener(idPermiso) {
        const url = window.API_URL + '?action=getPermiso&idPermiso=' + encodeURIComponent(idPermiso);
        return llamar(url);
    }

    async function crear(payload) {
        const url = window.API_URL + '?action=createPermiso&key=' + encodeURIComponent(window.API_KEY) + construirQuery(payload);
        return llamar(url);
    }

    async function actualizar(idPermiso, payload) {
        const url = window.API_URL + '?action=updatePermiso&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_PERMISO=' + encodeURIComponent(idPermiso) + construirQuery(payload);
        return llamar(url);
    }

    async function eliminar(idPermiso) {
        const url = window.API_URL + '?action=deletePermiso&key=' + encodeURIComponent(window.API_KEY) + '&idPermiso=' + encodeURIComponent(idPermiso);
        return llamar(url);
    }

    return { listar, obtener, crear, actualizar, eliminar };
})();

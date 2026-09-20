// ============================================================
// LICENCIAS-API.JS — Comunicación con BD_LICENCIAS
// ============================================================
window.LicenciasAPI = (function () {
    async function llamar(url) { return window.AUTH.request(url); }
    function query(payload) {
        return Object.entries(payload || {}).filter(([,v]) => v !== undefined && v !== null && v !== '')
            .map(([k,v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('');
    }
    async function listar(code) {
        return llamar(window.API_URL + '?action=listLicencias' + (code ? `&code=${encodeURIComponent(code)}` : ''));
    }
    async function obtener(id) {
        return llamar(window.API_URL + `?action=getLicencia&idLicencia=${encodeURIComponent(id)}`);
    }
    async function crear(payload) {
        return llamar(window.API_URL + '?action=createLicencia&key=' + encodeURIComponent(window.API_KEY) + query(payload));
    }
    return { listar, obtener, crear };
})();

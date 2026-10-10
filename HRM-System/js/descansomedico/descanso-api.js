// ============================================================
// DESCANSO-API.JS — Comunicación con BD_DESCANSOS_MEDICOS
// ============================================================
window.DescansoMedicoAPI = (function () {
    async function llamar(url) { return window.AUTH.request(url); }
    function query(payload) {
        return Object.entries(payload || {}).filter(([,v]) => v !== undefined && v !== null && v !== '')
            .map(([k,v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('');
    }
    async function listar(code) {
        return llamar(window.API_URL + '?action=listDescansosMedicos' + (code ? `&code=${encodeURIComponent(code)}` : ''));
    }
    async function crear(payload) {
        return llamar(window.API_URL + '?action=createDescansoMedico&key=' + encodeURIComponent(window.API_KEY) + query(payload));
    }
    async function eliminar(id) {
        return llamar(window.API_URL + '?action=deleteDescansoMedico&key=' + encodeURIComponent(window.API_KEY) + `&idDescanso=${encodeURIComponent(id)}`);
    }
    async function enviarCorreo(payload) {
        return window.AUTH.requestPost(window.API_URL + '?action=sendDescansoMedicoCorreo&key=' + encodeURIComponent(window.API_KEY), payload);
    }
    return { listar, crear, eliminar, enviarCorreo };
})();

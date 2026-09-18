// ============================================================
// VACACIONES-API.JS — Comunicación con BD_VACACIONES (backend)
// ============================================================
// Mismo patrón que sobretiempo-api.js/permisos-api.js: reutiliza
// window.API_URL / window.API_KEY / window.AUTH.request ya expuestos
// por js/api.js. Corresponde a las acciones createVacacion /
// updateVacacion / deleteVacacion / listVacaciones / getVacacion /
// registrarGoceVacacion / eliminarGoceVacacion agregadas en
// Codigo_corregido.gs (ver Codigo_Vacaciones.gs).
// ============================================================

window.VacacionesAPI = (function() {

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

    // Lista los períodos vacacionales, opcionalmente filtrados por
    // CODE de empleado. Sin "code" trae TODOS los períodos (usado
    // por el reporte general, ver window.exportarTodasVacaciones).
    async function listar(code) {
        const url = window.API_URL + '?action=listVacaciones' + (code ? '&code=' + encodeURIComponent(code) : '');
        return llamar(url);
    }

    async function obtener(idVacacion) {
        const url = window.API_URL + '?action=getVacacion&idVacacion=' + encodeURIComponent(idVacacion);
        return llamar(url);
    }

    // Fase 1: crear el período (asigna días + fecha límite de goce).
    async function crear(payload) {
        const url = window.API_URL + '?action=createVacacion&key=' + encodeURIComponent(window.API_KEY) + construirQuery(payload);
        return llamar(url);
    }

    // Editar los datos de Fase 1 (solo posible mientras el período
    // NO tenga ningún goce registrado: el backend rechaza la edición
    // apenas exista al menos un tramo, aunque sea parcial).
    async function actualizar(idVacacion, payload) {
        const url = window.API_URL + '?action=updateVacacion&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_VACACION=' + encodeURIComponent(idVacacion) + construirQuery(payload);
        return llamar(url);
    }

    // Fase 2: AGREGA un nuevo tramo de goce (no reemplaza los
    // anteriores). Se puede llamar varias veces hasta cubrir el
    // total de días asignados.
    async function registrarGoce(payload) {
        const url = window.API_URL + '?action=registrarGoceVacacion&key=' + encodeURIComponent(window.API_KEY) + construirQuery(payload);
        return llamar(url);
    }

    // Quita un goce ya registrado (por su índice dentro del
    // arreglo). Sus días vuelven a quedar pendientes.
    async function eliminarGoce(idVacacion, indice) {
        const url = window.API_URL + '?action=eliminarGoceVacacion&key=' + encodeURIComponent(window.API_KEY)
            + '&idVacacion=' + encodeURIComponent(idVacacion) + '&indice=' + encodeURIComponent(indice);
        return llamar(url);
    }

    async function eliminar(idVacacion) {
        const url = window.API_URL + '?action=deleteVacacion&key=' + encodeURIComponent(window.API_KEY) + '&idVacacion=' + encodeURIComponent(idVacacion);
        return llamar(url);
    }

    return { listar, obtener, crear, actualizar, registrarGoce, eliminarGoce, eliminar };
})();

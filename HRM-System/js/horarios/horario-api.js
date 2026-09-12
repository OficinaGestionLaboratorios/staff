// ============================================================
// HORARIO-API.JS — Comunicación con BD_HORARIOS (backend)
// ============================================================
// Reutiliza la misma API_URL / API_KEY que ya expone js/api.js en
// window. Cada método corresponde 1:1 a una acción del backend
// (Codigo_corregido.gs, sección HORARIOS) y siempre opera sobre el
// GRUPO completo (nunca sobre una fila suelta), que es la unidad
// lógica real de un horario semanal.
// ============================================================

window.HorarioAPI = (function() {

    // La autenticación (token de sesión) la agrega window.AUTH.request
    // automáticamente a cada URL; aquí solo se arma la acción y, para
    // escrituras, la API_KEY (segunda capa, ver api.js).
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

    // Lista los grupos de horario, opcionalmente filtrados por CODE
    // de empleado. Siempre se lee desde BD_HORARIOS (fuente única de
    // verdad), nunca desde una copia local.
    async function listar(code) {
        const url = window.API_URL + '?action=listHorarios' + (code ? '&code=' + encodeURIComponent(code) : '');
        return llamar(url);
    }

    // Obtiene un solo grupo completo (cabecera + los 7 días) para
    // reconstruir el modal en modo edición.
    async function obtenerGrupo(idGrupo) {
        const url = window.API_URL + '?action=getHorarioGrupo&idGrupo=' + encodeURIComponent(idGrupo);
        return llamar(url);
    }

    // Crea un grupo nuevo (el backend genera el ID_GRUPO).
    async function crear(payload) {
        const url = window.API_URL + '?action=createHorario&key=' + encodeURIComponent(window.API_KEY) + construirQuery(payload);
        return llamar(url);
    }

    // Actualiza un grupo existente (reemplaza todas sus filas).
    async function actualizar(idGrupo, payload) {
        const url = window.API_URL + '?action=updateHorario&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_GRUPO=' + encodeURIComponent(idGrupo) + construirQuery(payload);
        return llamar(url);
    }

    // Elimina un grupo completo (todas sus filas).
    async function eliminar(idGrupo) {
        const url = window.API_URL + '?action=deleteHorario&key=' + encodeURIComponent(window.API_KEY) + '&idGrupo=' + encodeURIComponent(idGrupo);
        return llamar(url);
    }

    return { listar, obtenerGrupo, crear, actualizar, eliminar };
})();

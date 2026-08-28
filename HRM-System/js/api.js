// ============================================================
// API - Google Sheets
// ============================================================
// NOTA DE SEGURIDAD: esta clave debe coincidir EXACTAMENTE con la
// constante API_KEY del backend (Codigo_corregido.gs). Ya NO es la
// única protección: desde esta versión, además hace falta haber
// iniciado sesión (ver js/core/auth.js) para que el backend acepte
// CUALQUIER acción, incluida la lectura. La API_KEY queda como una
// segunda capa sobre las escrituras.
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbyjHYUKCQ20ZeBC1IublSmZiym8qBYcwOTRiGwf7XiLl9kFPtV1hdxNqybwImCFzk1K/exec';
const API_KEY = 'wleong'; // debe ser igual a la del backend
// Se exponen en window para que otros módulos (p. ej. horario-api.js)
// puedan reutilizar la misma URL/clave sin duplicarlas.
window.API_URL = API_URL;
window.API_KEY = API_KEY;
const STORAGE_KEY = 'staffHubData';
const STORAGE_TIMESTAMP_KEY = 'staffHubTimestamp';
const CACHE_DURATION = 5 * 60 * 1000;

let datos = [];

window.API = {
    async list(force = false) {
        if (!force) {
            const cached = localStorage.getItem(STORAGE_KEY);
            const ts = localStorage.getItem(STORAGE_TIMESTAMP_KEY);
            if (cached && ts && (Date.now() - parseInt(ts) < CACHE_DURATION)) {
                try {
                    datos = JSON.parse(cached);
                    return datos;
                } catch (e) {}
            }
        }

        const result = await window.AUTH.request(API_URL + '?action=list');

        if (result.success && result.data) {
            datos = result.data;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
            localStorage.setItem(STORAGE_TIMESTAMP_KEY, String(Date.now()));
            return datos;
        }

        const fallback = localStorage.getItem(STORAGE_KEY);
        if (fallback) {
            try {
                datos = JSON.parse(fallback);
                window.toast('⚠️ Usando caché — ' + (result.message || 'sin conexión'), 'warning');
                return datos;
            } catch (e2) {}
        }
        window.toast('❌ ' + (result.message || 'Error al cargar datos'), 'error');
        return [];
    },

    getDatos() { return datos; },

    setDatos(newData) {
        datos = newData;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
        localStorage.setItem(STORAGE_TIMESTAMP_KEY, String(Date.now()));
    },

    async save(data, isEdit = false, code = '') {
        const action = isEdit ? 'update' : 'create';
        let url = API_URL + '?action=' + action + '&key=' + encodeURIComponent(API_KEY);
        if (isEdit && code) url += '&code=' + encodeURIComponent(code);

        Object.entries(data).forEach(([k, v]) => {
            if (v) url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
        });

        return window.AUTH.request(url);
    },

    async delete(code) {
        const url = API_URL + '?action=delete&key=' + encodeURIComponent(API_KEY) + '&code=' + encodeURIComponent(code);
        return window.AUTH.request(url);
    }
};

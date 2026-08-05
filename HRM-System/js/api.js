// ============================================================
// API - Google Sheets
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbx-KPfY9qBjLiwt_ANER9nom1M4KOR51uI0MZq8JmvDIXVGMozdS7pfRVQp0E4rX0kw/exec';

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

        try {
            // ✅ CORRECCIÓN: Usar POST para listar también (más seguro)
            const resp = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'action=list'
            });
            const texto = await resp.text();
            let result;
            try { result = JSON.parse(texto); } catch (e) { throw new Error('Respuesta no JSON: ' + texto.substring(0, 100)); }

            if (result.success && result.data) {
                datos = result.data;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
                localStorage.setItem(STORAGE_TIMESTAMP_KEY, String(Date.now()));
                return datos;
            } else {
                window.toast('❌ ' + (result.message || 'Error al listar'), 'error');
                return [];
            }
        } catch (e) {
            console.error(e);
            const fallback = localStorage.getItem(STORAGE_KEY);
            if (fallback) {
                try {
                    datos = JSON.parse(fallback);
                    window.toast('⚠️ Usando caché', 'warning');
                    return datos;
                } catch (e2) {}
            }
            window.toast('❌ Error: ' + e.message, 'error');
            return [];
        }
    },

    getDatos() { return datos; },

    setDatos(newData) {
        datos = newData;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
        localStorage.setItem(STORAGE_TIMESTAMP_KEY, String(Date.now()));
    },

    async save(data, isEdit = false, code = '') {
        const action = isEdit ? 'update' : 'create';
        let params = 'action=' + action;
        
        Object.entries(data).forEach(([k, v]) => {
            if (v) params += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
        });
        
        if (isEdit && code) params += '&CODE=' + encodeURIComponent(code);

        try {
            // ✅ CORRECCIÓN: Usar POST para guardar
            const resp = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });
            const texto = await resp.text();
            let result;
            try { result = JSON.parse(texto); } catch (e) { result = { success: texto.includes('success') }; }
            return result;
        } catch (e) {
            window.toast('❌ Error: ' + e.message, 'error');
            return { success: false, message: e.message };
        }
    },

    async delete(code) {
        try {
            // ✅ CORRECCIÓN: Usar POST para eliminar
            const resp = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'action=delete&code=' + encodeURIComponent(code)
            });
            const texto = await resp.text();
            let result;
            try { result = JSON.parse(texto); } catch (e) { result = { success: texto.includes('success') }; }
            return result;
        } catch (e) {
            window.toast('❌ Error: ' + e.message, 'error');
            return { success: false, message: e.message };
        }
    }
};
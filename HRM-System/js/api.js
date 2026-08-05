// ============================================================
// API - Google Sheets
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxX77kHCCdP8fw8ES9pRLawID9rsCwko6yrAdjTw9yPnYamPi_q5kGks-lHbvQ_XaGR/exec';
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
            const resp = await fetch(API_URL + '?action=list');
            const texto = await resp.text();
            let result;
            try { result = JSON.parse(texto); } catch (e) { throw new Error('Respuesta no JSON'); }

            if (result.success && result.data) {
                datos = result.data;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
                localStorage.setItem(STORAGE_TIMESTAMP_KEY, String(Date.now()));
                return datos;
            } else {
                window.toast('❌ ' + (result.message || 'Error'), 'error');
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
        let url = API_URL + '?action=' + action;
        if (isEdit && code) url += '&code=' + encodeURIComponent(code);

        Object.entries(data).forEach(([k, v]) => {
            if (v) url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
        });

        try {
            const resp = await fetch(url);
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
            const resp = await fetch(API_URL + '?action=delete&code=' + encodeURIComponent(code));
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
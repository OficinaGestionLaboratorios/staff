// ============================================================
// API - LECTURA/ESCRITURA DESDE JSON LOCAL
// ============================================================

const STORAGE_KEY = 'staffHubData';
const STORAGE_TIMESTAMP_KEY = 'staffHubTimestamp';
const CACHE_DURATION = 5 * 60 * 1000;

let datos = [];

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.toast('📁 Reemplaza el archivo en data/' + filename, 'info');
}

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
            const resp = await fetch('data/personal.json?' + Date.now());
            if (!resp.ok) {
                throw new Error('No se pudo cargar data/personal.json');
            }
            datos = await resp.json();
            
            if (!Array.isArray(datos)) {
                throw new Error('El archivo personal.json no contiene un array válido');
            }
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
            localStorage.setItem(STORAGE_TIMESTAMP_KEY, String(Date.now()));
            return datos;
        } catch (e) {
            console.error('Error al cargar personal.json:', e);
            const fallback = localStorage.getItem(STORAGE_KEY);
            if (fallback) {
                try {
                    datos = JSON.parse(fallback);
                    window.toast('⚠️ Usando caché local', 'warning');
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
        try {
            const actuales = await this.list(true);
            
            if (isEdit && code) {
                const index = actuales.findIndex(item => item.CODE === code);
                if (index !== -1) {
                    data.CODE = code;
                    actuales[index] = data;
                } else {
                    return { success: false, message: 'Registro no encontrado' };
                }
            } else {
                if (!data.CODE) {
                    data.CODE = 'PER-' + String(Math.floor(Math.random() * 90000) + 10000);
                }
                actuales.push(data);
            }
            
            this.setDatos(actuales);
            downloadJSON(actuales, 'personal.json');
            
            return { 
                success: true, 
                message: isEdit ? '✅ Actualizado' : '✅ Guardado',
                data: data
            };
        } catch (e) {
            window.toast('❌ Error: ' + e.message, 'error');
            return { success: false, message: e.message };
        }
    },

    async delete(code) {
        try {
            const actuales = await this.list(true);
            const index = actuales.findIndex(item => item.CODE === code);
            if (index === -1) {
                return { success: false, message: 'Registro no encontrado' };
            }
            
            actuales.splice(index, 1);
            this.setDatos(actuales);
            downloadJSON(actuales, 'personal.json');
            
            return { success: true, message: '✅ Eliminado' };
        } catch (e) {
            window.toast('❌ Error: ' + e.message, 'error');
            return { success: false, message: e.message };
        }
    }
};
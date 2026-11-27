// ============================================================
// MÓDULO PERSONAL - Lógica principal
// ============================================================

let datosFiltrados = null;
let editMode = false;
let editCode = null;
let currentDetail = null;
let actualizando = false;

// ===== UBICACIONES =====
// Origen: hoja de Google Sheets LISTA_LABORATORIOS _011026, leída por orden:
//   1) el backend Apps Script (action=listUbicaciones, ver Codigo_Ubicaciones.gs)
//   2) la hoja directamente (gviz CSV)
//   3) data/ubicaciones.json (respaldo)
// Hoja:
// (columnas: N°, Programa de Estudio, Acronimo, LABORATORIO O TALLER,
// AMBIENTE, SEDE). Se lee en vivo, así que editar la hoja actualiza
// el selector sin tocar archivos del servidor.
// Respaldo: data/ubicaciones.json (se usa solo si la hoja no responde).
// Requisito: la hoja debe estar compartida como «Cualquier persona con
// el enlace puede ver».
const UBICACIONES_SHEET_ID = '1QfWm7SiMxBba-3Kmzaaj_aTtRZFVIk996vjnok96fRA';
const UBICACIONES_SHEET_TAB = '';          // nombre de la pestaña; vacío = primera pestaña
const UBICACIONES_JSON_RESPALDO = 'data/ubicaciones.json';
const UBICACIONES_TIMEOUT_MS = 6000;

let ubicacionesLaboratorio = [];
let ubicacionesCargando = null;
let ubicacionesDesdeRespaldo = false;
console.info('[ubicaciones] versión con lectura de hoja de Google Sheets cargada');

// --- CSV (soporta comillas, comillas dobles escapadas y saltos de línea) ---
function parsearCSV(texto) {
    const filas = [];
    let fila = [], campo = '', enComillas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (enComillas) {
            if (c === '"') {
                if (texto[i + 1] === '"') { campo += '"'; i++; }
                else enComillas = false;
            } else campo += c;
        } else if (c === '"') enComillas = true;
        else if (c === ',') { fila.push(campo); campo = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && texto[i + 1] === '\n') i++;
            fila.push(campo); filas.push(fila); fila = []; campo = '';
        } else campo += c;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
}

function normalizarEncabezado(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Convierte el CSV de la hoja al formato que usa el modal:
// { codigo, nombre, tipo, ubicacion }. `ubicacion` es la clave única.
function ubicacionesDesdeCSV(texto) {
    return ubicacionesDesdeFilas(parsearCSV(texto));
}

// `filas` es una matriz (filas x columnas) con la hoja completa, encabezado incluido.
function ubicacionesDesdeFilas(filas) {
    if (!Array.isArray(filas)) throw new Error('Datos de la hoja no válidos');
    let h = -1, col = {};
    for (let i = 0; i < Math.min(filas.length, 10); i++) {
        const n = filas[i].map(normalizarEncabezado);
        if (n.includes('AMBIENTE') && n.includes('LABORATORIOOTALLER')) {
            h = i;
            col = {
                n: n.indexOf('N'), programa: n.indexOf('PROGRAMADEESTUDIO'),
                acr: n.indexOf('ACRONIMO'), lab: n.indexOf('LABORATORIOOTALLER'),
                amb: n.indexOf('AMBIENTE')
            };
            break;
        }
    }
    if (h === -1) throw new Error('No se encontraron las columnas AMBIENTE y LABORATORIO O TALLER');

    const limpiar = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    const items = [];
    const porClave = new Map();   // nombre|ambiente -> item (une duplicados exactos)
    const usadas = new Set();     // valores de `ubicacion` ya asignados

    for (let i = h + 1; i < filas.length; i++) {
        const f = filas[i];
        const ambiente = limpiar(f[col.amb]);
        // Las comas se reemplazan porque LUGAR_TRABAJO guarda las ubicaciones separadas por coma.
        const nombre = limpiar(f[col.lab]).replace(/\s*,\s*/g, ' - ');
        if (!ambiente || !nombre) continue;
        const programa = col.programa >= 0 ? limpiar(f[col.programa]) : '';
        const acr = col.acr >= 0 ? limpiar(f[col.acr]) : '';
        const num = col.n >= 0 ? limpiar(f[col.n]) : '';

        const clave = (nombre + '|' + ambiente).toUpperCase();
        if (porClave.has(clave)) {          // mismo laboratorio y ambiente en otro programa
            const previo = porClave.get(clave);
            if (programa && !previo.tipo.split(' / ').includes(programa)) previo.tipo += ' / ' + programa;
            continue;
        }
        // Mismo ambiente con otro laboratorio: se desambigua con el acrónimo.
        let ubic = ambiente;
        if (usadas.has(ubic)) ubic = ambiente + ' · ' + (acr || programa || num);
        let k = 2;
        while (usadas.has(ubic)) ubic = ambiente + ' · ' + (acr || programa) + ' ' + (k++);
        usadas.add(ubic);

        const item = { codigo: (acr + (num ? '-' + num : '')) || ambiente, nombre, tipo: programa, ubicacion: ubic };
        porClave.set(clave, item);
        items.push(item);
    }
    return items;
}
window.ubicacionesDesdeCSV = ubicacionesDesdeCSV;
window.ubicacionesDesdeFilas = ubicacionesDesdeFilas;

// Fuente 1: el propio backend (Apps Script). Funciona aunque la hoja sea privada
// y sin depender de CORS ni de la ruta de archivos del sitio.
async function leerUbicacionesDeServidor() {
    if (!window.AUTH || !window.API_URL) throw new Error('API no disponible');
    const resp = await Promise.race([
        window.AUTH.request(window.API_URL + '?action=listUbicaciones'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo agotado')), 20000))
    ]);
    if (!resp || !resp.success) throw new Error((resp && resp.message) || 'sin respuesta del servidor');
    const items = ubicacionesDesdeFilas(resp.data);
    if (items.length === 0) throw new Error('La hoja no devolvió ambientes');
    return items;
}

// Fuente 2: lectura directa de la hoja (requiere hoja pública y que el navegador la permita).
async function leerUbicacionesDeHoja() {
    let url = `https://docs.google.com/spreadsheets/d/${UBICACIONES_SHEET_ID}/gviz/tq?tqx=out:csv`;
    if (UBICACIONES_SHEET_TAB) url += '&sheet=' + encodeURIComponent(UBICACIONES_SHEET_TAB);
    url += '&_=' + Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), UBICACIONES_TIMEOUT_MS);
    try {
        const resp = await fetch(url, { signal: ctrl.signal });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const items = ubicacionesDesdeCSV(await resp.text());
        if (items.length === 0) throw new Error('La hoja no devolvió ambientes');
        return items;
    } finally { clearTimeout(t); }
}

async function leerUbicacionesDeRespaldo() {
    const resp = await fetch(UBICACIONES_JSON_RESPALDO);
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' en ' + UBICACIONES_JSON_RESPALDO);
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('Respaldo vacío');
    return data;
}

async function cargarUbicaciones() {
    if (ubicacionesLaboratorio.length > 0 && !ubicacionesDesdeRespaldo) return ubicacionesLaboratorio;
    if (ubicacionesCargando) return ubicacionesCargando;

    ubicacionesCargando = (async () => {
        const fuentes = [
            ['Servidor', leerUbicacionesDeServidor, false],
            ['Hoja', leerUbicacionesDeHoja, false],
            ['Respaldo', leerUbicacionesDeRespaldo, true]
        ];
        const errores = [];
        for (const [nombre, leer, esRespaldo] of fuentes) {
            try {
                ubicacionesLaboratorio = await leer();
                ubicacionesDesdeRespaldo = esRespaldo;
                if (esRespaldo) {
                    window.toast('⚠️ No se pudo leer la hoja (' + errores.join(' | ') + '); se usa la lista de respaldo', 'info');
                }
                window.ubicacionesLaboratorio = ubicacionesLaboratorio;
                return ubicacionesLaboratorio;
            } catch (err) {
                console.error('[ubicaciones] Falló la fuente «' + nombre + '»:', err);
                const motivo = (err && err.name === 'AbortError') ? 'tiempo agotado' : (err && err.message) || String(err);
                errores.push(nombre + ': ' + motivo);
            }
        }
        window.toast('❌ No se pudieron cargar las ubicaciones. ' + errores.join(' | '), 'error');
        return [];
    })().finally(() => { ubicacionesCargando = null; });

    return ubicacionesCargando;
}
window.cargarUbicaciones = cargarUbicaciones;

// ¿El texto guardado en LUGAR_TRABAJO («Nombre (AMBIENTE)») corresponde a esta ubicación?
// Se compara por el ambiente entre paréntesis, no por el nombre, porque varios
// laboratorios comparten nombre (p. ej. «Laboratorio Multifuncional»).
window.coincideUbicacion = function(valor, u) {
    const v = String(valor || '').trim();
    return v.endsWith('(' + u.ubicacion + ')') || v === u.ubicacion;
};

let ubicacionesSeleccionadas = [];
let ubicacionesFiltradas = [];

// ===== FUNCIONES DE UBICACIONES =====
window.abrirModalUbicaciones = async function() {
    const modal = document.getElementById('modalUbicaciones');
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Muestra un estado de carga mientras llega la lista de ubicaciones
    // (solo ocurre la primera vez; después queda cacheado en memoria).
    const container = document.getElementById('listaUbicaciones');
    if (container && ubicacionesLaboratorio.length === 0) {
        container.innerHTML = `<div class="empty"><i class="fas fa-spinner fa-spin"></i> Cargando ubicaciones...</div>`;
    }

    await cargarUbicaciones();

    const input = document.getElementById('LUGAR_TRABAJO');
    if (input && input.value) {
        const valores = input.value.split(',').map(s => s.trim()).filter(s => s);
        ubicacionesSeleccionadas = ubicacionesLaboratorio.filter(u =>
            valores.some(v => window.coincideUbicacion(v, u))
        );
    } else {
        ubicacionesSeleccionadas = [];
    }

    const filtro = document.getElementById('filtroUbicaciones');
    if (filtro) filtro.value = '';
    ubicacionesFiltradas = [...ubicacionesLaboratorio];
    window.renderListaUbicaciones();
    window.actualizarContadorUbicaciones();
};

window.cerrarModalUbicaciones = function() {
    const modal = document.getElementById('modalUbicaciones');
    modal.style.display = 'none';
    modal.classList.remove('active');
    document.body.style.overflow = '';
};

window.filtrarUbicaciones = function() {
    const filtro = document.getElementById('filtroUbicaciones');
    const texto = filtro.value.toLowerCase().trim();
    ubicacionesFiltradas = texto ? ubicacionesLaboratorio.filter(u =>
        u.nombre.toLowerCase().includes(texto) ||
        u.ubicacion.toLowerCase().includes(texto) ||
        u.codigo.toLowerCase().includes(texto) ||
        u.tipo.toLowerCase().includes(texto)
    ) : [...ubicacionesLaboratorio];
    window.renderListaUbicaciones();
    window.actualizarContadorUbicaciones();
};

window.renderListaUbicaciones = function() {
    const container = document.getElementById('listaUbicaciones');
    if (!container) return;

    if (ubicacionesFiltradas.length === 0) {
        container.innerHTML = `<div class="empty"><i class="fas fa-search"></i>No se encontraron ubicaciones</div>`;
        return;
    }

    container.innerHTML = ubicacionesFiltradas.map(u => {
        const isChecked = ubicacionesSeleccionadas.some(s => s.ubicacion === u.ubicacion);
        return `<label class="ubicacion-item"><input type="checkbox" class="ubicacion-checkbox" value="${u.ubicacion}" data-codigo="${u.codigo}" data-nombre="${u.nombre}" data-tipo="${u.tipo}" ${isChecked ? 'checked' : ''} onchange="window.toggleUbicacion('${u.ubicacion}')"><div class="info"><span class="nombre">${window.esc(u.nombre)}</span><span class="ubicacion">${window.esc(u.ubicacion)}</span><span class="tipo">${window.esc(u.tipo)}</span><span class="codigo">${window.esc(u.codigo)}</span></div></label>`;
    }).join('');
};

window.toggleUbicacion = function(ubicacion) {
    const idx = ubicacionesSeleccionadas.findIndex(u => u.ubicacion === ubicacion);
    const ubicacionObj = ubicacionesLaboratorio.find(u => u.ubicacion === ubicacion);
    if (idx === -1 && ubicacionObj) {
        ubicacionesSeleccionadas.push(ubicacionObj);
    } else {
        ubicacionesSeleccionadas.splice(idx, 1);
    }
    window.actualizarContadorUbicaciones();
};

window.seleccionarTodasUbicaciones = function() {
    ubicacionesFiltradas.forEach(u => {
        if (!ubicacionesSeleccionadas.some(s => s.ubicacion === u.ubicacion)) {
            ubicacionesSeleccionadas.push(u);
        }
    });
    window.renderListaUbicaciones();
    window.actualizarContadorUbicaciones();
};

window.deseleccionarTodasUbicaciones = function() {
    const filtradasUbicaciones = ubicacionesFiltradas.map(u => u.ubicacion);
    ubicacionesSeleccionadas = ubicacionesSeleccionadas.filter(u => !filtradasUbicaciones.includes(u.ubicacion));
    window.renderListaUbicaciones();
    window.actualizarContadorUbicaciones();
};

window.actualizarContadorUbicaciones = function() {
    const total = document.getElementById('contadorUbicaciones');
    if (total) total.textContent = `${ubicacionesFiltradas.length} ubicaciones disponibles`;
    const seleccionadas = document.getElementById('seleccionadasCount');
    if (seleccionadas) seleccionadas.textContent = `${ubicacionesSeleccionadas.length} seleccionada(s)`;
};

window.confirmarSeleccionUbicaciones = function() {
    const input = document.getElementById('LUGAR_TRABAJO');
    const etiquetas = document.getElementById('etiquetasUbicaciones');

    if (ubicacionesSeleccionadas.length === 0) {
        input.value = '';
        etiquetas.innerHTML = '';
        window.cerrarModalUbicaciones();
        window.toast('🧹 Ubicaciones limpiadas', 'info');
        return;
    }

    const valores = ubicacionesSeleccionadas.map(u => `${u.nombre} (${u.ubicacion})`);
    input.value = valores.join(', ');
    etiquetas.innerHTML = ubicacionesSeleccionadas.map(u =>
        `<span class="etiqueta-ubicacion">${window.esc(u.nombre)} (${window.esc(u.ubicacion)})<button class="btn-remove" onclick="window.eliminarUbicacionSeleccionada('${u.ubicacion}')">&times;</button></span>`
    ).join('');
    window.cerrarModalUbicaciones();
    window.toast(`✅ ${ubicacionesSeleccionadas.length} ubicación(es) seleccionada(s)`, 'success');
};

window.eliminarUbicacionSeleccionada = function(ubicacion) {
    ubicacionesSeleccionadas = ubicacionesSeleccionadas.filter(u => u.ubicacion !== ubicacion);
    const input = document.getElementById('LUGAR_TRABAJO');
    const etiquetas = document.getElementById('etiquetasUbicaciones');

    if (ubicacionesSeleccionadas.length === 0) {
        input.value = '';
        etiquetas.innerHTML = '';
        window.toast('🧹 Ubicación eliminada', 'info');
        return;
    }

    const valores = ubicacionesSeleccionadas.map(u => `${u.nombre} (${u.ubicacion})`);
    input.value = valores.join(', ');
    etiquetas.innerHTML = ubicacionesSeleccionadas.map(u =>
        `<span class="etiqueta-ubicacion">${window.esc(u.nombre)} (${window.esc(u.ubicacion)})<button class="btn-remove" onclick="window.eliminarUbicacionSeleccionada('${u.ubicacion}')">&times;</button></span>`
    ).join('');
};

window.limpiarUbicacionesSeleccionadas = function() {
    ubicacionesSeleccionadas = [];
    const input = document.getElementById('LUGAR_TRABAJO');
    const etiquetas = document.getElementById('etiquetasUbicaciones');
    if (input) input.value = '';
    if (etiquetas) etiquetas.innerHTML = '';
    window.toast('🧹 Ubicaciones limpiadas', 'info');
};

// ===== EXPONER VARIABLES GLOBALES =====
window.ubicacionesLaboratorio = ubicacionesLaboratorio;
window.ubicacionesSeleccionadas = ubicacionesSeleccionadas;
window.ubicacionesFiltradas = ubicacionesFiltradas;
window.datosFiltrados = datosFiltrados;
window.editMode = editMode;
window.editCode = editCode;
window.currentDetail = currentDetail;
// ============================================================
// MÓDULO PERSONAL - Lógica principal
// ============================================================

let datosFiltrados = null;
let editMode = false;
let editCode = null;
let currentDetail = null;
let actualizando = false;

// ===== UBICACIONES =====
// Antes este archivo tenía ~116 objetos hardcodeados aquí mismo
// (más de 100 líneas de datos mezcladas con lógica de la app).
// Ahora se cargan de forma perezosa desde data/ubicaciones.json,
// solo la primera vez que el usuario abre el selector de
// ubicaciones, y se cachean en memoria para no volver a pedirlas.
let ubicacionesLaboratorio = [];
let ubicacionesCargando = null;

async function cargarUbicaciones() {
    if (ubicacionesLaboratorio.length > 0) return ubicacionesLaboratorio;
    if (ubicacionesCargando) return ubicacionesCargando;

    ubicacionesCargando = fetch('data/ubicaciones.json')
        .then(resp => resp.json())
        .then(data => {
            ubicacionesLaboratorio = data;
            window.ubicacionesLaboratorio = ubicacionesLaboratorio;
            return ubicacionesLaboratorio;
        })
        .catch(err => {
            console.error('Error cargando ubicaciones:', err);
            window.toast('❌ No se pudieron cargar las ubicaciones', 'error');
            return [];
        })
        .finally(() => { ubicacionesCargando = null; });

    return ubicacionesCargando;
}
window.cargarUbicaciones = cargarUbicaciones;

let ubicacionesSeleccionadas = [];
let ubicacionesFiltradas = [];

// ===== FUNCIONES DE UBICACIONES =====
window.abrirModalUbicaciones = async function() {
    const modal = document.getElementById('modalUbicaciones');
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Muestra un estado de carga mientras llega data/ubicaciones.json
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
            valores.some(v => v.includes(u.ubicacion) || v.includes(u.nombre))
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
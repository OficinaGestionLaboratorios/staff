// ============================================================
// MÓDULO HORARIOS - VERSIÓN CORREGIDA
// ============================================================

const HORARIOS_API_URL = 'https://script.google.com/macros/s/AKfycbzjPQZQKXjjhE4sxLaknrA1OjehFf6CPIuTc1-4HR_cZOJCauPAHXPc_EaUCU591emRyw/exec';
const HORARIOS_STORAGE_KEY = 'horariosData';
const HORARIOS_STORAGE_TIMESTAMP_KEY = 'horariosTimestamp';
const HORARIOS_CACHE_DURATION = 5 * 60 * 1000;

let horariosData = [];
let horariosCargando = false;

// ===== DIAS =====
const DIAS_SEMANA = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
const DIAS_ABREV = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// ===== EXPOSICIÓN GLOBAL =====
window.Horarios = {};

// ============================================================
// CARGA DE DATOS
// ============================================================
window.Horarios.cargar = async function(force = false) {
    if (horariosCargando && !force) return;
    if (force) horariosCargando = true;

    const indicator = document.getElementById('horariosSyncIndicator');

    if (!force) {
        const cached = localStorage.getItem(HORARIOS_STORAGE_KEY);
        const ts = localStorage.getItem(HORARIOS_STORAGE_TIMESTAMP_KEY);
        if (cached && ts && (Date.now() - parseInt(ts) < HORARIOS_CACHE_DURATION)) {
            try {
                horariosData = JSON.parse(cached);
                window.Horarios.renderTabla();
                window.Horarios.actualizarContadores();
                if (indicator) {
                    indicator.className = 'sync-indicator success';
                    indicator.innerHTML = `<i class="fas fa-check-circle"></i> ${horariosData.length} registros (caché)`;
                }
                return;
            } catch (e) {}
        }
    }

    if (indicator) {
        indicator.className = 'sync-indicator syncing';
        indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
    }

    try {
        const resp = await fetch(HORARIOS_API_URL + '?action=list');
        const texto = await resp.text();
        let result;
        try { result = JSON.parse(texto); } catch (e) { throw new Error('Respuesta no JSON'); }

        if (result.success && result.data) {
            horariosData = result.data.map((item, idx) => ({ 
                ...item, 
                _rowIndex: idx,
                // Asegurar que fechaVigencia se guarda correctamente
                fechaVigencia: item.fechaVigencia || item.fecha_vigencia || ''
            }));
            localStorage.setItem(HORARIOS_STORAGE_KEY, JSON.stringify(horariosData));
            localStorage.setItem(HORARIOS_STORAGE_TIMESTAMP_KEY, String(Date.now()));
            window.Horarios.renderTabla();
            window.Horarios.actualizarContadores();
            if (indicator) {
                indicator.className = 'sync-indicator success';
                indicator.innerHTML = `<i class="fas fa-check-circle"></i> ${horariosData.length} registros`;
            }
            window.toast('✅ Datos de horarios cargados', 'success');
        } else {
            throw new Error(result.message || 'Error al cargar');
        }
    } catch (e) {
        console.error(e);
        const fallback = localStorage.getItem(HORARIOS_STORAGE_KEY);
        if (fallback) {
            try {
                horariosData = JSON.parse(fallback);
                window.Horarios.renderTabla();
                window.Horarios.actualizarContadores();
                if (indicator) {
                    indicator.className = 'sync-indicator error';
                    indicator.innerHTML = '<i class="fas fa-exclamation-circle"></i> Caché (error)';
                }
                window.toast('⚠️ Usando datos en caché: ' + e.message, 'warning');
            } catch (e2) {
                if (indicator) {
                    indicator.className = 'sync-indicator error';
                    indicator.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
                }
                window.toast('❌ Error: ' + e.message, 'error');
            }
        } else {
            if (indicator) {
                indicator.className = 'sync-indicator error';
                indicator.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
            }
            window.toast('❌ Error: ' + e.message, 'error');
        }
    } finally {
        horariosCargando = false;
    }
};

// ============================================================
// RENDERIZADO DE TABLA - CON FECHA DE VIGENCIA Y TOTALES
// ============================================================
window.Horarios.renderTabla = function() {
    const tbody = document.getElementById('tbodyHorarios');
    if (!tbody) return;

    // Agrupar por ID Personal
    const grupos = {};
    horariosData.forEach((h, index) => {
        const key = h.idPersonal;
        if (!grupos[key]) {
            grupos[key] = {
                idPersonal: h.idPersonal,
                nombre: h.nombre || 'Sin nombre',
                fechaVigencia: h.fechaVigencia || '',
                horarios: [],
                _rowIndices: [],
                _totalHoras: 0
            };
        }
        grupos[key].horarios.push(h);
        grupos[key]._rowIndices.push(h._rowIndex !== undefined ? h._rowIndex : index);
        // Usar la fecha de vigencia del primer horario o la más reciente
        if (h.fechaVigencia && (!grupos[key].fechaVigencia || h.fechaVigencia > grupos[key].fechaVigencia)) {
            grupos[key].fechaVigencia = h.fechaVigencia;
        }
    });

    const keys = Object.keys(grupos);
    if (keys.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <i class="fas fa-calendar-plus"></i>
                    <p>No hay horarios programados. <br>Haz clic en <strong>"Nuevo Horario"</strong> para comenzar.</p>
                </div>
            </td></tr>
        `;
        return;
    }

    let html = '';
    keys.forEach((key) => {
        const grupo = grupos[key];
        let totalHoras = 0;

        // Generar HTML de horarios agrupados
        const horariosHtml = grupo.horarios.map(h => {
            const horas = window.Horarios.calcularHorasDia(
                h.horaEntrada,
                h.inicioRefrigerio,
                h.terminoRefrigerio,
                h.horaSalida
            );
            totalHoras += horas;
            const dia = h.diasSemana || '';
            const nombreDia = dia.charAt(0) + dia.slice(1).toLowerCase();
            const horaEntrada = window.Horarios.formatearHora(h.horaEntrada);
            const horaSalida = window.Horarios.formatearHora(h.horaSalida);
            const inicioRef = window.Horarios.formatearHora(h.inicioRefrigerio);
            const finRef = window.Horarios.formatearHora(h.terminoRefrigerio);
            return `
                <div class="dia-item">
                    <span class="dia-nombre">${nombreDia}</span>
                    <span class="hora-entrada">${horaEntrada}</span>
                    <span class="refrigerio">${inicioRef}-${finRef}</span>
                    <span class="hora-salida">${horaSalida}</span>
                    <span class="total-horas">${window.Horarios.formatHoras(horas)}h</span>
                </div>
            `;
        }).join('');

        // Formatear fecha de vigencia correctamente
        let fechaVigenciaFormateada = 'Sin fecha';
        if (grupo.fechaVigencia) {
            try {
                const d = new Date(grupo.fechaVigencia);
                if (!isNaN(d)) {
                    fechaVigenciaFormateada = d.toLocaleDateString('es-ES');
                } else {
                    fechaVigenciaFormateada = grupo.fechaVigencia;
                }
            } catch (e) {
                fechaVigenciaFormateada = grupo.fechaVigencia;
            }
        }

        grupo._totalHoras = totalHoras;

        html += `
            <tr>
                <td><strong>${window.esc(grupo.idPersonal)}</strong></td>
                <td>${window.esc(grupo.nombre)}</td>
                <td><span class="badge badge-cyan" style="font-size:12px;">📅 ${window.esc(fechaVigenciaFormateada)}</span></td>
                <td>
                    <div class="horarios-agrupados">
                        ${horariosHtml}
                    </div>
                </td>
                <td><span class="badge badge-green" style="font-size:13px;padding:4px 14px;">${window.Horarios.formatHoras(totalHoras)}</span></td>
                <td>
                    <button class="action-btn btn-edit" onclick="window.Horarios.editarGrupo('${key}')" title="Editar horarios">✏️</button>
                    <button class="action-btn btn-delete" onclick="window.Horarios.eliminarGrupo('${key}')" title="Eliminar todos">🗑️</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
};

// ============================================================
// CONTADORES
// ============================================================
window.Horarios.actualizarContadores = function() {
    const personalUnico = new Set(horariosData.map(h => h.idPersonal)).size;
    const contadorPersonas = document.getElementById('horariosContadorPersonas');
    const totalRegistros = document.getElementById('horariosTotalRegistros');

    if (contadorPersonas) contadorPersonas.textContent = personalUnico;
    if (totalRegistros) totalRegistros.textContent = horariosData.length;
};

// ============================================================
// CALCULOS DE HORAS - CORREGIDO
// ============================================================
window.Horarios.calcularHorasDia = function(entrada, inicioRef, finRef, salida) {
    if (!entrada || !inicioRef || !finRef || !salida) return 0;

    try {
        const toMinutes = (timeStr) => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':');
            if (parts.length < 2) return 0;
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        };

        const entradaMin = toMinutes(entrada);
        const inicioRefMin = toMinutes(inicioRef);
        const finRefMin = toMinutes(finRef);
        const salidaMin = toMinutes(salida);

        // Validaciones
        if (entradaMin >= salidaMin) return 0;
        if (inicioRefMin >= finRefMin) return 0;
        if (inicioRefMin < entradaMin || finRefMin > salidaMin) return 0;

        // Calcular horas trabajadas = (salida - entrada) - (finRef - inicioRef)
        const totalMinutos = (salidaMin - entradaMin) - (finRefMin - inicioRefMin);
        return parseFloat((totalMinutos / 60).toFixed(2));
    } catch (e) {
        return 0;
    }
};

window.Horarios.formatHoras = function(horas) {
    if (horas === 0 || !horas) return '0:00';
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return `${h}:${String(m).padStart(2, '0')}`;
};

window.Horarios.formatearHora = function(h) {
    if (!h) return '-';
    // Si ya es HH:MM
    if (/^\d{2}:\d{2}$/.test(h)) return h;
    // Si es HH:MM:SS
    if (/^\d{2}:\d{2}:\d{2}$/.test(h)) return h.substring(0, 5);
    // Si es fecha ISO
    if (h.includes('T') || h.includes('Z') || h.includes('+')) {
        try {
            const d = new Date(h);
            if (!isNaN(d)) {
                const horas = String(d.getHours()).padStart(2, '0');
                const minutos = String(d.getMinutes()).padStart(2, '0');
                return `${horas}:${minutos}`;
            }
        } catch (e) {}
    }
    // Intentar extraer HH:MM de cualquier string
    const horaMatch = h.match(/(\d{2}):(\d{2})/);
    if (horaMatch) return `${horaMatch[1]}:${horaMatch[2]}`;
    return h;
};
// ============================================================
// EXPORTAR CSV - CON FECHA DE VIGENCIA Y HORAS
// ============================================================
window.Horarios.exportarCSV = function() {
    if (horariosData.length === 0) {
        window.toast('⚠️ No hay datos para exportar', 'error');
        return;
    }

    try {
        const headers = [
            'ID Personal', 
            'Nombre', 
            'Fecha de Vigencia',  // ← FECHA DE VIGENCIA
            'Día', 
            'Hora Entrada', 
            'Inicio Refrigerio', 
            'Término Refrigerio', 
            'Hora Salida', 
            'Horas Trabajadas',  // ← HORAS PARCIALES
            'Observaciones'
        ];
        let csv = '\uFEFF' + headers.join(',') + '\n';

        horariosData.forEach(h => {
            const horas = window.Horarios.calcularHorasDia(
                h.horaEntrada, 
                h.inicioRefrigerio, 
                h.terminoRefrigerio, 
                h.horaSalida
            );
            const fechaVig = h.fechaVigencia || '';
            const row = [
                h.idPersonal || '',
                h.nombre || '',
                fechaVig,  // ← FECHA DE VIGENCIA
                h.diasSemana || '',
                h.horaEntrada || '',
                h.inicioRefrigerio || '',
                h.terminoRefrigerio || '',
                h.horaSalida || '',
                window.Horarios.formatHoras(horas),  // ← HORAS PARCIALES
                (h.observaciones || '').replace(/,/g, ';')
            ];
            csv += row.join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `horarios_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        window.toast(`📊 ${horariosData.length} horarios exportados`, 'success');
    } catch (e) {
        window.toast('❌ Error: ' + e.message, 'error');
    }
};
// ============================================================
// RENDER VISTA PRINCIPAL - CORREGIDO
// ============================================================
window.Horarios.render = function() {
    const main = document.getElementById('mainContent');
    
    // Limpiar cualquier estado previo
    if (window.Horarios._renderTimeout) {
        clearTimeout(window.Horarios._renderTimeout);
    }

    // HTML inline (sin necesidad de template externo)
    main.innerHTML = `
        <div class="topbar">
            <h1><i class="fas fa-clock" style="color:#3B82F6;"></i> Programación de Horarios</h1>
            <div class="topbar-actions">
                <button class="btn btn-primary" onclick="window.Horarios.abrirModal()">
                    <i class="fas fa-plus"></i> Nuevo Horario
                </button>
                <button class="btn btn-success" onclick="window.Horarios.exportarCSV()">
                    <i class="fas fa-file-csv"></i> Exportar
                </button>
                <button class="btn btn-secondary" onclick="window.Horarios.sincronizar()">
                    <i class="fas fa-sync-alt"></i> Sincronizar
                </button>
                <button class="btn btn-secondary" onclick="window.Horarios.cargarEjemplos()">
                    <i class="fas fa-code"></i> Ejemplos
                </button>
                <button class="btn btn-danger" onclick="window.Horarios.limpiarTodo()">
                    <i class="fas fa-trash"></i> Limpiar
                </button>
                <span class="sync-indicator horarios-sync-indicator" id="horariosSyncIndicator">
                    <i class="fas fa-spinner fa-spin"></i> Cargando...
                </span>
            </div>
        </div>

        <!-- CONTADORES -->
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:10px 16px;background:#fff;border-radius:12px;border:1px solid #E2E8F0;flex-wrap:wrap;">
            <span style="font-size:13px;color:#64748B;font-weight:500;">
                <i class="fas fa-users" style="color:#3B82F6;margin-right:6px;"></i>
                Personas Programadas:
            </span>
            <span class="horarios-contador-personas" id="horariosContadorPersonas" style="font-size:16px;font-weight:700;color:#0F172A;">0</span>
            <span style="font-size:12px;color:#94A3B8;margin-left:4px;">(colaboradores)</span>
            <span style="margin-left:auto;font-size:12px;color:#94A3B8;">
                Total registros: <strong id="horariosTotalRegistros" style="color:#0F172A;font-size:14px;">0</strong>
            </span>
        </div>

        <!-- TABLA -->
        <div class="card">
            <h2><i class="fas fa-list"></i> Lista de Horarios</h2>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th style="min-width:80px;">ID</th>
                            <th style="min-width:120px;">Nombre</th>
                            <th style="min-width:100px;">📅 Fecha Vigencia</th>
                            <th style="min-width:200px;">Horarios</th>
                            <th style="min-width:80px;">⏱️ Total Horas</th>
                            <th style="min-width:100px;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="tbodyHorarios">
                        <tr><td colspan="6">
                            <div class="empty-state">
                                <i class="fas fa-spinner fa-spin"></i>
                                <p>Cargando horarios...</p>
                            </div>
                        </td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Cargar datos después de renderizar
    window.Horarios.cargar();
};
// ============================================================
// EXPOSICIÓN GLOBAL - Asegurar que todo esté disponible
// ============================================================

// Asegurar que window.Horarios existe
if (typeof window.Horarios === 'undefined') {
    window.Horarios = {};
}

// Asegurar que todas las funciones principales estén expuestas
window.Horarios.cargar = window.Horarios.cargar || async function() { /* ... */ };
window.Horarios.render = window.Horarios.render || function() { /* ... */ };
window.Horarios.renderTabla = window.Horarios.renderTabla || function() { /* ... */ };
window.Horarios.actualizarContadores = window.Horarios.actualizarContadores || function() { /* ... */ };
window.Horarios.abrirModal = window.Horarios.abrirModal || function() { /* ... */ };
window.Horarios.cerrarModal = window.Horarios.cerrarModal || function() { /* ... */ };
window.Horarios.guardar = window.Horarios.guardar || function() { /* ... */ };
window.Horarios.editarGrupo = window.Horarios.editarGrupo || function() { /* ... */ };
window.Horarios.eliminarGrupo = window.Horarios.eliminarGrupo || function() { /* ... */ };
window.Horarios.exportarCSV = window.Horarios.exportarCSV || function() { /* ... */ };
window.Horarios.sincronizar = window.Horarios.sincronizar || function() { /* ... */ };
window.Horarios.cargarEjemplos = window.Horarios.cargarEjemplos || function() { /* ... */ };
window.Horarios.limpiarTodo = window.Horarios.limpiarTodo || function() { /* ... */ };

console.log('✅ Módulo Horarios cargado correctamente');

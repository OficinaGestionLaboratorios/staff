// ============================================================
// MÓDULO HORARIOS - Lógica principal
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
            horariosData = result.data.map((item, idx) => ({ ...item, _rowIndex: idx }));
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
// RENDERIZADO DE TABLA
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
                _rowIndices: []
            };
        }
        grupos[key].horarios.push(h);
        grupos[key]._rowIndices.push(h._rowIndex !== undefined ? h._rowIndex : index);
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

        // Formatear fecha de vigencia
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

        html += `
            <tr>
                <td><strong>${window.esc(grupo.idPersonal)}</strong></td>
                <td>${window.esc(grupo.nombre)}</td>
                <td><span class="badge badge-cyan">${window.esc(fechaVigenciaFormateada)}</span></td>
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
// CALCULOS DE HORAS
// ============================================================
window.Horarios.calcularHorasDia = function(entrada, inicioRef, finRef, salida) {
    if (!entrada || !inicioRef || !finRef || !salida) return 0;

    try {
        const toMinutes = (timeStr) => {
            const parts = timeStr.split(':');
            if (parts.length < 2) return 0;
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        };

        const entradaMin = toMinutes(entrada);
        const inicioRefMin = toMinutes(inicioRef);
        const finRefMin = toMinutes(finRef);
        const salidaMin = toMinutes(salida);

        if (entradaMin >= salidaMin) return 0;
        if (inicioRefMin >= finRefMin) return 0;
        if (inicioRefMin < entradaMin || finRefMin > salidaMin) return 0;

        const totalMinutos = (salidaMin - entradaMin) - (finRefMin - inicioRefMin);
        return totalMinutos / 60;
    } catch (e) {
        return 0;
    }
};

window.Horarios.formatHoras = function(horas) {
    if (horas === 0) return '0:00';
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return `${h}:${String(m).padStart(2, '0')}`;
};

window.Horarios.formatearHora = function(h) {
    if (!h) return '-';
    if (/^\d{2}:\d{2}$/.test(h)) return h;
    if (/^\d{2}:\d{2}:\d{2}$/.test(h)) return h.substring(0, 5);
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
    const horaMatch = h.match(/(\d{2}):(\d{2})/);
    if (horaMatch) return `${horaMatch[1]}:${horaMatch[2]}`;
    return h;
};
// ============================================================
// RENDER VISTA PRINCIPAL
// ============================================================
window.Horarios.render = function() {
    const main = document.getElementById('mainContent');

    // Cargar template
    fetch('templates/horarios.html')
        .then(response => {
            if (!response.ok) throw new Error('Template no encontrado');
            return response.text();
        })
        .then(html => {
            main.innerHTML = html;
            // Cargar datos
            window.Horarios.cargar();
        })
        .catch(error => {
            console.error('Error cargando template:', error);
            // Fallback: contenido inline
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
                        <span class="sync-indicator horarios-sync-indicator" id="horariosSyncIndicator">
                            <i class="fas fa-spinner fa-spin"></i> Cargando...
                        </span>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:10px 16px;background:#fff;border-radius:12px;border:1px solid #E2E8F0;">
                    <span style="font-size:13px;color:#64748B;font-weight:500;">
                        <i class="fas fa-users" style="color:#3B82F6;margin-right:6px;"></i>
                        Personas Programadas:
                    </span>
                    <span class="horarios-contador-personas" id="horariosContadorPersonas" style="font-size:14px;font-weight:700;color:#0F172A;">0</span>
                    <span style="margin-left:auto;font-size:12px;color:#94A3B8;">
                        Total registros: <strong id="horariosTotalRegistros" style="color:#0F172A;">0</strong>
                    </span>
                </div>
                <div class="card">
                    <h2><i class="fas fa-list"></i> Lista de Horarios</h2>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr><th>ID</th><th>Nombre</th><th>Fecha de Vigencia</th><th>Horarios</th><th>Total Horas</th><th>Acciones</th></tr>
                            </thead>
                            <tbody id="tbodyHorarios">
                                <tr><td colspan="6"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando horarios...</p></div></td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            window.Horarios.cargar();
        });
};
// ============================================================
// SINCRONIZAR
// ============================================================
window.Horarios.sincronizar = async function() {
    if (horariosCargando) return;
    const indicator = document.getElementById('horariosSyncIndicator');
    if (indicator) {
        indicator.className = 'sync-indicator syncing';
        indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
    }
    try {
        await window.Horarios.cargar(true);
        window.toast('✅ Sincronizado con Google Sheets', 'success');
    } catch (e) {
        window.toast('❌ Error: ' + e.message, 'error');
    }
};

// ============================================================
// EXPORTAR CSV
// ============================================================
window.Horarios.exportarCSV = function() {
    if (horariosData.length === 0) {
        window.toast('⚠️ No hay datos para exportar', 'error');
        return;
    }

    try {
        const headers = ['ID Personal', 'Nombre', 'Fecha de Vigencia', 'Día', 'Hora Entrada', 'Inicio Refrigerio', 'Término Refrigerio', 'Hora Salida', 'Horas Trabajadas', 'Observaciones'];
        let csv = '\uFEFF' + headers.join(',') + '\n';

        horariosData.forEach(h => {
            const horas = window.Horarios.calcularHorasDia(h.horaEntrada, h.inicioRefrigerio, h.terminoRefrigerio, h.horaSalida);
            const fechaVig = h.fechaVigencia || '';
            const row = [
                h.idPersonal || '',
                h.nombre || '',
                fechaVig,
                h.diasSemana || '',
                h.horaEntrada || '',
                h.inicioRefrigerio || '',
                h.terminoRefrigerio || '',
                h.horaSalida || '',
                window.Horarios.formatHoras(horas),
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
// CARGAR EJEMPLOS
// ============================================================
window.Horarios.cargarEjemplos = async function() {
    const hoy = new Date().toISOString().split('T')[0];
    const ejemplos = [
        { idPersonal: '2024001', nombre: 'Juan Carlos García', fechaVigencia: hoy, diasSemana: 'LUNES', horaEntrada: '07:00', inicioRefrigerio: '12:00', terminoRefrigerio: '13:00', horaSalida: '15:00', observaciones: 'Laboratorio de Computación' },
        { idPersonal: '2024001', nombre: 'Juan Carlos García', fechaVigencia: hoy, diasSemana: 'MARTES', horaEntrada: '07:00', inicioRefrigerio: '12:00', terminoRefrigerio: '13:00', horaSalida: '15:00', observaciones: 'Laboratorio de Computación' },
        { idPersonal: '2024001', nombre: 'Juan Carlos García', fechaVigencia: hoy, diasSemana: 'MIÉRCOLES', horaEntrada: '07:00', inicioRefrigerio: '12:00', terminoRefrigerio: '13:00', horaSalida: '15:00', observaciones: 'Laboratorio de Computación' },
        { idPersonal: '2024002', nombre: 'María Elena Torres', fechaVigencia: hoy, diasSemana: 'LUNES', horaEntrada: '08:00', inicioRefrigerio: '12:30', terminoRefrigerio: '13:30', horaSalida: '16:00', observaciones: 'Laboratorio de Enfermería' },
        { idPersonal: '2024002', nombre: 'María Elena Torres', fechaVigencia: hoy, diasSemana: 'MARTES', horaEntrada: '08:00', inicioRefrigerio: '12:30', terminoRefrigerio: '13:30', horaSalida: '16:00', observaciones: 'Laboratorio de Enfermería' },
        { idPersonal: '2024003', nombre: 'Carlos Alberto Rivas', fechaVigencia: hoy, diasSemana: 'SÁBADO', horaEntrada: '19:00', inicioRefrigerio: '22:00', terminoRefrigerio: '22:30', horaSalida: '23:00', observaciones: 'Seguridad y monitoreo' },
        { idPersonal: '2024003', nombre: 'Carlos Alberto Rivas', fechaVigencia: hoy, diasSemana: 'DOMINGO', horaEntrada: '19:00', inicioRefrigerio: '22:00', terminoRefrigerio: '22:30', horaSalida: '23:00', observaciones: 'Seguridad y monitoreo' },
    ];

    for (const ej of ejemplos) {
        await window.Horarios.guardarEnSheet(ej);
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    await window.Horarios.cargar(true);
    window.Horarios.renderTabla();
    window.Horarios.actualizarContadores();
    window.toast(`📋 ${ejemplos.length} ejemplos cargados`, 'success');
};

// ============================================================
// LIMPIAR TODO
// ============================================================
window.Horarios.limpiarTodo = async function() {
    if (horariosData.length === 0) {
        window.toast('⚠️ No hay horarios para limpiar', 'warning');
        return;
    }

    if (confirm('⚠️ ¿Eliminar TODOS los horarios de Google Sheets?')) {
        for (const h of horariosData) {
            if (h._rowIndex !== undefined && h._rowIndex >= 0) {
                await window.Horarios.eliminarEnSheet(h._rowIndex);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        await window.Horarios.cargar(true);
        window.Horarios.renderTabla();
        window.Horarios.actualizarContadores();
        window.toast('🧹 Todos los horarios eliminados', 'info');
    }
};
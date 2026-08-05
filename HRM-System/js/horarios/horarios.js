// ============================================================
// MÓDULO HORARIOS - VERSIÓN FINAL CORREGIDA
// ============================================================

console.log('🔄 Cargando módulo Horarios...');

const HORARIOS_API_URL = 'https://script.google.com/macros/s/AKfycbz6jKnp9NIhicMw0qx8k7VaiQEt8RkazvZ5sOYK0SjaLhGebcU-nBa0HBQ8gCGu3TN5Vw/exec';
const HORARIOS_STORAGE_KEY = 'horariosData';
const HORARIOS_STORAGE_TIMESTAMP_KEY = 'horariosTimestamp';
const HORARIOS_CACHE_DURATION = 5 * 60 * 1000;

let horariosData = [];
let horariosCargando = false;

const DIAS_SEMANA = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
const DIAS_ABREV = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

window.Horarios = {};

// ============================================================
// CÁLCULO DE HORAS
// ============================================================
window.Horarios.calcularHorasDia = function(entrada, inicioRef, finRef, salida) {
    if (!entrada || !inicioRef || !finRef || !salida) return 0;

    try {
        const toMinutes = (timeStr) => {
            if (!timeStr) return 0;
            const str = timeStr.toString().trim();
            const parts = str.split(':');
            if (parts.length >= 2) {
                return parseInt(parts[0]) * 60 + parseInt(parts[1]);
            }
            return 0;
        };

        const entradaMin = toMinutes(entrada);
        const inicioRefMin = toMinutes(inicioRef);
        const finRefMin = toMinutes(finRef);
        const salidaMin = toMinutes(salida);

        if (entradaMin >= salidaMin) return 0;
        if (inicioRefMin >= finRefMin) return 0;
        if (inicioRefMin < entradaMin || finRefMin > salidaMin) return 0;

        const totalMinutos = (salidaMin - entradaMin) - (finRefMin - inicioRefMin);
        if (totalMinutos <= 0) return 0;
        
        return parseFloat((totalMinutos / 60).toFixed(2));
    } catch (e) {
        console.warn('Error calculando horas:', e);
        return 0;
    }
};

window.Horarios.formatHoras = function(horas) {
    if (horas === 0 || !horas || isNaN(horas)) return '0:00';
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return `${h}:${String(m).padStart(2, '0')}`;
};

window.Horarios.formatearHora = function(h) {
    if (!h) return '-';
    const str = h.toString().trim();
    if (/^\d{1,2}:\d{2}$/.test(str)) return str.padStart(5, '0');
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(str)) return str.substring(0, 5);
    const horaMatch = str.match(/(\d{1,2}):(\d{2})/);
    if (horaMatch) return `${horaMatch[1].padStart(2, '0')}:${horaMatch[2]}`;
    return str;
};

// ============================================================
// RENDER VISTA PRINCIPAL
// ============================================================
window.Horarios.render = function() {
    console.log('📋 Renderizando vista de Horarios...');
    const main = document.getElementById('mainContent');
    if (!main) {
        console.error('❌ No se encontró #mainContent');
        return;
    }

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

        <div class="card">
            <h2><i class="fas fa-list"></i> Lista de Horarios</h2>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th style="min-width:80px;">ID</th>
                            <th style="min-width:120px;">Nombre</th>
                            <th style="min-width:120px;">📅 Fecha Vigencia</th>
                            <th style="min-width:250px;">Horarios</th>
                            <th style="min-width:90px;">⏱️ Total Horas</th>
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

    window.Horarios.cargar();
};

// ============================================================
// CARGA DE DATOS
// ============================================================
window.Horarios.cargar = async function(force = false) {
    console.log('📥 Cargando datos de horarios...');
    if (horariosCargando && !force) return;
    if (force) horariosCargando = true;

    const indicator = document.getElementById('horariosSyncIndicator');

    if (!force) {
        const cached = localStorage.getItem(HORARIOS_STORAGE_KEY);
        const ts = localStorage.getItem(HORARIOS_STORAGE_TIMESTAMP_KEY);
        if (cached && ts && (Date.now() - parseInt(ts) < HORARIOS_CACHE_DURATION)) {
            try {
                horariosData = JSON.parse(cached);
                console.log('📦 Datos desde caché:', horariosData.length);
                window.Horarios.renderTabla();
                window.Horarios.actualizarContadores();
                if (indicator) {
                    indicator.className = 'sync-indicator success';
                    indicator.innerHTML = `<i class="fas fa-check-circle"></i> ${horariosData.length} (caché)`;
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
        console.log('📥 Respuesta:', texto.substring(0, 200));
        
        let result;
        try { 
            result = JSON.parse(texto); 
        } catch (e) { 
            throw new Error('Respuesta no JSON');
        }

        if (result.success && result.data) {
            horariosData = result.data.map((item, idx) => ({
                ...item,
                _rowIndex: idx,
                idPersonal: item.idPersonal || item.ID_PERSONAL || '',
                nombre: item.nombre || item.NOMBRE || 'Sin nombre',
                fechaVigencia: item.fechaVigencia || item.FECHA_VIGENCIA || '',
                diasSemana: item.diasSemana || item.DIAS_SEMANA || '',
                horaEntrada: item.horaEntrada || item.HORA_ENTRADA || '',
                inicioRefrigerio: item.inicioRefrigerio || item.INICIO_REFRIGERIO || '',
                terminoRefrigerio: item.terminoRefrigerio || item.TERMINO_REFRIGERIO || '',
                horaSalida: item.horaSalida || item.HORA_SALIDA || '',
                observaciones: item.observaciones || item.OBSERVACIONES || ''
            }));
            console.log('✅ Datos cargados:', horariosData.length);
            
            localStorage.setItem(HORARIOS_STORAGE_KEY, JSON.stringify(horariosData));
            localStorage.setItem(HORARIOS_STORAGE_TIMESTAMP_KEY, String(Date.now()));
            window.Horarios.renderTabla();
            window.Horarios.actualizarContadores();
            
            if (indicator) {
                indicator.className = 'sync-indicator success';
                indicator.innerHTML = `<i class="fas fa-check-circle"></i> ${horariosData.length}`;
            }
            window.toast('✅ Datos cargados', 'success');
        } else {
            throw new Error(result.message || 'Error al cargar');
        }
    } catch (e) {
        console.error('❌ Error:', e);
        const fallback = localStorage.getItem(HORARIOS_STORAGE_KEY);
        if (fallback) {
            try {
                horariosData = JSON.parse(fallback);
                window.Horarios.renderTabla();
                window.Horarios.actualizarContadores();
                if (indicator) {
                    indicator.className = 'sync-indicator error';
                    indicator.innerHTML = '<i class="fas fa-exclamation-circle"></i> Caché';
                }
                window.toast('⚠️ Usando caché', 'warning');
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

    if (!horariosData || horariosData.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <i class="fas fa-calendar-plus"></i>
                    <p>No hay horarios programados.</p>
                    <p style="font-size:13px;color:#94A3B8;">Haz clic en <strong>"Nuevo Horario"</strong></p>
                </div>
            </td></tr>
        `;
        return;
    }

    const grupos = {};
    horariosData.forEach((h) => {
        const key = h.idPersonal;
        if (!grupos[key]) {
            grupos[key] = {
                idPersonal: h.idPersonal,
                nombre: h.nombre || 'Sin nombre',
                fechaVigencia: h.fechaVigencia || '',
                horarios: [],
                _totalHoras: 0
            };
        }
        grupos[key].horarios.push(h);
        if (h.fechaVigencia && (!grupos[key].fechaVigencia || h.fechaVigencia > grupos[key].fechaVigencia)) {
            grupos[key].fechaVigencia = h.fechaVigencia;
        }
    });

    let html = '';
    Object.keys(grupos).forEach((key) => {
        const grupo = grupos[key];
        let totalHoras = 0;

        const horariosHtml = grupo.horarios.map(h => {
            const horas = window.Horarios.calcularHorasDia(
                h.horaEntrada, h.inicioRefrigerio, h.terminoRefrigerio, h.horaSalida
            );
            totalHoras += horas;
            
            const dia = h.diasSemana || '';
            const nombreDia = dia.charAt(0) + dia.slice(1).toLowerCase();
            const horaEntrada = window.Horarios.formatearHora(h.horaEntrada);
            const horaSalida = window.Horarios.formatearHora(h.horaSalida);
            const inicioRef = window.Horarios.formatearHora(h.inicioRefrigerio);
            const finRef = window.Horarios.formatearHora(h.terminoRefrigerio);
            const horasFormateadas = window.Horarios.formatHoras(horas);
            
            return `
                <div class="dia-item">
                    <span class="dia-nombre">${nombreDia}</span>
                    <span class="hora-entrada">${horaEntrada}</span>
                    <span class="refrigerio">${inicioRef}-${finRef}</span>
                    <span class="hora-salida">${horaSalida}</span>
                    <span class="total-horas" style="font-weight:700;color:#10B981;">${horasFormateadas}h</span>
                </div>
            `;
        }).join('');

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

        const totalHorasFormateadas = window.Horarios.formatHoras(totalHoras);

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
                <td><span class="badge badge-green" style="font-size:14px;padding:4px 14px;font-weight:700;">${totalHorasFormateadas}</span></td>
                <td>
                    <button class="action-btn btn-edit" onclick="window.Horarios.editarGrupo('${key}')" title="Editar">✏️</button>
                    <button class="action-btn btn-delete" onclick="window.Horarios.eliminarGrupo('${key}')" title="Eliminar">🗑️</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    console.log('✅ Tabla renderizada:', Object.keys(grupos).length, 'grupos');
};

// ============================================================
// CONTADORES
// ============================================================
window.Horarios.actualizarContadores = function() {
    const personalUnico = new Set(horariosData.map(h => h.idPersonal)).size;
    const cp = document.getElementById('horariosContadorPersonas');
    const tr = document.getElementById('horariosTotalRegistros');
    if (cp) cp.textContent = personalUnico;
    if (tr) tr.textContent = horariosData.length;
};

// ============================================================
// GUARDAR EN SHEET (POST)
// ============================================================
window.Horarios.guardarEnSheet = async function(horarioData) {
    try {
        const formData = new FormData();
        const params = {
            action: 'create',
            idPersonal: horarioData.idPersonal || '',
            nombre: horarioData.nombre || '',
            fechaVigencia: horarioData.fechaVigencia || '',
            diasSemana: horarioData.diasSemana || '',
            horaEntrada: horarioData.horaEntrada || '',
            inicioRefrigerio: horarioData.inicioRefrigerio || '',
            terminoRefrigerio: horarioData.terminoRefrigerio || '',
            horaSalida: horarioData.horaSalida || '',
            observaciones: horarioData.observaciones || ''
        };

        let url = HORARIOS_API_URL + '?action=create';
        Object.entries(params).forEach(([k, v]) => {
            if (v) url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
        });

        console.log('📤 Guardando:', params);
        const resp = await fetch(url, { method: 'POST' });
        const texto = await resp.text();
        console.log('📥 Respuesta:', texto);
        
        let result;
        try { 
            result = JSON.parse(texto); 
        } catch (e) { 
            result = { success: texto.includes('success') || texto.includes('exito') }; 
        }
        return result.success;
    } catch (e) {
        console.error('❌ Error:', e);
        return false;
    }
};

// ============================================================
// ELIMINAR EN SHEET
// ============================================================
window.Horarios.eliminarEnSheet = async function(rowIndex) {
    try {
        const filaEnHoja = rowIndex + 2;
        const url = HORARIOS_API_URL + '?action=delete&code=' + filaEnHoja;
        console.log('🗑️ Eliminando fila:', filaEnHoja);
        const resp = await fetch(url, { method: 'POST' });
        const texto = await resp.text();
        console.log('📥 Respuesta:', texto);
        let result;
        try { 
            result = JSON.parse(texto); 
        } catch (e) { 
            result = { success: texto.includes('success') }; 
        }
        return result.success;
    } catch (e) {
        console.error('❌ Error eliminando:', e);
        return false;
    }
};

// ============================================================
// EDITAR Y ELIMINAR GRUPOS
// ============================================================
window.Horarios.editarGrupo = function(idPersonal) {
    console.log('✏️ Editando:', idPersonal);
    const horariosDelEmpleado = horariosData.filter(h => h.idPersonal === idPersonal);
    if (horariosDelEmpleado.length === 0) {
        window.toast('⚠️ No se encontraron horarios', 'error');
        return;
    }
    const primerIndex = horariosData.findIndex(h => h.idPersonal === idPersonal);
    window.Horarios.abrirModal(horariosData[primerIndex], primerIndex);
};

window.Horarios.eliminarGrupo = async function(idPersonal) {
    console.log('🗑️ Eliminando:', idPersonal);
    const horariosDelEmpleado = horariosData.filter(h => h.idPersonal === idPersonal);
    if (horariosDelEmpleado.length === 0) {
        window.toast('⚠️ No se encontraron horarios', 'error');
        return;
    }
    const nombre = horariosDelEmpleado[0].nombre || 'empleado';

    if (confirm(`⚠️ ¿Eliminar TODOS los horarios de "${nombre}"?`)) {
        let todosExitosos = true;
        for (const h of horariosDelEmpleado) {
            if (h._rowIndex !== undefined && h._rowIndex >= 0) {
                const exito = await window.Horarios.eliminarEnSheet(h._rowIndex);
                if (!exito) todosExitosos = false;
                await new Promise(r => setTimeout(r, 200));
            }
        }
        if (todosExitosos) {
            window.toast(`🗑️ Horarios de "${nombre}" eliminados`, 'info');
            await window.Horarios.cargar(true);
        } else {
            window.toast('❌ Error al eliminar', 'error');
        }
    }
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
        window.toast('✅ Sincronizado', 'success');
    } catch (e) {
        window.toast('❌ Error: ' + e.message, 'error');
    }
};

// ============================================================
// EXPORTAR CSV
// ============================================================
window.Horarios.exportarCSV = function() {
    if (horariosData.length === 0) {
        window.toast('⚠️ No hay datos', 'error');
        return;
    }

    try {
        const headers = ['ID Personal', 'Nombre', 'Fecha Vigencia', 'Día', 'Entrada', 'Inicio Ref', 'Fin Ref', 'Salida', 'Horas', 'Observaciones'];
        let csv = '\uFEFF' + headers.join(',') + '\n';

        horariosData.forEach(h => {
            const horas = window.Horarios.calcularHorasDia(h.horaEntrada, h.inicioRefrigerio, h.terminoRefrigerio, h.horaSalida);
            const row = [
                h.idPersonal || '', h.nombre || '', h.fechaVigencia || '',
                h.diasSemana || '', h.horaEntrada || '', h.inicioRefrigerio || '',
                h.terminoRefrigerio || '', h.horaSalida || '',
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
        window.toast(`📊 ${horariosData.length} exportados`, 'success');
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
        { idPersonal: '2024001', nombre: 'Juan Carlos García', fechaVigencia: hoy, diasSemana: 'LUNES', horaEntrada: '07:00', inicioRefrigerio: '12:00', terminoRefrigerio: '13:00', horaSalida: '15:00', observaciones: 'Computación' },
        { idPersonal: '2024001', nombre: 'Juan Carlos García', fechaVigencia: hoy, diasSemana: 'MARTES', horaEntrada: '07:00', inicioRefrigerio: '12:00', terminoRefrigerio: '13:00', horaSalida: '15:00', observaciones: 'Computación' },
        { idPersonal: '2024002', nombre: 'María Elena Torres', fechaVigencia: hoy, diasSemana: 'LUNES', horaEntrada: '08:00', inicioRefrigerio: '12:30', terminoRefrigerio: '13:30', horaSalida: '16:00', observaciones: 'Enfermería' },
        { idPersonal: '2024002', nombre: 'María Elena Torres', fechaVigencia: hoy, diasSemana: 'MARTES', horaEntrada: '08:00', inicioRefrigerio: '12:30', terminoRefrigerio: '13:30', horaSalida: '16:00', observaciones: 'Enfermería' },
    ];

    for (const ej of ejemplos) {
        await window.Horarios.guardarEnSheet(ej);
        await new Promise(r => setTimeout(r, 300));
    }

    await window.Horarios.cargar(true);
    window.toast(`📋 ${ejemplos.length} ejemplos cargados`, 'success');
};

// ============================================================
// LIMPIAR TODO
// ============================================================
window.Horarios.limpiarTodo = async function() {
    if (horariosData.length === 0) {
        window.toast('⚠️ No hay horarios', 'warning');
        return;
    }

    if (confirm('⚠️ ¿Eliminar TODOS los horarios?')) {
        for (const h of horariosData) {
            if (h._rowIndex !== undefined && h._rowIndex >= 0) {
                await window.Horarios.eliminarEnSheet(h._rowIndex);
                await new Promise(r => setTimeout(r, 200));
            }
        }
        await window.Horarios.cargar(true);
        window.toast('🧹 Todos eliminados', 'info');
    }
};

console.log('✅ Módulo Horarios cargado');
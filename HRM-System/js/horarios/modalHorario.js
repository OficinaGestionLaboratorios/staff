// ============================================================
// HORARIOS - MODAL SIMPLIFICADO Y FUNCIONAL
// ============================================================

console.log('🔄 Cargando Modal de Horarios...');

let horariosPorDia = {};
let personalSeleccionadoData = null;

// ============================================================
// INICIALIZAR
// ============================================================
function inicializarHorariosPorDia() {
    DIAS_SEMANA.forEach(dia => {
        horariosPorDia[dia] = {
            activo: false,
            entrada: '',
            salida: '',
            inicioRefrigerio: '',
            terminoRefrigerio: '',
            observaciones: '',
            _horasCalculadas: 0
        };
    });
}

// ============================================================
// ABRIR MODAL - VERSIÓN SIMPLIFICADA
// ============================================================
window.Horarios.abrirModal = function(data = null, index = -1) {
    console.log('📂 Abriendo modal de Horarios...');
    
    // Si el modal ya existe, eliminarlo para recrearlo limpio
    const modalExistente = document.getElementById('modalHorario');
    if (modalExistente) {
        modalExistente.remove();
    }

    // Crear el modal
    const modalHTML = `
    <div id="modalHorario" class="modal">
        <div class="modal-content" style="max-width:1000px;width:95%;max-height:95vh;overflow-y:auto;">
            <div class="modal-header" style="padding:18px 28px;border-bottom:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;position:sticky;top:0;background:#fff;z-index:10;">
                <div>
                    <h2 id="modalTitle" style="font-size:20px;font-weight:700;margin:0;display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-plus-circle" style="color:#3B82F6;"></i> Nuevo Horario
                    </h2>
                    <p style="font-size:13px;color:#64748B;margin:2px 0 0 0;">Asigna horarios por día con cálculo automático de horas</p>
                </div>
                <button class="modal-close" onclick="window.Horarios.cerrarModal()" style="background:none;border:none;font-size:28px;cursor:pointer;color:#94A3B8;padding:0 8px;">&times;</button>
            </div>

            <form id="formHorario" onsubmit="window.Horarios.guardar(event)" style="padding:0;">
                <input type="hidden" id="editIndex" value="${index}">
                <input type="hidden" id="idPersonalHidden" value="">

                <div style="padding:24px 28px 10px 28px;">

                    <!-- SELECCIÓN DE PERSONAL - SIMPLIFICADA -->
                    <div style="margin-bottom:20px;padding:16px 18px;background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                            <i class="fas fa-user-tie" style="color:#3B82F6;font-size:16px;"></i>
                            <span style="font-weight:600;font-size:14px;color:#1E293B;">Seleccionar Personal</span>
                            <span style="color:#EF4444;margin-left:4px;">*</span>
                        </div>

                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <div style="flex:1;min-width:200px;position:relative;">
                                <input type="text" id="buscarPersonalHorario" 
                                       placeholder="🔍 Buscar por ID, nombre o apellido..." 
                                       style="width:100%;padding:10px 12px 10px 38px;border:1px solid #E2E8F0;border-radius:10px;font-size:14px;background:#fff;">
                                <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94A3B8;font-size:14px;"></i>
                            </div>
                            <button type="button" class="btn btn-secondary" onclick="window.Horarios.limpiarSeleccionPersonal()" style="padding:8px 14px;font-size:13px;">
                                <i class="fas fa-times"></i> Limpiar
                            </button>
                            <button type="button" class="btn btn-outline" onclick="window.Horarios.abrirListaCompleta()" style="padding:8px 14px;font-size:13px;">
                                <i class="fas fa-list"></i> Ver todos
                            </button>
                        </div>

                        <div id="resultadosPersonal" style="display:none;margin-top:4px;background:#fff;border:1px solid #E2E8F0;border-radius:10px;max-height:220px;overflow-y:auto;box-shadow:0 8px 25px rgba(0,0,0,0.12);"></div>

                        <div id="personalSeleccionado" style="display:none;margin-top:12px;padding:12px 16px;background:#EFF6FF;border-radius:10px;border:1px solid #3B82F6;">
                            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                                <div>
                                    <strong id="personalSeleccionadoNombre" style="font-size:15px;color:#0F172A;"></strong>
                                    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:2px;">
                                        <span style="font-size:12px;color:#64748B;">ID: <span id="personalSeleccionadoID" style="font-weight:600;"></span></span>
                                        <span style="font-size:12px;color:#64748B;"><span id="personalSeleccionadoCargo"></span></span>
                                    </div>
                                </div>
                                <span class="badge badge-green" style="font-size:12px;padding:3px 14px;">✓ Seleccionado</span>
                            </div>
                            <div id="horariosExistentesPersonal" style="margin-top:10px;padding-top:10px;border-top:1px solid #CBD5E1;">
                                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                                    <i class="fas fa-clock" style="color:#3B82F6;font-size:13px;"></i>
                                    <small style="color:#64748B;font-weight:600;">Horarios asignados:</small>
                                    <span id="contadorHorariosExistentes" class="badge badge-blue" style="font-size:10px;padding:1px 8px;">0</span>
                                </div>
                                <div id="listaHorariosExistentes" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
                            </div>
                        </div>

                        <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:8px;">
                            <div>
                                <label style="font-size:11px;color:#64748B;font-weight:600;">ID Personal</label>
                                <input type="text" id="idPersonalDisplay" readonly style="width:100%;padding:6px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;background:#f8fafc;font-weight:500;">
                            </div>
                            <div>
                                <label style="font-size:11px;color:#64748B;font-weight:600;">Nombre Completo</label>
                                <input type="text" id="nombrePersonalDisplay" readonly style="width:100%;padding:6px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;background:#f8fafc;font-weight:500;">
                            </div>
                        </div>
                    </div>

                    <!-- FECHA DE VIGENCIA -->
                    <div style="margin-bottom:16px;padding:14px 18px;background:#F8FAFC;border-radius:10px;border:1px solid #E2E8F0;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                            <i class="fas fa-calendar-check" style="color:#3B82F6;font-size:16px;"></i>
                            <span style="font-weight:600;font-size:14px;color:#1E293B;">Fecha de Vigencia</span>
                            <span style="color:#EF4444;">*</span>
                        </div>
                        <div style="max-width:280px;">
                            <input type="date" id="fechaVigencia" style="width:100%;padding:9px 12px;border:1px solid #E2E8F0;border-radius:8px;font-size:14px;background:#fff;">
                            <small style="color:#94A3B8;font-size:11px;display:block;margin-top:4px;">Fecha desde la cual el horario entra en vigencia</small>
                        </div>
                    </div>

                    <!-- TABLA DE HORARIOS -->
                    <div style="margin-bottom:12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <i class="fas fa-calendar-week" style="color:#3B82F6;font-size:16px;"></i>
                                <span style="font-weight:600;font-size:14px;color:#1E293B;">Horario Semanal</span>
                                <span style="color:#EF4444;">*</span>
                                <span id="diasSeleccionadosCount" style="font-size:12px;color:#94A3B8;">(0 días)</span>
                            </div>
                            <div class="acciones-rapidas-horario">
                                <button type="button" class="btn-mini" onclick="window.Horarios.seleccionarTodosLosDias()">✓ Todos</button>
                                <button type="button" class="btn-mini" onclick="window.Horarios.deseleccionarTodosLosDias()">✕ Ninguno</button>
                                <button type="button" class="btn-mini primary" onclick="window.Horarios.aplicarHorarioATodosLosDias()"><i class="fas fa-copy"></i> Copiar a todos</button>
                                <button type="button" class="btn-mini success" onclick="window.Horarios.aplicarHorarioLaboralEstandar()"><i class="fas fa-clock"></i> Estándar</button>
                            </div>
                        </div>

                        <div class="horario-tabla-container">
                            <table class="horario-tabla">
                                <thead>
                                    <tr>
                                        <th>Día</th>
                                        <th>Activo</th>
                                        <th>Ingreso</th>
                                        <th>Inicio Ref.</th>
                                        <th>Fin Ref.</th>
                                        <th>Salida</th>
                                        <th>Total</th>
                                        <th>Observación</th>
                                    </tr>
                                </thead>
                                <tbody id="horarioTablaBody"></tbody>
                            </table>
                        </div>

                        <div class="resumen-horas">
                            <span class="item"><span class="label">Total horas semanales:</span> <span class="value total" id="totalHorasSemanales">0:00</span></span>
                            <span class="item"><span class="label">Días activos:</span> <span class="value" id="totalDiasActivos">0</span></span>
                        </div>

                        <div style="margin-top:12px;padding:12px 16px;background:#F1F5F9;border-radius:8px;border:1px solid #E2E8F0;">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                                <i class="fas fa-eye" style="color:#3B82F6;font-size:14px;"></i>
                                <span style="font-weight:600;font-size:13px;color:#1E293B;">Vista previa</span>
                            </div>
                            <div id="vistaPreviaCompacta" class="horario-compacto">
                                <span style="color:#94A3B8;font-size:12px;">Selecciona días y completa los horarios</span>
                            </div>
                        </div>

                        <div id="alertaDuplicado" style="display:none;padding:10px 14px;background:#FEF2F2;border-radius:8px;border:1px solid #EF4444;color:#EF4444;font-size:13px;margin-top:10px;">
                            <i class="fas fa-exclamation-triangle"></i> <span id="mensajeDuplicado">⚠️ Este personal ya tiene un horario similar</span>
                        </div>
                    </div>
                </div>

                <div class="modal-footer" style="padding:14px 28px 20px 28px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;position:sticky;bottom:0;background:#fff;z-index:10;">
                    <span id="estadoHorario" style="font-size:12px;color:#94A3B8;"><i class="fas fa-info-circle"></i> Nuevo registro</span>
                    <div style="display:flex;gap:10px;">
                        <button type="button" class="btn btn-secondary" onclick="window.Horarios.cerrarModal()" style="padding:8px 20px;">Cancelar</button>
                        <button type="submit" class="btn btn-primary" id="btnGuardarHorario" style="padding:8px 24px;"><i class="fas fa-save"></i> Guardar</button>
                    </div>
                </div>
            </form>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Inicializar
    inicializarHorariosPorDia();
    window.Horarios.generarTablaHorarios();

    // Si hay datos para editar
    if (data) {
        document.getElementById('modalTitle').innerHTML = `<i class="fas fa-edit" style="color:#F59E0B;"></i> Editar Horario`;
        document.getElementById('editIndex').value = index;
        document.getElementById('idPersonalHidden').value = data.idPersonal || '';
        document.getElementById('idPersonalDisplay').value = data.idPersonal || '';
        document.getElementById('nombrePersonalDisplay').value = data.nombre || '';
        document.getElementById('fechaVigencia').value = data.fechaVigencia || '';
        
        // Cargar horarios existentes
        const horariosDelEmpleado = horariosData.filter(h => h.idPersonal === data.idPersonal);
        horariosDelEmpleado.forEach(h => {
            const dia = h.diasSemana || '';
            if (dia && DIAS_SEMANA.includes(dia)) {
                horariosPorDia[dia].activo = true;
                horariosPorDia[dia].entrada = h.horaEntrada || '';
                horariosPorDia[dia].salida = h.horaSalida || '';
                horariosPorDia[dia].inicioRefrigerio = h.inicioRefrigerio || '';
                horariosPorDia[dia].terminoRefrigerio = h.terminoRefrigerio || '';
                horariosPorDia[dia].observaciones = h.observaciones || '';
            }
        });
        window.Horarios.generarTablaHorarios();
    }

    // Establecer fecha por defecto
    if (!data) {
        const hoy = new Date();
        const year = hoy.getFullYear();
        const month = String(hoy.getMonth() + 1).padStart(2, '0');
        const day = String(hoy.getDate()).padStart(2, '0');
        document.getElementById('fechaVigencia').value = `${year}-${month}-${day}`;
    }

    // Mostrar modal
    const modal = document.getElementById('modalHorario');
    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Configurar eventos del buscador
    const inputBuscar = document.getElementById('buscarPersonalHorario');
    inputBuscar.addEventListener('input', function() {
        window.Horarios.buscarPersonal(this.value);
    });
    inputBuscar.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const resultados = document.querySelectorAll('#resultadosPersonal .resultado-item');
            if (resultados.length > 0) {
                resultados[0].click();
            }
        }
    });
};

// ============================================================
// BUSCAR PERSONAL
// ============================================================
window.Horarios.buscarPersonal = function(query) {
    const container = document.getElementById('resultadosPersonal');
    if (!query || query.length < 2) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    const datosPersonal = window.API.getDatos() || [];
    if (datosPersonal.length === 0) {
        container.innerHTML = '<div style="padding:16px;text-align:center;color:#94A3B8;">Cargando datos...</div>';
        container.style.display = 'block';
        window.API.list().then(() => {
            window.Horarios.buscarPersonal(query);
        });
        return;
    }

    const queryLower = query.toLowerCase().trim();
    const resultados = datosPersonal.filter(p => {
        const texto = `${p.ID_PERSONAL || ''} ${p.NOMBRES || ''} ${p.APE_PATERNO || ''}`.toLowerCase();
        return texto.includes(queryLower);
    }).slice(0, 15);

    if (resultados.length === 0) {
        container.innerHTML = `<div style="padding:16px;text-align:center;color:#94A3B8;">No se encontraron resultados</div>`;
        container.style.display = 'block';
        return;
    }

    container.innerHTML = resultados.map(p => `
        <div class="resultado-item" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #F1F5F9;"
             onclick="window.Horarios.seleccionarPersonal('${p.ID_PERSONAL}')"
             onmouseenter="this.style.background='#F1F5F9'" 
             onmouseleave="this.style.background=''">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <strong>${window.esc(p.NOMBRES || '')} ${window.esc(p.APE_PATERNO || '')}</strong>
                    <span style="font-size:11px;color:#94A3B8;margin-left:8px;">ID: ${window.esc(p.ID_PERSONAL || '')}</span>
                </div>
                ${p.CARGO ? `<span style="font-size:10px;color:#64748B;background:#F1F5F9;padding:1px 8px;border-radius:12px;">${window.esc(p.CARGO)}</span>` : ''}
            </div>
        </div>
    `).join('');
    container.style.display = 'block';
};

// ============================================================
// SELECCIONAR PERSONAL
// ============================================================
window.Horarios.seleccionarPersonal = function(idPersonal) {
    const datosPersonal = window.API.getDatos() || [];
    const empleado = datosPersonal.find(p => String(p.ID_PERSONAL) === String(idPersonal));
    
    if (!empleado) {
        window.toast('❌ Personal no encontrado', 'error');
        return;
    }

    personalSeleccionadoData = empleado;
    
    document.getElementById('buscarPersonalHorario').value = `${empleado.NOMBRES || ''} ${empleado.APE_PATERNO || ''} (${empleado.ID_PERSONAL})`;
    document.getElementById('idPersonalDisplay').value = empleado.ID_PERSONAL || '';
    document.getElementById('nombrePersonalDisplay').value = `${empleado.NOMBRES || ''} ${empleado.APE_PATERNO || ''} ${empleado.APE_MATERNO || ''}`.trim();
    document.getElementById('idPersonalHidden').value = empleado.ID_PERSONAL || '';
    document.getElementById('resultadosPersonal').style.display = 'none';
    document.getElementById('resultadosPersonal').innerHTML = '';

    const contenedor = document.getElementById('personalSeleccionado');
    contenedor.style.display = 'block';
    document.getElementById('personalSeleccionadoNombre').textContent = `${empleado.NOMBRES || ''} ${empleado.APE_PATERNO || ''}`.trim() || 'Sin nombre';
    document.getElementById('personalSeleccionadoID').textContent = empleado.ID_PERSONAL || '---';
    document.getElementById('personalSeleccionadoCargo').textContent = empleado.CARGO || 'Sin cargo';

    // Mostrar horarios existentes
    window.Horarios.mostrarHorariosExistentes(empleado.ID_PERSONAL);
    window.Horarios.verificarDuplicado(empleado.ID_PERSONAL);
    
    document.getElementById('estadoHorario').innerHTML = `<i class="fas fa-check-circle" style="color:#10B981;"></i> ${empleado.ID_PERSONAL} - ${empleado.NOMBRES}`;
    window.toast(`✅ ${empleado.NOMBRES} seleccionado`, 'success');
};

// ============================================================
// ABRIR LISTA COMPLETA
// ============================================================
window.Horarios.abrirListaCompleta = function() {
    const datosPersonal = window.API.getDatos() || [];
    if (datosPersonal.length === 0) {
        window.toast('⚠️ Cargando datos...', 'warning');
        window.API.list().then(() => {
            window.Horarios.abrirListaCompleta();
        });
        return;
    }

    const container = document.getElementById('resultadosPersonal');
    const resultados = datosPersonal.slice(0, 30);

    container.innerHTML = `
        <div style="padding:8px 14px;background:#F1F5F9;font-size:11px;color:#64748B;border-bottom:1px solid #E2E8F0;display:flex;justify-content:space-between;">
            <span><i class="fas fa-list"></i> Todos los empleados (${resultados.length} de ${datosPersonal.length})</span>
            <button onclick="document.getElementById('resultadosPersonal').style.display='none';" style="background:none;border:none;cursor:pointer;color:#94A3B8;">✕</button>
        </div>
        ${resultados.map(p => `
            <div class="resultado-item" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #F1F5F9;"
                 onclick="window.Horarios.seleccionarPersonal('${p.ID_PERSONAL}')"
                 onmouseenter="this.style.background='#F1F5F9'" 
                 onmouseleave="this.style.background=''">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <strong>${window.esc(p.NOMBRES || '')} ${window.esc(p.APE_PATERNO || '')}</strong>
                        <span style="font-size:11px;color:#94A3B8;margin-left:8px;">ID: ${window.esc(p.ID_PERSONAL || '')}</span>
                    </div>
                    ${p.CARGO ? `<span style="font-size:10px;color:#64748B;background:#F1F5F9;padding:1px 8px;border-radius:12px;">${window.esc(p.CARGO)}</span>` : ''}
                </div>
            </div>
        `).join('')}
        ${datosPersonal.length > 30 ? `<div style="padding:8px 14px;text-align:center;font-size:11px;color:#94A3B8;">Hay ${datosPersonal.length - 30} empleados más. Usa la búsqueda.</div>` : ''}
    `;
    container.style.display = 'block';
};

// ============================================================
// LIMPIAR SELECCIÓN
// ============================================================
window.Horarios.limpiarSeleccionPersonal = function() {
    personalSeleccionadoData = null;
    document.getElementById('buscarPersonalHorario').value = '';
    document.getElementById('resultadosPersonal').style.display = 'none';
    document.getElementById('resultadosPersonal').innerHTML = '';
    document.getElementById('personalSeleccionado').style.display = 'none';
    document.getElementById('idPersonalDisplay').value = '';
    document.getElementById('nombrePersonalDisplay').value = '';
    document.getElementById('idPersonalHidden').value = '';
    document.getElementById('listaHorariosExistentes').innerHTML = '';
    document.getElementById('contadorHorariosExistentes').textContent = '0';
    document.getElementById('alertaDuplicado').style.display = 'none';
    document.getElementById('estadoHorario').innerHTML = '<i class="fas fa-info-circle"></i> Nuevo registro';
};

// ============================================================
// CERRAR MODAL
// ============================================================
window.Horarios.cerrarModal = function() {
    const modal = document.getElementById('modalHorario');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
};

// ============================================================
// GENERAR TABLA DE HORARIOS
// ============================================================
window.Horarios.generarTablaHorarios = function() {
    const tbody = document.getElementById('horarioTablaBody');
    if (!tbody) return;

    let html = '';
    DIAS_SEMANA.forEach((dia, index) => {
        const data = horariosPorDia[dia] || { activo: false, entrada: '', salida: '', inicioRefrigerio: '', terminoRefrigerio: '', observaciones: '', _horasCalculadas: 0 };
        const checked = data.activo ? 'checked' : '';
        const disabled = !data.activo ? 'disabled' : '';
        const filaClass = !data.activo ? 'fila-inactiva' : '';
        const totalHoras = data._horasCalculadas || 0;
        const totalClass = totalHoras > 0 ? 'positivo' : 'cero';

        html += `
            <tr id="fila-${dia}" class="${filaClass}">
                <td><span class="dia-label">${DIAS_ABREV[index]}</span></td>
                <td>
                    <input type="checkbox" class="dia-check" id="check-${dia}" ${checked} 
                           onchange="window.Horarios.toggleDia('${dia}', this)">
                </td>
                <td>
                    <input type="time" id="horaEntrada_${dia}" class="input-${dia}" 
                           value="${data.entrada || ''}" ${disabled}
                           onchange="window.Horarios.actualizarDia('${dia}')" oninput="window.Horarios.actualizarDia('${dia}')">
                </td>
                <td>
                    <input type="time" id="inicioRefrigerio_${dia}" class="input-${dia}" 
                           value="${data.inicioRefrigerio || ''}" ${disabled}
                           onchange="window.Horarios.actualizarDia('${dia}')" oninput="window.Horarios.actualizarDia('${dia}')">
                </td>
                <td>
                    <input type="time" id="terminoRefrigerio_${dia}" class="input-${dia}" 
                           value="${data.terminoRefrigerio || ''}" ${disabled}
                           onchange="window.Horarios.actualizarDia('${dia}')" oninput="window.Horarios.actualizarDia('${dia}')">
                </td>
                <td>
                    <input type="time" id="horaSalida_${dia}" class="input-${dia}" 
                           value="${data.salida || ''}" ${disabled}
                           onchange="window.Horarios.actualizarDia('${dia}')" oninput="window.Horarios.actualizarDia('${dia}')">
                </td>
                <td>
                    <span class="total-horas ${totalClass}" id="total-${dia}">${window.Horarios.formatHoras(totalHoras)}</span>
                </td>
                <td>
                    <input type="text" id="observacion_${dia}" class="observacion-input input-${dia}" 
                           value="${window.esc(data.observaciones || '')}" ${disabled}
                           placeholder="Obs..." 
                           onchange="window.Horarios.actualizarDia('${dia}')" oninput="window.Horarios.actualizarDia('${dia}')">
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarContadorDias();
    window.Horarios.actualizarVistaPrevia();
};

// ============================================================
// FUNCIONES DE DÍAS
// ============================================================
window.Horarios.toggleDia = function(dia, checkbox) {
    const data = horariosPorDia[dia];
    data.activo = checkbox.checked;
    
    const inputs = document.querySelectorAll(`.input-${dia}`);
    inputs.forEach(inp => {
        inp.disabled = !checkbox.checked;
        if (!checkbox.checked) inp.value = '';
    });

    const row = document.getElementById(`fila-${dia}`);
    if (row) {
        row.classList.toggle('fila-inactiva', !checkbox.checked);
    }

    if (!checkbox.checked) {
        data.entrada = '';
        data.salida = '';
        data.inicioRefrigerio = '';
        data.terminoRefrigerio = '';
        data.observaciones = '';
        data._horasCalculadas = 0;
        document.getElementById(`total-${dia}`).textContent = '0:00';
        document.getElementById(`total-${dia}`).className = 'total-horas cero';
    }

    window.Horarios.actualizarContadorDias();
    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    
    const idPersonal = document.getElementById('idPersonalHidden').value;
    if (idPersonal) window.Horarios.verificarDuplicado(idPersonal);
};

window.Horarios.actualizarDia = function(dia) {
    const data = horariosPorDia[dia];
    data.entrada = document.getElementById(`horaEntrada_${dia}`)?.value || '';
    data.salida = document.getElementById(`horaSalida_${dia}`)?.value || '';
    data.inicioRefrigerio = document.getElementById(`inicioRefrigerio_${dia}`)?.value || '';
    data.terminoRefrigerio = document.getElementById(`terminoRefrigerio_${dia}`)?.value || '';
    data.observaciones = document.getElementById(`observacion_${dia}`)?.value || '';

    window.Horarios.actualizarTotalDia(dia);
    window.Horarios.actualizarVistaPrevia();
};

window.Horarios.actualizarTotalDia = function(dia) {
    const data = horariosPorDia[dia] || {};
    if (!data.activo) {
        data._horasCalculadas = 0;
        document.getElementById(`total-${dia}`).textContent = '0:00';
        document.getElementById(`total-${dia}`).className = 'total-horas cero';
        window.Horarios.calcularResumenHoras();
        return;
    }

    const entrada = document.getElementById(`horaEntrada_${dia}`)?.value || '';
    const salida = document.getElementById(`horaSalida_${dia}`)?.value || '';
    const inicioRef = document.getElementById(`inicioRefrigerio_${dia}`)?.value || '';
    const finRef = document.getElementById(`terminoRefrigerio_${dia}`)?.value || '';

    const horas = window.Horarios.calcularHorasDia(entrada, inicioRef, finRef, salida);
    data._horasCalculadas = horas;

    const totalCell = document.getElementById(`total-${dia}`);
    if (totalCell) {
        totalCell.textContent = window.Horarios.formatHoras(horas);
        totalCell.className = 'total-horas' + (horas > 0 ? ' positivo' : ' cero');
    }

    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    
    const idPersonal = document.getElementById('idPersonalHidden').value;
    if (idPersonal) window.Horarios.verificarDuplicado(idPersonal);
};

// ============================================================
// ACCIONES RÁPIDAS
// ============================================================
window.Horarios.seleccionarTodosLosDias = function() {
    DIAS_SEMANA.forEach(dia => {
        const checkbox = document.getElementById(`check-${dia}`);
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            horariosPorDia[dia].activo = true;
            document.querySelectorAll(`.input-${dia}`).forEach(inp => inp.disabled = false);
            document.getElementById(`fila-${dia}`)?.classList.remove('fila-inactiva');
        }
    });
    window.Horarios.actualizarContadorDias();
    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    window.toast('✅ Todos los días seleccionados', 'success');
};

window.Horarios.deseleccionarTodosLosDias = function() {
    DIAS_SEMANA.forEach(dia => {
        const checkbox = document.getElementById(`check-${dia}`);
        if (checkbox && checkbox.checked) {
            checkbox.checked = false;
            horariosPorDia[dia].activo = false;
            document.querySelectorAll(`.input-${dia}`).forEach(inp => {
                inp.disabled = true;
                inp.value = '';
            });
            document.getElementById(`fila-${dia}`)?.classList.add('fila-inactiva');
            horariosPorDia[dia] = { activo: false, entrada: '', salida: '', inicioRefrigerio: '', terminoRefrigerio: '', observaciones: '', _horasCalculadas: 0 };
            document.getElementById(`total-${dia}`).textContent = '0:00';
            document.getElementById(`total-${dia}`).className = 'total-horas cero';
        }
    });
    window.Horarios.actualizarContadorDias();
    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    window.toast('🧹 Todos los días deseleccionados', 'info');
};

window.Horarios.aplicarHorarioATodosLosDias = function() {
    let diaRef = DIAS_SEMANA.find(d => horariosPorDia[d].activo) || DIAS_SEMANA[0];
    const ref = horariosPorDia[diaRef];
    const entrada = document.getElementById(`horaEntrada_${diaRef}`)?.value || ref.entrada;
    const salida = document.getElementById(`horaSalida_${diaRef}`)?.value || ref.salida;
    const inicioRef = document.getElementById(`inicioRefrigerio_${diaRef}`)?.value || ref.inicioRefrigerio;
    const finRef = document.getElementById(`terminoRefrigerio_${diaRef}`)?.value || ref.terminoRefrigerio;
    const obs = document.getElementById(`observacion_${diaRef}`)?.value || ref.observaciones;

    if (!entrada || !salida || !inicioRef || !finRef) {
        window.toast('⚠️ Complete el horario del día de referencia', 'warning');
        return;
    }

    DIAS_SEMANA.forEach(dia => {
        const checkbox = document.getElementById(`check-${dia}`);
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            horariosPorDia[dia].activo = true;
            document.querySelectorAll(`.input-${dia}`).forEach(inp => inp.disabled = false);
            document.getElementById(`fila-${dia}`)?.classList.remove('fila-inactiva');
        }
        document.getElementById(`horaEntrada_${dia}`).value = entrada;
        document.getElementById(`horaSalida_${dia}`).value = salida;
        document.getElementById(`inicioRefrigerio_${dia}`).value = inicioRef;
        document.getElementById(`terminoRefrigerio_${dia}`).value = finRef;
        document.getElementById(`observacion_${dia}`).value = obs;
        horariosPorDia[dia].entrada = entrada;
        horariosPorDia[dia].salida = salida;
        horariosPorDia[dia].inicioRefrigerio = inicioRef;
        horariosPorDia[dia].terminoRefrigerio = finRef;
        horariosPorDia[dia].observaciones = obs;
        window.Horarios.actualizarTotalDia(dia);
    });
    window.toast('✅ Horario copiado a todos los días', 'success');
};

window.Horarios.aplicarHorarioLaboralEstandar = function() {
    const laborales = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'];
    DIAS_SEMANA.forEach(dia => {
        const esLaboral = laborales.includes(dia);
        const checkbox = document.getElementById(`check-${dia}`);
        if (esLaboral) {
            if (!checkbox.checked) {
                checkbox.checked = true;
                horariosPorDia[dia].activo = true;
                document.querySelectorAll(`.input-${dia}`).forEach(inp => inp.disabled = false);
                document.getElementById(`fila-${dia}`)?.classList.remove('fila-inactiva');
            }
            document.getElementById(`horaEntrada_${dia}`).value = '08:00';
            document.getElementById(`horaSalida_${dia}`).value = '17:00';
            document.getElementById(`inicioRefrigerio_${dia}`).value = '12:00';
            document.getElementById(`terminoRefrigerio_${dia}`).value = '13:00';
            document.getElementById(`observacion_${dia}`).value = 'Horario estándar';
            horariosPorDia[dia].entrada = '08:00';
            horariosPorDia[dia].salida = '17:00';
            horariosPorDia[dia].inicioRefrigerio = '12:00';
            horariosPorDia[dia].terminoRefrigerio = '13:00';
            horariosPorDia[dia].observaciones = 'Horario estándar';
            window.Horarios.actualizarTotalDia(dia);
        } else if (checkbox && checkbox.checked) {
            checkbox.checked = false;
            horariosPorDia[dia].activo = false;
            document.querySelectorAll(`.input-${dia}`).forEach(inp => {
                inp.disabled = true;
                inp.value = '';
            });
            document.getElementById(`fila-${dia}`)?.classList.add('fila-inactiva');
            horariosPorDia[dia] = { activo: false, entrada: '', salida: '', inicioRefrigerio: '', terminoRefrigerio: '', observaciones: '', _horasCalculadas: 0 };
            document.getElementById(`total-${dia}`).textContent = '0:00';
            document.getElementById(`total-${dia}`).className = 'total-horas cero';
        }
    });
    window.Horarios.actualizarContadorDias();
    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    window.toast('✅ Horario estándar (L-V 8:00-17:00)', 'success');
};

// ============================================================
// RESUMEN Y VISTA PREVIA
// ============================================================
window.Horarios.calcularResumenHoras = function() {
    let totalHoras = 0, diasActivos = 0;
    DIAS_SEMANA.forEach(dia => {
        const data = horariosPorDia[dia] || {};
        if (data.activo && data._horasCalculadas > 0) {
            totalHoras += data._horasCalculadas;
            diasActivos++;
        }
    });
    document.getElementById('totalHorasSemanales').textContent = window.Horarios.formatHoras(totalHoras);
    document.getElementById('totalDiasActivos').textContent = diasActivos;
};

window.Horarios.actualizarContadorDias = function() {
    const count = DIAS_SEMANA.filter(d => horariosPorDia[d].activo).length;
    document.getElementById('diasSeleccionadosCount').textContent = `(${count} días)`;
};

window.Horarios.actualizarVistaPrevia = function() {
    const container = document.getElementById('vistaPreviaCompacta');
    const diasActivos = DIAS_SEMANA.filter(d => horariosPorDia[d].activo);
    if (diasActivos.length === 0) {
        container.innerHTML = '<span style="color:#94A3B8;font-size:12px;">Selecciona días y completa los horarios</span>';
        return;
    }
    let html = '';
    DIAS_SEMANA.forEach(dia => {
        const data = horariosPorDia[dia];
        if (!data.activo || !data.entrada || !data.salida) return;
        const nombreDia = dia.charAt(0) + dia.slice(1).toLowerCase();
        html += `<div class="dia-line"><span class="dia-nombre">${nombreDia}</span>
            <span class="hora-entrada">${data.entrada}</span>
            <span class="refrigerio">${data.inicioRefrigerio}-${data.terminoRefrigerio}</span>
            <span class="hora-salida">${data.salida}</span>
            <span class="total-horas">${window.Horarios.formatHoras(data._horasCalculadas || 0)}h</span>
        </div>`;
    });
    container.innerHTML = html || '<span style="color:#94A3B8;font-size:12px;">Completa los horarios</span>';
};

// ============================================================
// VERIFICAR DUPLICADO
// ============================================================
window.Horarios.verificarDuplicado = function(idPersonal) {
    const alerta = document.getElementById('alertaDuplicado');
    const mensaje = document.getElementById('mensajeDuplicado');
    if (!alerta || !idPersonal) return;

    const diasActivos = DIAS_SEMANA.filter(d => horariosPorDia[d].activo);
    if (diasActivos.length === 0) { alerta.style.display = 'none'; return; }

    const duplicados = [];
    diasActivos.forEach(dia => {
        const entrada = horariosPorDia[dia].entrada;
        if (!entrada) return;
        const existe = horariosData.some(h => 
            h.idPersonal === idPersonal && 
            h.diasSemana === dia && 
            h.horaEntrada === entrada
        );
        if (existe) duplicados.push(dia);
    });

    if (duplicados.length > 0) {
        alerta.style.display = 'block';
        mensaje.textContent = `⚠️ Ya tiene horario(s) para: ${duplicados.join(', ')}`;
    } else {
        alerta.style.display = 'none';
    }
};

// ============================================================
// MOSTRAR HORARIOS EXISTENTES
// ============================================================
window.Horarios.mostrarHorariosExistentes = function(idPersonal) {
    const container = document.getElementById('listaHorariosExistentes');
    const contador = document.getElementById('contadorHorariosExistentes');
    const horarios = horariosData.filter(h => h.idPersonal === idPersonal);
    contador.textContent = horarios.length;
    if (horarios.length === 0) {
        container.innerHTML = '<span style="font-size:12px;color:#94A3B8;">Sin horarios asignados</span>';
        return;
    }
    let html = '';
    horarios.forEach(h => {
        const dia = h.diasSemana?.charAt(0) + h.diasSemana?.slice(1).toLowerCase() || '';
        html += `<span class="badge" style="font-size:10px;padding:2px 10px;background:#F1F5F9;border:1px solid #E2E8F0;">
            <strong style="color:#3B82F6;">${dia}</strong> ${h.horaEntrada}-${h.horaSalida}
        </span>`;
    });
    container.innerHTML = html;
};

// ============================================================
// GUARDAR HORARIO - CORREGIDO
// ============================================================
window.Horarios.guardar = async function(e) {
    e.preventDefault();
    
    const idPersonal = document.getElementById('idPersonalHidden').value.trim();
    if (!idPersonal) {
        window.toast('⚠️ Selecciona un personal', 'error');
        document.getElementById('buscarPersonalHorario').focus();
        return;
    }

    const fechaVigencia = document.getElementById('fechaVigencia').value.trim();
    if (!fechaVigencia) {
        window.toast('⚠️ Selecciona fecha de vigencia', 'error');
        document.getElementById('fechaVigencia').focus();
        return;
    }

    const diasActivos = DIAS_SEMANA.filter(d => horariosPorDia[d].activo);
    if (diasActivos.length === 0) {
        window.toast('⚠️ Selecciona al menos un día', 'error');
        return;
    }

    const nombrePersonal = document.getElementById('nombrePersonalDisplay').value.trim() || 'Sin nombre';
    const horarios = [];
    let totalHorasSemanales = 0;

    for (const dia of diasActivos) {
        const data = horariosPorDia[dia];
        if (!data.entrada || !data.salida || !data.inicioRefrigerio || !data.terminoRefrigerio) {
            window.toast(`⚠️ Completa todos los campos para ${dia}`, 'error');
            return;
        }
        
        // Calcular horas de este día
        const horasDia = window.Horarios.calcularHorasDia(
            data.entrada,
            data.inicioRefrigerio,
            data.terminoRefrigerio,
            data.salida
        );
        totalHorasSemanales += horasDia;
        
        horarios.push({
            idPersonal: idPersonal,
            nombre: nombrePersonal,
            fechaVigencia: fechaVigencia,
            diasSemana: dia,
            horaEntrada: data.entrada,
            inicioRefrigerio: data.inicioRefrigerio,
            terminoRefrigerio: data.terminoRefrigerio,
            horaSalida: data.salida,
            observaciones: data.observaciones || '',
            horasTrabajadas: window.Horarios.formatHoras(horasDia)
        });
    }

    // Mostrar resumen antes de guardar
    const confirmar = confirm(
        `📋 Resumen del horario:\n\n` +
        `👤 Personal: ${nombrePersonal} (${idPersonal})\n` +
        `📅 Fecha Vigencia: ${fechaVigencia}\n` +
        `📆 Días: ${diasActivos.join(', ')}\n` +
        `⏱️ Total horas semanales: ${window.Horarios.formatHoras(totalHorasSemanales)}\n\n` +
        `¿Guardar estos horarios?`
    );
    
    if (!confirmar) return;

    const btn = document.getElementById('btnGuardarHorario');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        let exito = true;
        for (const h of horarios) {
            const ok = await window.Horarios.guardarEnSheet(h);
            if (!ok) { 
                exito = false; 
                break; 
            }
            await new Promise(r => setTimeout(r, 300));
        }
        
        if (exito) {
            window.Horarios.cerrarModal();
            window.toast(`✅ ${horarios.length} horario(s) guardado(s)`, 'success');
            await window.Horarios.cargar(true);
            window.Horarios.renderTabla();
            window.Horarios.actualizarContadores();
        } else {
            window.toast('❌ Error al guardar en Sheets', 'error');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        window.toast('❌ Error: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Guardar';
    }
};

console.log('✅ Modal Horarios cargado correctamente');
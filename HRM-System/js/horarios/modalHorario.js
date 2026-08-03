// ============================================================
// HORARIOS - MODAL DE CREACIÓN/EDICIÓN
// ============================================================

// ===== ESTADO DEL MODAL =====
let horariosPorDia = {};
let personalSeleccionadoData = null;
let listaCompletaAbierta = false;
let timeoutBusqueda = null;

// ===== INICIALIZAR =====
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
// ABRIR MODAL
// ============================================================
window.Horarios.abrirModal = function(data = null, index = -1) {
    const modal = document.getElementById('modalHorario');
    if (!modal) {
        // Crear modal dinámicamente si no existe
        window.Horarios.crearModalHorario();
        return window.Horarios.abrirModal(data, index);
    }

    const title = document.getElementById('modalTitle');
    inicializarHorariosPorDia();
    window.Horarios.limpiarSeleccionPersonal();

    // Establecer fecha por defecto
    const fechaInput = document.getElementById('fechaVigencia');
    if (fechaInput) {
        const hoy = new Date();
        const year = hoy.getFullYear();
        const month = String(hoy.getMonth() + 1).padStart(2, '0');
        const day = String(hoy.getDate()).padStart(2, '0');
        fechaInput.value = `${year}-${month}-${day}`;
    }

    if (data) {
        title.innerHTML = `<i class="fas fa-edit" style="color:#F59E0B;"></i> Editar Horario`;
        document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

        const idPersonal = data.idPersonal || '';
        const nombrePersonal = data.nombre || '';
        const fechaVigencia = data.fechaVigencia || '';

        if (fechaInput && fechaVigencia) {
            fechaInput.value = fechaVigencia;
        }

        // Buscar empleado
        let empleado = window.API.getDatos().find(p => String(p.ID_PERSONAL) === String(idPersonal));
        if (!empleado && idPersonal) {
            empleado = {
                ID_PERSONAL: idPersonal,
                NOMBRES: nombrePersonal.split(' ')[0] || '',
                APE_PATERNO: nombrePersonal.split(' ').slice(1).join(' ') || '',
                APE_MATERNO: '',
                CARGO: data.cargo || 'Sin cargo',
                PROGRAMA: data.programa || 'Sin programa'
            };
        }

        const horariosDelEmpleado = horariosData.filter(h => h.idPersonal === idPersonal);

        if (empleado) {
            personalSeleccionadoData = empleado;
            const nombreCompleto = `${empleado.NOMBRES || ''} ${empleado.APE_PATERNO || ''}`.trim();
            document.getElementById('buscarPersonalHorario').value = `${nombreCompleto} (${empleado.ID_PERSONAL || ''})`;
            document.getElementById('idPersonalDisplay').value = empleado.ID_PERSONAL || '';
            document.getElementById('nombrePersonalDisplay').value = `${empleado.NOMBRES || ''} ${empleado.APE_PATERNO || ''} ${empleado.APE_MATERNO || ''}`.trim();
            document.getElementById('idPersonalHidden').value = empleado.ID_PERSONAL || '';
            const contenedor = document.getElementById('personalSeleccionado');
            contenedor.style.display = 'block';
            document.getElementById('personalSeleccionadoNombre').textContent = `${empleado.NOMBRES || ''} ${empleado.APE_PATERNO || ''}`.trim() || 'Sin nombre';
            document.getElementById('personalSeleccionadoID').textContent = empleado.ID_PERSONAL || '---';
            document.getElementById('personalSeleccionadoCargo').textContent = empleado.CARGO || 'Sin cargo asignado';
            document.getElementById('personalSeleccionadoPrograma').textContent = empleado.PROGRAMA || 'Sin programa';
            window.Horarios.mostrarHorariosExistentes(empleado.ID_PERSONAL);
            const estadoHorario = document.getElementById('estadoHorario');
            if (estadoHorario) {
                estadoHorario.innerHTML = `<i class="fas fa-edit" style="color:#F59E0B;"></i> Editando: ${empleado.ID_PERSONAL} - ${nombreCompleto}`;
            }
        } else {
            document.getElementById('idPersonalDisplay').value = idPersonal || '';
            document.getElementById('nombrePersonalDisplay').value = nombrePersonal || '';
            document.getElementById('idPersonalHidden').value = idPersonal || '';
            document.getElementById('buscarPersonalHorario').value = nombrePersonal || idPersonal || '';
            const contenedor = document.getElementById('personalSeleccionado');
            contenedor.style.display = 'block';
            document.getElementById('personalSeleccionadoNombre').textContent = nombrePersonal || 'Nombre no disponible';
            document.getElementById('personalSeleccionadoID').textContent = idPersonal || '---';
            document.getElementById('personalSeleccionadoCargo').textContent = 'Cargo no disponible';
            document.getElementById('personalSeleccionadoPrograma').textContent = 'Programa no disponible';
            window.Horarios.mostrarHorariosExistentes(idPersonal);
            const estadoHorario = document.getElementById('estadoHorario');
            if (estadoHorario) {
                estadoHorario.innerHTML = `<i class="fas fa-edit" style="color:#F59E0B;"></i> Editando: ${idPersonal}`;
            }
        }

        horariosDelEmpleado.forEach(h => {
            const dia = h.diasSemana || '';
            if (dia) {
                const checkbox = document.getElementById(`check-${dia}`);
                if (checkbox) {
                    checkbox.checked = true;
                    horariosPorDia[dia].activo = true;
                    const inputs = document.querySelectorAll(`.input-${dia}`);
                    inputs.forEach(inp => inp.disabled = false);
                    const row = document.getElementById(`fila-${dia}`);
                    if (row) row.classList.remove('fila-inactiva');
                }
                document.getElementById(`horaEntrada_${dia}`).value = h.horaEntrada || '';
                document.getElementById(`horaSalida_${dia}`).value = h.horaSalida || '';
                document.getElementById(`inicioRefrigerio_${dia}`).value = h.inicioRefrigerio || '';
                document.getElementById(`terminoRefrigerio_${dia}`).value = h.terminoRefrigerio || '';
                document.getElementById(`observacion_${dia}`).value = h.observaciones || '';

                horariosPorDia[dia].entrada = h.horaEntrada || '';
                horariosPorDia[dia].salida = h.horaSalida || '';
                horariosPorDia[dia].inicioRefrigerio = h.inicioRefrigerio || '';
                horariosPorDia[dia].terminoRefrigerio = h.terminoRefrigerio || '';
                horariosPorDia[dia].observaciones = h.observaciones || '';

                window.Horarios.actualizarTotalDia(dia);
            }
        });

        document.getElementById('editIndex').value = index;
        document.getElementById('editRowIndex').value = data._rowIndex !== undefined ? data._rowIndex : -1;

    } else {
        title.innerHTML = `<i class="fas fa-plus-circle" style="color:#3B82F6;"></i> Nuevo Horario`;
        document.getElementById('formHorario').reset();
        document.getElementById('editIndex').value = -1;
        document.getElementById('editRowIndex').value = -1;
        window.Horarios.limpiarSeleccionPersonal();
        inicializarHorariosPorDia();
    }

    window.Horarios.generarTablaHorarios();
    window.Horarios.actualizarContadorDiasSeleccionados();
    window.Horarios.actualizarVistaPrevia();
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
};

// ============================================================
// CREAR MODAL DINÁMICAMENTE
// ============================================================
window.Horarios.crearModalHorario = function() {
    const modalHTML = `
    <div id="modalHorario" class="modal">
        <div class="modal-content" style="max-width:1000px;width:95%;">
            <div class="modal-header" style="padding:18px 28px;border-bottom:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                <div>
                    <h2 id="modalTitle" style="font-size:20px;font-weight:700;margin:0;display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-plus-circle" style="color:#3B82F6;"></i> Nuevo Horario
                    </h2>
                    <p style="font-size:13px;color:#64748B;margin:2px 0 0 0;">Asigna horarios por día con cálculo automático de horas</p>
                </div>
                <button class="modal-close" onclick="window.Horarios.cerrarModal()" style="background:none;border:none;font-size:28px;cursor:pointer;color:#94A3B8;padding:0 8px;transition:color 0.2s;">&times;</button>
            </div>

            <form id="formHorario" onsubmit="window.Horarios.guardar(event)" style="padding:0;">
                <input type="hidden" id="editIndex" value="-1">
                <input type="hidden" id="editRowIndex" value="-1">
                <input type="hidden" id="idPersonalHidden" value="">
                <input type="hidden" id="modoHorario" value="simple">

                <div style="padding:24px 28px 10px 28px;">

                    <!-- SELECCIÓN DE PERSONAL -->
                    <div style="margin-bottom:20px;padding:16px 18px;background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;position:relative;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                            <i class="fas fa-user-tie" style="color:#3B82F6;font-size:16px;"></i>
                            <span style="font-weight:600;font-size:14px;color:#1E293B;">Seleccionar Personal</span>
                            <span class="required" style="color:#EF4444;margin-left:4px;">*</span>
                        </div>

                        <div style="position:relative;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <div style="flex:1;min-width:200px;position:relative;">
                                <input type="text" id="buscarPersonalHorario" 
                                       placeholder="🔍 Buscar por ID, nombre o apellido..." 
                                       oninput="window.Horarios.filtrarPersonal(this.value)"
                                       autocomplete="off"
                                       style="width:100%;padding:10px 12px 10px 38px;border:1px solid #E2E8F0;border-radius:10px;font-size:14px;background:#fff;transition:all 0.2s;">
                                <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94A3B8;font-size:14px;"></i>
                            </div>
                            <button type="button" class="btn btn-secondary" onclick="window.Horarios.limpiarSeleccionPersonal()" style="padding:8px 14px;font-size:13px;">
                                <i class="fas fa-times"></i> Limpiar
                            </button>
                            <button type="button" class="btn btn-outline" onclick="window.Horarios.abrirListaCompleta()" style="padding:8px 14px;font-size:13px;">
                                <i class="fas fa-list"></i> Ver todos
                            </button>
                        </div>

                        <div id="resultadosPersonal" style="display:none;position:absolute;left:18px;right:18px;z-index:1000;background:#fff;border:1px solid #E2E8F0;border-radius:10px;max-height:220px;overflow-y:auto;margin-top:4px;box-shadow:0 8px 25px rgba(0,0,0,0.12);"></div>

                        <div id="personalSeleccionado" style="display:none;margin-top:12px;padding:12px 16px;background:#EFF6FF;border-radius:10px;border:1px solid #3B82F6;animation:fadeIn 0.3s ease;">
                            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                                    <div style="width:40px;height:40px;background:#3B82F6;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;"><i class="fas fa-user"></i></div>
                                    <div>
                                        <strong id="personalSeleccionadoNombre" style="font-size:15px;color:#0F172A;"></strong>
                                        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:2px;">
                                            <span style="font-size:12px;color:#64748B;"><i class="fas fa-id-badge"></i> ID: <span id="personalSeleccionadoID" style="font-weight:600;"></span></span>
                                            <span style="font-size:12px;color:#64748B;"><i class="fas fa-briefcase"></i> <span id="personalSeleccionadoCargo"></span></span>
                                            <span style="font-size:12px;color:#64748B;"><i class="fas fa-graduation-cap"></i> <span id="personalSeleccionadoPrograma"></span></span>
                                        </div>
                                    </div>
                                </div>
                                <span class="badge badge-green" style="font-size:12px;padding:3px 14px;">✓ Seleccionado</span>
                            </div>
                            <div id="horariosExistentesPersonal" style="margin-top:10px;padding-top:10px;border-top:1px solid #CBD5E1;">
                                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                                    <i class="fas fa-clock" style="color:#3B82F6;font-size:13px;"></i>
                                    <small style="color:#64748B;font-weight:600;">Horarios asignados actualmente:</small>
                                    <span id="contadorHorariosExistentes" class="badge badge-blue" style="font-size:10px;padding:1px 8px;">0</span>
                                </div>
                                <div id="listaHorariosExistentes" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
                            </div>
                        </div>

                        <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:8px;">
                            <div>
                                <label style="font-size:11px;color:#64748B;font-weight:600;">ID Personal</label>
                                <input type="text" id="idPersonalDisplay" readonly 
                                       style="width:100%;padding:6px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;background:#f8fafc;color:#1E293B;font-weight:500;">
                            </div>
                            <div>
                                <label style="font-size:11px;color:#64748B;font-weight:600;">Nombre Completo</label>
                                <input type="text" id="nombrePersonalDisplay" readonly 
                                       style="width:100%;padding:6px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;background:#f8fafc;color:#1E293B;font-weight:500;">
                            </div>
                        </div>
                    </div>

                    <!-- FECHA DE VIGENCIA -->
                    <div style="margin-bottom:16px;padding:14px 18px;background:#F8FAFC;border-radius:10px;border:1px solid #E2E8F0;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                            <i class="fas fa-calendar-check" style="color:#3B82F6;font-size:16px;"></i>
                            <span style="font-weight:600;font-size:14px;color:#1E293B;">Fecha de Vigencia</span>
                            <span class="required" style="color:#EF4444;margin-left:4px;">*</span>
                        </div>
                        <div style="max-width:280px;">
                            <input type="date" id="fechaVigencia" 
                                   style="width:100%;padding:9px 12px;border:1px solid #E2E8F0;border-radius:8px;font-size:14px;background:#fff;transition:all 0.2s;">
                            <small style="color:#94A3B8;font-size:11px;display:block;margin-top:4px;">Fecha desde la cual el horario entra en vigencia</small>
                        </div>
                    </div>

                    <!-- CONFIGURACIÓN DE DÍAS -->
                    <div style="margin-bottom:12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <i class="fas fa-calendar-week" style="color:#3B82F6;font-size:16px;"></i>
                                <span style="font-weight:600;font-size:14px;color:#1E293B;">Horario Semanal</span>
                                <span class="required" style="color:#EF4444;">*</span>
                                <span id="diasSeleccionadosCount" style="font-size:12px;color:#94A3B8;margin-left:4px;">(0 días seleccionados)</span>
                            </div>
                            <div class="acciones-rapidas-horario">
                                <button type="button" class="btn-mini" onclick="window.Horarios.seleccionarTodosLosDias()">✓ Todos</button>
                                <button type="button" class="btn-mini" onclick="window.Horarios.deseleccionarTodosLosDias()">✕ Ninguno</button>
                                <button type="button" class="btn-mini primary" onclick="window.Horarios.aplicarHorarioATodosLosDias()"><i class="fas fa-copy"></i> Copiar a todos</button>
                                <button type="button" class="btn-mini success" onclick="window.Horarios.aplicarHorarioLaboralEstandar()"><i class="fas fa-clock"></i> Estándar (L-V)</button>
                            </div>
                        </div>

                        <!-- TABLA DE HORARIOS -->
                        <div class="horario-tabla-container">
                            <table class="horario-tabla" id="horarioTabla">
                                <thead>
                                    <tr>
                                        <th style="width:45px;">Día</th>
                                        <th style="width:40px;">Activo</th>
                                        <th>Ingreso</th>
                                        <th>Inicio Ref.</th>
                                        <th>Fin Ref.</th>
                                        <th>Salida</th>
                                        <th style="width:70px;">Total</th>
                                        <th style="min-width:100px;">Observación</th>
                                    </tr>
                                </thead>
                                <tbody id="horarioTablaBody">
                                    <!-- Generado por JavaScript -->
                                </tbody>
                            </table>
                        </div>

                        <!-- Resumen de horas -->
                        <div class="resumen-horas" id="resumenHoras">
                            <span class="item"><span class="label">Total horas semanales:</span> <span class="value total" id="totalHorasSemanales">0:00</span></span>
                            <span class="item"><span class="label">Días activos:</span> <span class="value" id="totalDiasActivos">0</span></span>
                            <span class="item"><span class="label">Promedio por día:</span> <span class="value" id="promedioHorasDia">0:00</span></span>
                        </div>

                        <!-- Vista previa compacta -->
                        <div style="margin-top:12px;padding:12px 16px;background:#F1F5F9;border-radius:8px;border:1px solid #E2E8F0;">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                                <i class="fas fa-eye" style="color:#3B82F6;font-size:14px;"></i>
                                <span style="font-weight:600;font-size:13px;color:#1E293B;">Vista previa del horario</span>
                                <span style="font-size:11px;color:#94A3B8;">(formato compacto)</span>
                            </div>
                            <div id="vistaPreviaCompacta" class="horario-compacto">
                                <span style="color:#94A3B8;font-size:12px;">Selecciona días y completa los horarios para ver la vista previa</span>
                            </div>
                        </div>

                        <div id="alertaDuplicado" style="display:none;padding:10px 14px;background:#FEF2F2;border-radius:8px;border:1px solid #EF4444;color:#EF4444;font-size:13px;margin-top:10px;">
                            <i class="fas fa-exclamation-triangle"></i> <span id="mensajeDuplicado">⚠️ Este personal ya tiene un horario similar en los mismos días y hora.</span>
                        </div>
                    </div>
                </div>

                <div class="modal-footer" style="padding:14px 28px 20px 28px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;gap:8px;align-items:center;">
                        <span id="estadoHorario" style="font-size:12px;color:#94A3B8;"><i class="fas fa-info-circle"></i> Nuevo registro</span>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        <button type="button" class="btn btn-secondary" onclick="window.Horarios.cerrarModal()" style="padding:8px 20px;"><i class="fas fa-times"></i> Cancelar</button>
                        <button type="submit" class="btn btn-primary" id="btnGuardarHorario" style="padding:8px 24px;"><i class="fas fa-save"></i> Guardar Horario</button>
                    </div>
                </div>
            </form>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
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
                           onchange="window.Horarios.toggleDia('${dia}', this)" 
                           title="Activar/desactivar ${dia}">
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
    window.Horarios.actualizarContadorDiasSeleccionados();
    window.Horarios.actualizarVistaPrevia();
};

// ============================================================
// FUNCIONES DE SELECCIÓN DE PERSONAL
// ============================================================
window.Horarios.filtrarPersonal = function(query) {
    // Implementación similar a la del módulo personal
    // (se puede reutilizar la lógica)
};

window.Horarios.abrirListaCompleta = function() {
    // Implementación
};

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
    const estadoHorario = document.getElementById('estadoHorario');
    if (estadoHorario) {
        estadoHorario.innerHTML = `<i class="fas fa-info-circle"></i> Nuevo registro`;
    }
    window.Horarios.actualizarVistaPrevia();
};

window.Horarios.mostrarHorariosExistentes = function(idPersonal) {
    const container = document.getElementById('listaHorariosExistentes');
    const contador = document.getElementById('contadorHorariosExistentes');
    if (!container || !contador) return;

    const horarios = horariosData.filter(h => h.idPersonal === idPersonal);
    contador.textContent = horarios.length;

    if (horarios.length === 0) {
        container.innerHTML = '<span style="font-size:12px;color:#94A3B8;padding:4px 0;">Sin horarios asignados</span>';
        return;
    }

    let html = '';
    DIAS_SEMANA.forEach(dia => {
        const diaHorarios = horarios.filter(h => h.diasSemana === dia);
        diaHorarios.forEach(h => {
            const horaEntrada = window.Horarios.formatearHora(h.horaEntrada);
            const horaSalida = window.Horarios.formatearHora(h.horaSalida);
            const inicioRef = window.Horarios.formatearHora(h.inicioRefrigerio);
            const finRef = window.Horarios.formatearHora(h.terminoRefrigerio);
            const nombreDia = dia.charAt(0) + dia.slice(1).toLowerCase();
            html += `
                <span class="badge" style="font-size:10px;padding:2px 10px;margin:1px;border-radius:16px;background:#F1F5F9;color:#1E293B;border:1px solid #E2E8F0;display:inline-flex;align-items:center;gap:3px;">
                    <strong style="font-size:9px;color:#3B82F6;">${nombreDia}</strong>
                    <span class="horario-hora" style="font-size:10px;">${horaEntrada}</span>
                    <span style="font-size:8px;color:#94A3B8;">${inicioRef}-${finRef}</span>
                    <span class="horario-hora" style="font-size:10px;">${horaSalida}</span>
                </span>
            `;
        });
    });

    container.innerHTML = html || '<span style="font-size:12px;color:#94A3B8;padding:4px 0;">Sin horarios asignados</span>';
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
        if (checkbox.checked) row.classList.remove('fila-inactiva');
        else row.classList.add('fila-inactiva');
    }

    if (!checkbox.checked) {
        data.entrada = '';
        data.salida = '';
        data.inicioRefrigerio = '';
        data.terminoRefrigerio = '';
        data.observaciones = '';
        data._horasCalculadas = 0;
        const totalCell = document.getElementById(`total-${dia}`);
        if (totalCell) {
            totalCell.textContent = '0:00';
            totalCell.className = 'total-horas cero';
        }
    }

    window.Horarios.actualizarContadorDiasSeleccionados();
    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    window.Horarios.verificarDuplicado(document.getElementById('idPersonalHidden').value);
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
        const totalCell = document.getElementById(`total-${dia}`);
        if (totalCell) {
            totalCell.textContent = '0:00';
            totalCell.className = 'total-horas cero';
        }
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
        totalCell.className = 'total-horas';
        if (horas > 0) totalCell.classList.add('positivo');
        else totalCell.classList.add('cero');
    }

    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    window.Horarios.verificarDuplicado(document.getElementById('idPersonalHidden').value);
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
            const inputs = document.querySelectorAll(`.input-${dia}`);
            inputs.forEach(inp => inp.disabled = false);
            const row = document.getElementById(`fila-${dia}`);
            if (row) row.classList.remove('fila-inactiva');
        }
    });
    window.Horarios.actualizarContadorDiasSeleccionados();
    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    window.Horarios.verificarDuplicado(document.getElementById('idPersonalHidden').value);
    window.toast('✅ Todos los días seleccionados', 'success');
};

window.Horarios.deseleccionarTodosLosDias = function() {
    DIAS_SEMANA.forEach(dia => {
        const checkbox = document.getElementById(`check-${dia}`);
        if (checkbox && checkbox.checked) {
            checkbox.checked = false;
            horariosPorDia[dia].activo = false;
            const inputs = document.querySelectorAll(`.input-${dia}`);
            inputs.forEach(inp => {
                inp.disabled = true;
                inp.value = '';
            });
            const row = document.getElementById(`fila-${dia}`);
            if (row) row.classList.add('fila-inactiva');
            horariosPorDia[dia].entrada = '';
            horariosPorDia[dia].salida = '';
            horariosPorDia[dia].inicioRefrigerio = '';
            horariosPorDia[dia].terminoRefrigerio = '';
            horariosPorDia[dia].observaciones = '';
            horariosPorDia[dia]._horasCalculadas = 0;
            const totalCell = document.getElementById(`total-${dia}`);
            if (totalCell) {
                totalCell.textContent = '0:00';
                totalCell.className = 'total-horas cero';
            }
        }
    });
    window.Horarios.actualizarContadorDiasSeleccionados();
    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    window.toast('🧹 Todos los días deseleccionados', 'info');
};

window.Horarios.aplicarHorarioATodosLosDias = function() {
    let diaReferencia = DIAS_SEMANA.find(d => horariosPorDia[d].activo);
    if (!diaReferencia) {
        diaReferencia = DIAS_SEMANA[0];
        const checkbox = document.getElementById(`check-${diaReferencia}`);
        if (checkbox) {
            checkbox.checked = true;
            horariosPorDia[diaReferencia].activo = true;
            const inputs = document.querySelectorAll(`.input-${diaReferencia}`);
            inputs.forEach(inp => inp.disabled = false);
            const row = document.getElementById(`fila-${diaReferencia}`);
            if (row) row.classList.remove('fila-inactiva');
        }
    }

    const ref = horariosPorDia[diaReferencia];
    const entrada = document.getElementById(`horaEntrada_${diaReferencia}`)?.value || ref.entrada;
    const salida = document.getElementById(`horaSalida_${diaReferencia}`)?.value || ref.salida;
    const inicioRef = document.getElementById(`inicioRefrigerio_${diaReferencia}`)?.value || ref.inicioRefrigerio;
    const finRef = document.getElementById(`terminoRefrigerio_${diaReferencia}`)?.value || ref.terminoRefrigerio;
    const obs = document.getElementById(`observacion_${diaReferencia}`)?.value || ref.observaciones;

    if (!entrada || !salida || !inicioRef || !finRef) {
        window.toast('⚠️ Complete el horario del día de referencia primero', 'warning');
        return;
    }

    DIAS_SEMANA.forEach(dia => {
        const checkbox = document.getElementById(`check-${dia}`);
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            horariosPorDia[dia].activo = true;
            const inputs = document.querySelectorAll(`.input-${dia}`);
            inputs.forEach(inp => inp.disabled = false);
            const row = document.getElementById(`fila-${dia}`);
            if (row) row.classList.remove('fila-inactiva');
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

    window.Horarios.actualizarContadorDiasSeleccionados();
    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    window.toast('✅ Horario copiado a todos los días', 'success');
};

window.Horarios.aplicarHorarioLaboralEstandar = function() {
    const diasLaborales = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'];
    const entradaStd = '08:00';
    const salidaStd = '17:00';
    const inicioRefStd = '12:00';
    const finRefStd = '13:00';
    const obsStd = 'Horario estándar';

    DIAS_SEMANA.forEach(dia => {
        const checkbox = document.getElementById(`check-${dia}`);
        const esLaboral = diasLaborales.includes(dia);

        if (esLaboral) {
            if (!checkbox.checked) {
                checkbox.checked = true;
                horariosPorDia[dia].activo = true;
                const inputs = document.querySelectorAll(`.input-${dia}`);
                inputs.forEach(inp => inp.disabled = false);
                const row = document.getElementById(`fila-${dia}`);
                if (row) row.classList.remove('fila-inactiva');
            }
            document.getElementById(`horaEntrada_${dia}`).value = entradaStd;
            document.getElementById(`horaSalida_${dia}`).value = salidaStd;
            document.getElementById(`inicioRefrigerio_${dia}`).value = inicioRefStd;
            document.getElementById(`terminoRefrigerio_${dia}`).value = finRefStd;
            document.getElementById(`observacion_${dia}`).value = obsStd;

            horariosPorDia[dia].entrada = entradaStd;
            horariosPorDia[dia].salida = salidaStd;
            horariosPorDia[dia].inicioRefrigerio = inicioRefStd;
            horariosPorDia[dia].terminoRefrigerio = finRefStd;
            horariosPorDia[dia].observaciones = obsStd;
            window.Horarios.actualizarTotalDia(dia);
        } else {
            if (checkbox && checkbox.checked) {
                checkbox.checked = false;
                horariosPorDia[dia].activo = false;
                const inputs = document.querySelectorAll(`.input-${dia}`);
                inputs.forEach(inp => {
                    inp.disabled = true;
                    inp.value = '';
                });
                const row = document.getElementById(`fila-${dia}`);
                if (row) row.classList.add('fila-inactiva');
                horariosPorDia[dia].entrada = '';
                horariosPorDia[dia].salida = '';
                horariosPorDia[dia].inicioRefrigerio = '';
                horariosPorDia[dia].terminoRefrigerio = '';
                horariosPorDia[dia].observaciones = '';
                horariosPorDia[dia]._horasCalculadas = 0;
                const totalCell = document.getElementById(`total-${dia}`);
                if (totalCell) {
                    totalCell.textContent = '0:00';
                    totalCell.className = 'total-horas cero';
                }
            }
        }
    });

    window.Horarios.actualizarContadorDiasSeleccionados();
    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    window.Horarios.verificarDuplicado(document.getElementById('idPersonalHidden').value);
    window.toast('✅ Horario estándar aplicado (L-V 8:00-17:00)', 'success');
};

// ============================================================
// ACTUALIZAR TOTAL DE UN DÍA - CORREGIDO
// ============================================================
window.Horarios.actualizarTotalDia = function(dia) {
    const data = horariosPorDia[dia] || {};
    if (!data.activo) {
        data._horasCalculadas = 0;
        const totalCell = document.getElementById(`total-${dia}`);
        if (totalCell) {
            totalCell.textContent = '0:00';
            totalCell.className = 'total-horas cero';
        }
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
        totalCell.className = 'total-horas';
        if (horas > 0) totalCell.classList.add('positivo');
        else totalCell.classList.add('cero');
    }

    // Actualizar resumen completo
    window.Horarios.calcularResumenHoras();
    window.Horarios.actualizarVistaPrevia();
    
    // Verificar duplicados
    const idPersonal = document.getElementById('idPersonalHidden').value;
    if (idPersonal) {
        window.Horarios.verificarDuplicado(idPersonal);
    }
};

// ============================================================
// CALCULAR RESUMEN DE HORAS - CORREGIDO
// ============================================================
window.Horarios.calcularResumenHoras = function() {
    let totalHoras = 0;
    let diasActivos = 0;

    DIAS_SEMANA.forEach(dia => {
        const data = horariosPorDia[dia] || {};
        if (data.activo) {
            const horas = data._horasCalculadas || 0;
            if (horas > 0) {
                totalHoras += horas;
                diasActivos++;
            }
        }
    });

    const totalHorasEl = document.getElementById('totalHorasSemanales');
    const diasActivosEl = document.getElementById('totalDiasActivos');
    const promedioEl = document.getElementById('promedioHorasDia');

    if (totalHorasEl) totalHorasEl.textContent = window.Horarios.formatHoras(totalHoras);
    if (diasActivosEl) diasActivosEl.textContent = diasActivos;
    
    const promedio = diasActivos > 0 ? totalHoras / diasActivos : 0;
    if (promedioEl) promedioEl.textContent = window.Horarios.formatHoras(promedio);
    
    // Actualizar también el estado del botón guardar con el total
    const estadoHorario = document.getElementById('estadoHorario');
    if (estadoHorario && totalHoras > 0) {
        estadoHorario.innerHTML = `<i class="fas fa-clock" style="color:#3B82F6;"></i> Total: ${window.Horarios.formatHoras(totalHoras)} (${diasActivos} días)`;
    }
};

// ============================================================
// VERIFICAR DUPLICADO
// ============================================================
window.Horarios.verificarDuplicado = function(idPersonal) {
    const alerta = document.getElementById('alertaDuplicado');
    const mensaje = document.getElementById('mensajeDuplicado');
    if (!alerta || !idPersonal) return;

    const diasActivos = DIAS_SEMANA.filter(d => horariosPorDia[d].activo);
    if (diasActivos.length === 0) {
        alerta.style.display = 'none';
        return;
    }

    const duplicados = [];
    diasActivos.forEach(dia => {
        const entrada = horariosPorDia[dia].entrada;
        if (!entrada) return;

        const existe = horariosData.some(h => {
            const hDia = h.diasSemana || '';
            const hEntrada = h.horaEntrada ? h.horaEntrada.substring(0, 5) : '';
            return h.idPersonal === idPersonal &&
                   hDia === dia &&
                   hEntrada === entrada.substring(0, 5);
        });

        if (existe) duplicados.push(dia);
    });

    if (duplicados.length > 0) {
        alerta.style.display = 'block';
        mensaje.textContent = `⚠️ Este personal ya tiene horario(s) asignado(s) para: ${duplicados.join(', ')}`;
    } else {
        alerta.style.display = 'none';
    }
};

// ============================================================
// GUARDAR HORARIO - CORREGIDO
// ============================================================
window.Horarios.guardar = async function(e) {
    e.preventDefault();

    const idPersonal = document.getElementById('idPersonalHidden').value.trim();
    if (!idPersonal) {
        window.toast('⚠️ Debes seleccionar un personal de la lista', 'error');
        document.getElementById('buscarPersonalHorario').focus();
        return;
    }

    const fechaVigencia = document.getElementById('fechaVigencia').value.trim();
    if (!fechaVigencia) {
        window.toast('⚠️ Debes seleccionar una fecha de vigencia', 'error');
        document.getElementById('fechaVigencia').focus();
        return;
    }

    const diasActivos = DIAS_SEMANA.filter(d => horariosPorDia[d].activo);
    if (diasActivos.length === 0) {
        window.toast('⚠️ Debes seleccionar al menos un día', 'error');
        return;
    }

    const nombrePersonal = document.getElementById('nombrePersonalDisplay').value.trim() || 'Sin nombre';

    // Construir array de horarios para guardar
    const horarios = [];
    let totalHorasSemanales = 0;
    
    for (const dia of diasActivos) {
        const data = horariosPorDia[dia];
        if (!data.entrada || !data.salida || !data.inicioRefrigerio || !data.terminoRefrigerio) {
            window.toast(`⚠️ Completa todos los horarios para ${dia}`, 'error');
            document.getElementById(`horaEntrada_${dia}`)?.focus();
            return;
        }
        if (data.inicioRefrigerio >= data.terminoRefrigerio) {
            window.toast(`⚠️ El inicio del refrigerio debe ser antes del término para ${dia}`, 'error');
            return;
        }
        if (data.entrada >= data.salida) {
            window.toast(`⚠️ La hora de entrada debe ser antes de la salida para ${dia}`, 'error');
            return;
        }
        if (data.inicioRefrigerio < data.entrada || data.terminoRefrigerio > data.salida) {
            window.toast(`⚠️ El refrigerio debe estar dentro del horario laboral para ${dia}`, 'error');
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
            fechaVigencia: fechaVigencia,  // ← FECHA DE VIGENCIA
            diasSemana: dia,
            horaEntrada: data.entrada,
            inicioRefrigerio: data.inicioRefrigerio,
            terminoRefrigerio: data.terminoRefrigerio,
            horaSalida: data.salida,
            observaciones: data.observaciones || '',
            horasTrabajadas: window.Horarios.formatHoras(horasDia)  // ← HORAS PARCIALES
        });
    }

    // Verificar si hay horarios existentes para este empleado
    const editIndex = parseInt(document.getElementById('editIndex').value);
    const isEdit = editIndex >= 0 && editIndex < horariosData.length;

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

    // Guardar en Google Sheets
    const btnGuardar = document.getElementById('btnGuardarHorario');
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }

    try {
        if (isEdit) {
            // Eliminar horarios existentes del empleado
            const horariosExistentes = horariosData.filter(h => h.idPersonal === idPersonal);
            for (const h of horariosExistentes) {
                if (h._rowIndex !== undefined && h._rowIndex >= 0) {
                    await window.Horarios.eliminarEnSheet(h._rowIndex);
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            // Guardar nuevos horarios
            let todosExitosos = true;
            for (const horarioData of horarios) {
                const exito = await window.Horarios.guardarEnSheet(horarioData);
                if (!exito) {
                    todosExitosos = false;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            if (todosExitosos) {
                window.Horarios.cerrarModal();
                window.toast(`✅ ${horarios.length} horario(s) actualizado(s)`, 'success');
                await window.Horarios.cargar(true);
                window.Horarios.renderTabla();
                window.Horarios.actualizarContadores();
            } else {
                window.toast('❌ Algunos horarios no se pudieron guardar', 'error');
            }
        } else {
            let todosExitosos = true;
            for (const horarioData of horarios) {
                const exito = await window.Horarios.guardarEnSheet(horarioData);
                if (!exito) {
                    todosExitosos = false;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            if (todosExitosos) {
                window.Horarios.cerrarModal();
                window.toast(`✅ ${horarios.length} horario(s) guardado(s)`, 'success');
                await window.Horarios.cargar(true);
                window.Horarios.renderTabla();
                window.Horarios.actualizarContadores();
            } else {
                window.toast('❌ Algunos horarios no se pudieron guardar', 'error');
            }
        }
    } catch (error) {
        window.toast('❌ Error: ' + error.message, 'error');
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = '<i class="fas fa-save"></i> Guardar Horario';
        }
    }
};

// ============================================================
// GUARDAR EN SHEET - CON FECHA DE VIGENCIA Y HORAS
// ============================================================
window.Horarios.guardarEnSheet = async function(horarioData) {
    try {
        // Construir URL con todos los parámetros
        let url = HORARIOS_API_URL + '?action=create';
        const params = {
            idPersonal: horarioData.idPersonal || '',
            nombre: horarioData.nombre || '',
            fechaVigencia: horarioData.fechaVigencia || '',  // ← FECHA DE VIGENCIA
            diasSemana: horarioData.diasSemana || '',
            horaEntrada: horarioData.horaEntrada || '',
            inicioRefrigerio: horarioData.inicioRefrigerio || '',
            terminoRefrigerio: horarioData.terminoRefrigerio || '',
            horaSalida: horarioData.horaSalida || '',
            observaciones: horarioData.observaciones || '',
            horasTrabajadas: horarioData.horasTrabajadas || ''
        };

        Object.entries(params).forEach(([k, v]) => {
            if (v) url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
        });

        console.log('📤 Enviando a Sheets:', url);
        
        const resp = await fetch(url);
        const texto = await resp.text();
        console.log('📥 Respuesta Sheets:', texto);
        
        let result;
        try { result = JSON.parse(texto); } catch (e) { 
            result = { success: texto.includes('success') || texto.includes('exito') }; 
        }
        return result.success;
    } catch (e) {
        console.error('❌ Error guardando horario:', e);
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
        const resp = await fetch(url);
        const texto = await resp.text();
        let result;
        try { result = JSON.parse(texto); } catch (e) { result = { success: texto.includes('success') }; }
        return result.success;
    } catch (e) {
        console.error('Error eliminando horario:', e);
        return false;
    }
};

// ============================================================
// EDITAR Y ELIMINAR GRUPOS
// ============================================================
window.Horarios.editarGrupo = function(idPersonal) {
    const horariosDelEmpleado = horariosData.filter(h => h.idPersonal === idPersonal);
    if (horariosDelEmpleado.length === 0) {
        window.toast('⚠️ No se encontraron horarios para este empleado', 'error');
        return;
    }
    const primerIndex = horariosData.findIndex(h => h.idPersonal === idPersonal);
    if (primerIndex === -1) {
        window.toast('⚠️ Error al encontrar el horario', 'error');
        return;
    }
    window.Horarios.abrirModal(horariosData[primerIndex], primerIndex);
};

window.Horarios.eliminarGrupo = async function(idPersonal) {
    const horariosDelEmpleado = horariosData.filter(h => h.idPersonal === idPersonal);
    if (horariosDelEmpleado.length === 0) {
        window.toast('⚠️ No se encontraron horarios para este empleado', 'error');
        return;
    }
    const nombre = horariosDelEmpleado[0].nombre || 'empleado';
    const dias = horariosDelEmpleado.map(h => h.diasSemana || '').join(', ');

    if (confirm(`⚠️ ¿Eliminar TODOS los horarios de "${nombre}" (${dias})?`)) {
        let todosExitosos = true;
        for (const h of horariosDelEmpleado) {
            if (h._rowIndex !== undefined && h._rowIndex >= 0) {
                const exito = await window.Horarios.eliminarEnSheet(h._rowIndex);
                if (!exito) todosExitosos = false;
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        if (todosExitosos) {
            window.toast(`🗑️ Todos los horarios de "${nombre}" eliminados`, 'info');
            await window.Horarios.cargar(true);
            window.Horarios.renderTabla();
            window.Horarios.actualizarContadores();
        } else {
            window.toast('❌ Algunos horarios no se pudieron eliminar', 'error');
        }
    }
};
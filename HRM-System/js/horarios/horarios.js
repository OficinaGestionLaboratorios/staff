// ============================================================
// MÓDULO: HORARIOS - CORREGIDO
// ============================================================

window.horarios = (function() {
    'use strict';

    // ===== CONFIGURACIÓN - URL CORREGIDA =====
    const API_URL_PERSONAL = 'https://script.google.com/macros/s/AKfycbxIHnC0cLTktCZntqno1q8ekXksWtNUGqkvQ-WbVk2HftFAT7AnfiCIMev_yhTF_Kyh/exec';
    const HORARIOS_API_URL = 'https://script.google.com/macros/s/AKfycbz4hUuTBRYV6qEr5Fa3_tiMJBgXp9ZMtPopblZi_tIsHiGSmLq7mn008_D6zFAqCe9-/exec';

    // ===== ESTADO =====
    let datosPersonal = [];
    let empleadoSeleccionado = null;
    let horariosData = [];
    let editando = false;
    let editRowIndex = -1;

    const DIAS = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
    const DIAS_ABREV = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    let horariosPorDia = {};

    // ===== UTILIDADES =====
    function toast(msg, type = 'success') {
        if (window.toast) {
            window.toast(msg, type);
        } else {
            console.log(`[${type}] ${msg}`);
        }
    }

    function esc(s) {
        return String(s || '').replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
    }

    function calcularHorasDia(entrada, inicioRef, finRef, salida) {
        if (!entrada || !inicioRef || !finRef || !salida) return 0;
        try {
            const toMin = (t) => {
                const parts = t.split(':');
                if (parts.length < 2) return 0;
                return parseInt(parts[0]) * 60 + parseInt(parts[1]);
            };
            const e = toMin(entrada);
            const ir = toMin(inicioRef);
            const fr = toMin(finRef);
            const s = toMin(salida);
            if (e >= s || ir >= fr || ir < e || fr > s) return 0;
            return (s - e - (fr - ir)) / 60;
        } catch (e) {
            return 0;
        }
    }

    function formatHoras(horas) {
        if (horas === 0) return '0:00';
        const h = Math.floor(horas);
        const m = Math.round((horas - h) * 60);
        return `${h}:${String(m).padStart(2, '0')}`;
    }

    function obtenerFechaActual() {
        const hoy = new Date();
        const year = hoy.getFullYear();
        const month = String(hoy.getMonth() + 1).padStart(2, '0');
        const day = String(hoy.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function inicializarHorarios() {
        DIAS.forEach(dia => {
            horariosPorDia[dia] = {
                entrada: '',
                inicioRef: '',
                finRef: '',
                salida: '',
                _horas: 0
            };
        });
    }

    // ===== GENERAR TABLA =====
    function generarTablaHorarios() {
        const tbody = document.getElementById('horarioTablaBody');
        if (!tbody) return;

        let html = '';
        DIAS.forEach((dia, index) => {
            const data = horariosPorDia[dia] || { entrada: '', inicioRef: '', finRef: '', salida: '', _horas: 0 };
            const totalHoras = data._horas || 0;
            const totalClass = totalHoras > 0 ? 'positivo' : 'cero';

            html += `
                <tr>
                    <td><span class="dia-label">${DIAS_ABREV[index]}</span></td>
                    <td>
                        <input type="time" id="entrada_${dia}" value="${data.entrada || ''}"
                               onchange="window.horarios?.actualizarHorarioDia('${dia}')" 
                               oninput="window.horarios?.actualizarHorarioDia('${dia}')">
                    </td>
                    <td>
                        <input type="time" id="inicioRef_${dia}" value="${data.inicioRef || ''}"
                               onchange="window.horarios?.actualizarHorarioDia('${dia}')" 
                               oninput="window.horarios?.actualizarHorarioDia('${dia}')">
                    </td>
                    <td>
                        <input type="time" id="finRef_${dia}" value="${data.finRef || ''}"
                               onchange="window.horarios?.actualizarHorarioDia('${dia}')" 
                               oninput="window.horarios?.actualizarHorarioDia('${dia}')">
                    </td>
                    <td>
                        <input type="time" id="salida_${dia}" value="${data.salida || ''}"
                               onchange="window.horarios?.actualizarHorarioDia('${dia}')" 
                               oninput="window.horarios?.actualizarHorarioDia('${dia}')">
                    </td>
                    <td>
                        <span class="total-horas ${totalClass}" id="total_${dia}">${formatHoras(totalHoras)}</span>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        calcularResumen();
    }

    // ===== ACTUALIZAR HORARIO POR DÍA =====
    function actualizarHorarioDia(dia) {
        const entrada = document.getElementById(`entrada_${dia}`)?.value || '';
        const inicioRef = document.getElementById(`inicioRef_${dia}`)?.value || '';
        const finRef = document.getElementById(`finRef_${dia}`)?.value || '';
        const salida = document.getElementById(`salida_${dia}`)?.value || '';

        horariosPorDia[dia] = {
            entrada: entrada,
            inicioRef: inicioRef,
            finRef: finRef,
            salida: salida,
            _horas: calcularHorasDia(entrada, inicioRef, finRef, salida)
        };

        const totalEl = document.getElementById(`total_${dia}`);
        if (totalEl) {
            const horas = horariosPorDia[dia]._horas;
            totalEl.textContent = formatHoras(horas);
            totalEl.className = 'total-horas';
            if (horas > 0) totalEl.classList.add('positivo');
            else totalEl.classList.add('cero');
        }

        calcularResumen();
    }

    // ===== CALCULAR RESUMEN =====
    function calcularResumen() {
        let totalHoras = 0;
        let diasActivos = 0;

        DIAS.forEach(dia => {
            const data = horariosPorDia[dia] || {};
            const horas = data._horas || 0;
            if (horas > 0) {
                totalHoras += horas;
                diasActivos++;
            }
        });

        const totalEl = document.getElementById('totalHorasSemanales');
        const diasEl = document.getElementById('diasActivos');
        if (totalEl) totalEl.textContent = formatHoras(totalHoras);
        if (diasEl) diasEl.textContent = diasActivos;
    }

    // ===== APLICAR TURNO =====
    function aplicarTurno(turno) {
        document.querySelectorAll('.btn-turno').forEach(b => b.classList.remove('active'));

        let turnos = {};
        let diasActivos = [];

        switch (turno) {
            case 'admin1':
                document.querySelector('[data-turno="admin1"]')?.classList.add('active');
                diasActivos = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'];
                turnos = { entrada: '08:00', inicioRef: '13:00', finRef: '14:00', salida: '17:48' };
                break;
            case 'admin2':
                document.querySelector('[data-turno="admin2"]')?.classList.add('active');
                diasActivos = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'];
                turnos = { entrada: '07:00', inicioRef: '13:00', finRef: '14:00', salida: '16:48' };
                break;
            case 'manana':
                document.querySelector('[data-turno="manana"]')?.classList.add('active');
                diasActivos = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
                turnos = { entrada: '06:45', inicioRef: '13:00', finRef: '13:45', salida: '14:50' };
                break;
            case 'tarde':
                document.querySelector('[data-turno="tarde"]')?.classList.add('active');
                diasActivos = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
                turnos = { entrada: '13:40', inicioRef: '14:15', finRef: '15:00', salida: '21:45' };
                break;
            default:
                return;
        }

        DIAS.forEach(dia => {
            const activo = diasActivos.includes(dia);
            const data = horariosPorDia[dia] || {};

            if (activo) {
                data.entrada = turnos.entrada;
                data.inicioRef = turnos.inicioRef;
                data.finRef = turnos.finRef;
                data.salida = turnos.salida;
                data._horas = calcularHorasDia(turnos.entrada, turnos.inicioRef, turnos.finRef, turnos.salida);
            } else {
                data.entrada = '';
                data.inicioRef = '';
                data.finRef = '';
                data.salida = '';
                data._horas = 0;
            }

            horariosPorDia[dia] = data;

            const entradaEl = document.getElementById(`entrada_${dia}`);
            const inicioRefEl = document.getElementById(`inicioRef_${dia}`);
            const finRefEl = document.getElementById(`finRef_${dia}`);
            const salidaEl = document.getElementById(`salida_${dia}`);
            const totalEl = document.getElementById(`total_${dia}`);

            if (entradaEl) entradaEl.value = data.entrada || '';
            if (inicioRefEl) inicioRefEl.value = data.inicioRef || '';
            if (finRefEl) finRefEl.value = data.finRef || '';
            if (salidaEl) salidaEl.value = data.salida || '';
            if (totalEl) {
                totalEl.textContent = formatHoras(data._horas || 0);
                totalEl.className = 'total-horas';
                if (data._horas > 0) totalEl.classList.add('positivo');
                else totalEl.classList.add('cero');
            }
        });

        calcularResumen();
        toast(`✅ Turno ${turno} aplicado`, 'success');
    }

    // ===== LIMPIAR HORARIOS =====
    function limpiarHorarios() {
        document.querySelectorAll('.btn-turno').forEach(b => b.classList.remove('active'));

        DIAS.forEach(dia => {
            horariosPorDia[dia] = { entrada: '', inicioRef: '', finRef: '', salida: '', _horas: 0 };
            const entradaEl = document.getElementById(`entrada_${dia}`);
            const inicioRefEl = document.getElementById(`inicioRef_${dia}`);
            const finRefEl = document.getElementById(`finRef_${dia}`);
            const salidaEl = document.getElementById(`salida_${dia}`);
            const totalEl = document.getElementById(`total_${dia}`);

            if (entradaEl) entradaEl.value = '';
            if (inicioRefEl) inicioRefEl.value = '';
            if (finRefEl) finRefEl.value = '';
            if (salidaEl) salidaEl.value = '';
            if (totalEl) {
                totalEl.textContent = '0:00';
                totalEl.className = 'total-horas cero';
            }
        });

        calcularResumen();
        toast('🧹 Horarios limpiados', 'info');
    }

    // ===== CARGAR PERSONAL - CORREGIDO =====
    async function cargarPersonal() {
        try {
            const resp = await fetch(API_URL_PERSONAL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'action=list'
            });
            const texto = await resp.text();
            let result;
            try { result = JSON.parse(texto); } catch (e) { throw new Error('Respuesta no JSON'); }
            if (result.success && result.data) {
                datosPersonal = result.data;
            } else {
                toast('❌ Error al cargar personal: ' + (result.message || ''), 'error');
            }
        } catch (e) {
            console.error(e);
            toast('❌ Error: ' + e.message, 'error');
        }
    }

    // ===== CONFIGURAR BÚSQUEDA =====
    function configurarBusqueda() {
        const input = document.getElementById('buscarPersonalHorarios');
        const container = document.getElementById('resultadosPersonalHorarios');

        if (!input || !container) return;

        input.addEventListener('input', function() {
            const query = this.value.trim().toLowerCase();

            if (query.length < 2) {
                container.style.display = 'none';
                container.innerHTML = '';
                return;
            }

            if (datosPersonal.length === 0) {
                container.innerHTML = '<div class="item" style="color:#94A3B8;">Cargando datos...</div>';
                container.style.display = 'block';
                return;
            }

            const resultados = datosPersonal.filter(p => {
                const texto = `${p.ID_PERSONAL || ''} ${p.NOMBRES || ''} ${p.APE_PATERNO || ''} ${p.APE_MATERNO || ''}`.toLowerCase();
                return texto.includes(query);
            }).slice(0, 10);

            if (resultados.length === 0) {
                container.innerHTML = '<div class="item" style="color:#94A3B8;">No se encontraron resultados</div>';
                container.style.display = 'block';
                return;
            }

            container.innerHTML = resultados.map(p => `
                <div class="item" onclick="window.horarios?.seleccionarEmpleado('${p.ID_PERSONAL}')">
                    <span class="nombre">${esc(p.NOMBRES || '')} ${esc(p.APE_PATERNO || '')}</span>
                    <span class="id">ID: ${esc(p.ID_PERSONAL || '')}</span>
                    ${p.CARGO ? `<span style="font-size:10px;color:#64748B;background:#F1F5F9;padding:1px 8px;border-radius:10px;">${esc(p.CARGO)}</span>` : ''}
                </div>
            `).join('');

            container.style.display = 'block';
        });

        document.addEventListener('click', function(e) {
            if (container && !container.contains(e.target) && e.target !== input) {
                container.style.display = 'none';
            }
        });
    }

    // ===== SELECCIONAR EMPLEADO =====
    function seleccionarEmpleado(idPersonal) {
        const empleado = datosPersonal.find(p => String(p.ID_PERSONAL) === String(idPersonal));
        if (!empleado) {
            toast('❌ Empleado no encontrado', 'error');
            return;
        }

        empleadoSeleccionado = empleado;
        const container = document.getElementById('resultadosPersonalHorarios');
        container.style.display = 'none';
        container.innerHTML = '';

        const nombreCompleto = `${empleado.NOMBRES || ''} ${empleado.APE_PATERNO || ''} ${empleado.APE_MATERNO || ''}`.trim();
        document.getElementById('buscarPersonalHorarios').value = `${nombreCompleto} (${empleado.ID_PERSONAL})`;

        const selDiv = document.getElementById('empleadoSeleccionadoHorarios');
        selDiv.classList.remove('hidden');
        document.getElementById('empleadoNombreHorarios').textContent = nombreCompleto || 'Sin nombre';
        document.getElementById('empleadoIdHorarios').textContent = empleado.ID_PERSONAL || '---';

        cargarHorariosEmpleado(empleado.ID_PERSONAL);
        toast(`✅ ${nombreCompleto} seleccionado`, 'success');
    }

    // ===== LIMPIAR SELECCIÓN =====
    function limpiarSeleccion() {
        empleadoSeleccionado = null;
        const input = document.getElementById('buscarPersonalHorarios');
        const selDiv = document.getElementById('empleadoSeleccionadoHorarios');
        const container = document.getElementById('resultadosPersonalHorarios');

        if (input) input.value = '';
        if (selDiv) selDiv.classList.add('hidden');
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
        limpiarHorarios();
    }

    // ===== CARGAR HORARIOS DEL EMPLEADO - CORREGIDO =====
    async function cargarHorariosEmpleado(idPersonal) {
        try {
            // ✅ CORRECCIÓN: Usar POST para listar horarios
            const resp = await fetch(HORARIOS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'action=list'
            });
            const texto = await resp.text();
            let result;
            try { result = JSON.parse(texto); } catch (e) { throw new Error('Respuesta no JSON'); }

            if (result.success && result.data) {
                horariosData = result.data.filter(h => String(h.idPersonal) === String(idPersonal));

                if (horariosData.length > 0) {
                    const ultimo = horariosData[horariosData.length - 1];
                    const fechaInput = document.getElementById('fechaVigenciaHorarios');

                    if (ultimo.fechaVigencia && fechaInput) {
                        const partes = ultimo.fechaVigencia.split('/');
                        if (partes.length === 3) {
                            fechaInput.value = `${partes[2]}-${partes[1]}-${partes[0]}`;
                        }
                    }

                    horariosData.forEach(h => {
                        const dia = h.diasSemana || '';
                        if (dia && DIAS.includes(dia.toUpperCase())) {
                            const diaKey = dia.toUpperCase();
                            horariosPorDia[diaKey] = {
                                entrada: h.horaEntrada || '',
                                inicioRef: h.inicioRefrigerio || '',
                                finRef: h.terminoRefrigerio || '',
                                salida: h.horaSalida || '',
                                _horas: calcularHorasDia(h.horaEntrada, h.inicioRefrigerio, h.terminoRefrigerio, h.horaSalida)
                            };

                            const entradaEl = document.getElementById(`entrada_${diaKey}`);
                            const inicioRefEl = document.getElementById(`inicioRef_${diaKey}`);
                            const finRefEl = document.getElementById(`finRef_${diaKey}`);
                            const salidaEl = document.getElementById(`salida_${diaKey}`);
                            const totalEl = document.getElementById(`total_${diaKey}`);

                            if (entradaEl) entradaEl.value = h.horaEntrada || '';
                            if (inicioRefEl) inicioRefEl.value = h.inicioRefrigerio || '';
                            if (finRefEl) finRefEl.value = h.terminoRefrigerio || '';
                            if (salidaEl) salidaEl.value = h.horaSalida || '';
                            if (totalEl) {
                                const horas = horariosPorDia[diaKey]._horas || 0;
                                totalEl.textContent = formatHoras(horas);
                                totalEl.className = 'total-horas';
                                if (horas > 0) totalEl.classList.add('positivo');
                                else totalEl.classList.add('cero');
                            }
                        }
                    });

                    calcularResumen();
                    toast(`📋 ${horariosData.length} horario(s) cargado(s)`, 'info');
                } else {
                    document.getElementById('fechaVigenciaHorarios').value = obtenerFechaActual();
                }
            } else {
                document.getElementById('fechaVigenciaHorarios').value = obtenerFechaActual();
            }
        } catch (e) {
            console.error(e);
            document.getElementById('fechaVigenciaHorarios').value = obtenerFechaActual();
        }
    }

    // ===== OBTENER HORARIOS DEL FORMULARIO =====
    function obtenerHorariosFormulario() {
        const idPersonal = empleadoSeleccionado?.ID_PERSONAL || '';
        const nombreCompleto = empleadoSeleccionado ?
            `${empleadoSeleccionado.NOMBRES || ''} ${empleadoSeleccionado.APE_PATERNO || ''} ${empleadoSeleccionado.APE_MATERNO || ''}`.trim() :
            '';

        if (!idPersonal) {
            toast('⚠️ Debes seleccionar un empleado', 'error');
            return null;
        }

        const fechaVigencia = document.getElementById('fechaVigenciaHorarios')?.value;
        if (!fechaVigencia) {
            toast('⚠️ Debes seleccionar una fecha de vigencia', 'error');
            return null;
        }

        const partes = fechaVigencia.split('-');
        const fechaFormateada = `${partes[2]}/${partes[1]}/${partes[0]}`;

        const horarios = [];
        let diasActivos = 0;

        for (const dia of DIAS) {
            const data = horariosPorDia[dia] || {};
            if (data.entrada && data.salida && data.inicioRef && data.finRef) {
                if (data.inicioRef >= data.finRef) {
                    toast(`⚠️ El inicio del refrigerio debe ser antes del término para ${dia}`, 'error');
                    return null;
                }
                if (data.entrada >= data.salida) {
                    toast(`⚠️ La hora de entrada debe ser antes de la salida para ${dia}`, 'error');
                    return null;
                }
                if (data.inicioRef < data.entrada || data.finRef > data.salida) {
                    toast(`⚠️ El refrigerio debe estar dentro del horario laboral para ${dia}`, 'error');
                    return null;
                }

                diasActivos++;
                horarios.push({
                    idPersonal: idPersonal,
                    nombre: nombreCompleto,
                    fechaVigencia: fechaFormateada,
                    diasSemana: dia,
                    horaEntrada: data.entrada,
                    inicioRefrigerio: data.inicioRef,
                    terminoRefrigerio: data.finRef,
                    horaSalida: data.salida,
                    observaciones: ''
                });
            }
        }

        if (diasActivos === 0) {
            toast('⚠️ Debes completar al menos un día con horario', 'error');
            return null;
        }

        return horarios;
    }

    // ===== GUARDAR HORARIO - CORREGIDO =====
    async function guardarHorario() {
        const horarios = obtenerHorariosFormulario();
        if (!horarios) return;

        const loading = document.getElementById('loadingHorarios');
        if (loading) loading.classList.add('active');

        const isTemporal = document.getElementById('chkTemporalHorarios')?.checked || false;
        const tipo = isTemporal ? 'temporal' : 'ordinario';

        try {
            let todosExitosos = true;

            for (const horario of horarios) {
                // ✅ CORRECCIÓN: Usar POST con los parámetros correctos
                let params = 'action=create' +
                    '&tipo=' + encodeURIComponent(tipo) +
                    '&idPersonal=' + encodeURIComponent(horario.idPersonal) +
                    '&nombre=' + encodeURIComponent(horario.nombre) +
                    '&fechaVigencia=' + encodeURIComponent(horario.fechaVigencia) +
                    '&diasSemana=' + encodeURIComponent(horario.diasSemana) +
                    '&horaEntrada=' + encodeURIComponent(horario.horaEntrada) +
                    '&inicioRefrigerio=' + encodeURIComponent(horario.inicioRefrigerio) +
                    '&terminoRefrigerio=' + encodeURIComponent(horario.terminoRefrigerio) +
                    '&horaSalida=' + encodeURIComponent(horario.horaSalida);

                const resp = await fetch(HORARIOS_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params
                });
                const texto = await resp.text();
                let result;
                try { result = JSON.parse(texto); } catch (e) { result = { success: texto.includes('success') }; }

                if (!result.success) {
                    todosExitosos = false;
                    toast('❌ Error al guardar: ' + (result.message || 'Error desconocido'), 'error');
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 300));
            }

            if (todosExitosos) {
                toast(`✅ ${horarios.length} horario(s) guardado(s) en ${tipo}`, 'success');
                if (empleadoSeleccionado) {
                    await cargarHorariosEmpleado(empleadoSeleccionado.ID_PERSONAL);
                }
            }
        } catch (e) {
            toast('❌ Error: ' + e.message, 'error');
        } finally {
            if (loading) loading.classList.remove('active');
        }
    }

    // ===== VER HISTORIAL =====
    function verHistorial() {
        if (!empleadoSeleccionado) {
            toast('⚠️ Selecciona un empleado primero', 'warning');
            return;
        }

        const idPersonal = empleadoSeleccionado.ID_PERSONAL;
        const nombre = `${empleadoSeleccionado.NOMBRES || ''} ${
// ============================================================
// HORARIOS.JS — Orquestador del módulo Horarios
// ============================================================
// No calcula, no valida ni pinta directamente: delega en
// window.HorarioModel / HorarioValidacion / HorarioAPI / HorarioUI.
// Su única responsabilidad es coordinar el flujo:
//
//   abrir modal → cargar grupos existentes → (nuevo | editar)
//   → validar → guardar/actualizar en BD_HORARIOS → refrescar
//
// La hoja BD_HORARIOS es siempre la fuente de verdad: al editar, los
// datos se piden de nuevo al backend (getHorarioGrupo), nunca se
// asume que lo que quedó en el navegador sigue vigente.
// ============================================================

// Id del grupo que se está editando actualmente (null = modo "nuevo").
let horarioIdGrupoEnEdicion = null;

// ============================================================
// ABRIR / CERRAR MODAL
// ============================================================

window.abrirModalHorarios = async function() {
    if (!window.personalSeleccionado) {
        window.toast('⚠️ Primero selecciona un empleado en la Lista de Personal', 'warning');
        return;
    }

    const modal = document.getElementById('modalHorarios');
    if (!modal) return;

    window.HorarioUI.renderTabla();
    window.HorarioUI.limpiarFormulario();
    horarioIdGrupoEnEdicion = null;
    window.__horarioIdEnEdicion = null;
    window.HorarioUI.setModoFormulario(false);

    const empleadoInput = document.getElementById('horarioEmpleado');
    if (empleadoInput) {
        empleadoInput.value = window.formatearPersonalSeleccionado(window.personalSeleccionado);
    }

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    window.EstadoCarga?.iniciar('horarios');
    await window.horarioCargarGruposExistentes();
};

window.cerrarModalHorarios = function() {
    const modal = document.getElementById('modalHorarios');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    horarioIdGrupoEnEdicion = null;
};

// ============================================================
// HORARIOS EXISTENTES DEL EMPLEADO (panel dentro del modal)
// ============================================================

// Pide a BD_HORARIOS (vía API) todos los grupos del empleado
// seleccionado, los pinta en el panel y engancha el clic de cada
// botón "Editar". Es la única función que arma ese panel — tanto al
// abrir el modal como después de editar/crear/actualizar/eliminar —
// para no tener el mismo bloque de "enganchar botones" duplicado en
// varios lugares.
window.horarioCargarGruposExistentes = async function() {
    const result = await window.HorarioAPI.listar(window.personalSeleccionado.CODE);
    const gruposSinOrdenar = (result.success && Array.isArray(result.data)) ? result.data : [];
    window.EstadoCarga?.finalizar('horarios', gruposSinOrdenar.length, !!result.success);
    // De fecha de inicio más lejana (antigua) a más cercana (reciente),
    // para que la lista quede siempre en el mismo orden sin importar en
    // qué secuencia se hayan creado/editado los horarios en el backend.
    // Se reordena aquí porque esta es la única función que arma el
    // panel — así el registrar/editar/eliminar un horario y volver a
    // ver la lista (se refresca llamando de nuevo a esta función) ya
    // queda reordenado automáticamente.
    const grupos = window.HorarioModel.ordenarGruposPorFechaInicio(gruposSinOrdenar);
    window.__horarioGrupos = grupos; // referencia para las reglas de anticipación
    window.HorarioUI.renderGruposExistentes(grupos, horarioIdGrupoEnEdicion);

    const cont = document.getElementById('horarioGruposExistentes');
    if (cont) {
        // Los cinco botones uniformes (js/core/acciones-registro.js). El modal solo entra en
        // modo edición al pulsar «Editar»; las demás acciones operan sobre el grupo ya cargado.
        const porId = id => grupos.find(g => g.ID_GRUPO === id);
        window.AccionesRegistro.enlazar(cont, {
            editar: id => window.editarGrupoHorario(id),
            // Se pasa `grupos` para encadenar la FECHA_FIN con el horario siguiente.
            exportar: id => { const g = porId(id); if (g) window.HorarioExport.descargarGrupo(g, grupos); },
            copiar: id => { const g = porId(id); if (g) window.HorarioExport.copiarGrupo(g); },
            correo: id => { const g = porId(id); if (g) window.abrirModalCorreoHorario(g); },
            eliminar: id => window.eliminarGrupoHorario(id)
        });
        // Solicitud oficial (Excel INS-DRH-F-28.01) de ESTE horario.
        cont.querySelectorAll('[data-solicitud]').forEach(btn => {
            btn.addEventListener('click', () => window.generarSolicitudHorario(window.personalSeleccionado.CODE, btn.dataset.solicitud));
        });
    }
};

window.nuevoHorarioDesdeExistente = function() {
    horarioIdGrupoEnEdicion = null;
    // Limpia todo el formulario EXCEPTO las horas de la tabla semanal.
    window.HorarioUI.limpiarFormulario(true);
    window.HorarioUI.setModoFormulario(false);
    window.horarioCargarGruposExistentes();
};

// ============================================================
// EDITAR: reconstruye el formulario SIEMPRE desde BD_HORARIOS
// ============================================================
// Se dispara ÚNICAMENTE por el clic en un botón "Editar" del panel
// (wireado en horarioCargarGruposExistentes). Nunca se llama
// automáticamente al abrir el modal ni al seleccionar un empleado.

window.editarGrupoHorario = async function(idGrupo) {
    const result = await window.HorarioAPI.obtenerGrupo(idGrupo);
    if (!result.success || !result.data) {
        window.toast('❌ ' + (result.message || 'No se pudo cargar el horario'), 'error');
        return;
    }

    const grupo = result.data;
    horarioIdGrupoEnEdicion = grupo.ID_GRUPO;
    window.__horarioIdEnEdicion = grupo.ID_GRUPO;

    // <input type="date"> exige exactamente "YYYY-MM-DD": si llega un
    // ISO con hora (backend aún no republicado, ver nota en
    // horario-model.js/fechaATextoLegible) el input lo rechaza y
    // queda vacío en silencio. Se recorta a los primeros 10
    // caracteres para tolerar ambos casos.
    document.getElementById('horarioFechaInicio').value = (grupo.FECHA_INICIO || '').slice(0, 10);
    document.getElementById('horarioFechaFin').value = (grupo.FECHA_FIN || '').slice(0, 10);
    window.HorarioUI.pintarDiasEnTabla(grupo.DIAS);
    window.HorarioUI.escribirObservacion(window.HorarioModel.observacionGeneral(grupo));
    window.HorarioUI.escribirSolicitud(grupo);
    window.HorarioUI.setModoFormulario(true);
    window.HorarioUI.mostrarError('');

    // Vuelve a pintar el panel para resaltar (borde azul) el grupo
    // que ahora se está editando.
    await window.horarioCargarGruposExistentes();

    window.toast(`✏️ Editando horario ${grupo.ID_GRUPO}`, 'success');
};

// ============================================================
// GUARDAR (crear o actualizar según el modo)
// ============================================================

window.guardarHorario = async function() {
    window.HorarioUI.mostrarError('');

    if (!window.personalSeleccionado) {
        window.toast('⚠️ No hay empleado seleccionado', 'error');
        return;
    }

    const fechaInicio = document.getElementById('horarioFechaInicio')?.value || '';
    let fechaFin = document.getElementById('horarioFechaFin')?.value || '';
    const dias = window.HorarioUI.leerFilas();
    const sol = window.HorarioUI.leerSolicitud();
    const esNuevo = !horarioIdGrupoEnEdicion;
    // Permanente: no lleva fecha de fin (se cierra con el siguiente). Al editar se conserva la ya cerrada.
    if (sol.tipo === 'Permanente' && esNuevo) fechaFin = '';

    // Para la regla de 10 días (cambio unilateral > 1 h) se compara contra el horario vigente.
    const M = window.HorarioModel;
    const vigente = M.seleccionarVigente(window.__horarioGrupos || [], fechaInicio, horarioIdGrupoEnEdicion);
    const cambioMin = (sol.solicitadoPor === 'Jefe' && !sol.conformidad && sol.tipo !== 'Rotativo' && vigente)
        ? M.cambioMaxMinutos(dias.filter(d => d.activo), vigente.DIAS) : null;

    const errores = window.HorarioValidacion.validarGrupo(Object.assign({ fechaInicio, fechaFin, dias, esNuevo, cambioMin }, sol));
    if (errores.length > 0) {
        const texto = 'Falta completar: ' + errores.join('; ');
        window.HorarioUI.mostrarError(texto);
        window.toast('⚠️ ' + texto, 'error');
        return;
    }

    // 6.6: refrigerio mínimo y jornada máxima semanal (advertencia, el usuario decide).
    const avisos = window.HorarioValidacion.advertenciasProcedimiento(dias, { tipo: sol.tipo, vigente });
    if (avisos.length && !confirm('El horario propuesto no cumple lo indicado en 6.6 del procedimiento:\n\n• ' + avisos.join('\n• ') + '\n\n¿Registrarlo de todos modos?')) return;

    const diasActivos = dias.filter(d => d.activo);
    const payload = window.HorarioModel.construirPayloadGrupo({
        personal: window.personalSeleccionado,
        fechaInicio, fechaFin, diasActivos,
        observacion: window.HorarioUI.leerObservacion(),
        tipo: sol.tipo, motivos: window.HorarioUI.leerMotivos(),
        solicitadoPor: sol.solicitadoPor, jefe: sol.jefe,
        fechaSolicitud: sol.fechaSolicitud, conformidad: sol.conformidad, sustentos: sol.sustentos,
        idGrupo: horarioIdGrupoEnEdicion
    });

    const btnGuardar = document.querySelector('#modalHorarios .btn-primary');
    if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

    try {
        const result = horarioIdGrupoEnEdicion
            ? await window.HorarioAPI.actualizar(horarioIdGrupoEnEdicion, payload)
            : await window.HorarioAPI.crear(payload);

        if (result.success) {
            window.toast(horarioIdGrupoEnEdicion ? '✅ Horario actualizado correctamente' : '✅ Horario semanal registrado correctamente', 'success');
            // Cada cambio de horario NUEVO genera su Solicitud en Excel (formato INS-DRH-F-28.01).
            const idNuevo = (result.data && result.data.ID_GRUPO) || null;
            const codeEmp = window.personalSeleccionado.CODE;
            // Temporal: al concluir el rango vuelve el horario anterior COMPLETO (nuevo registro).
            if (esNuevo && sol.tipo === 'Temporal' && sol.restablecer) {
                await horarioCrearRestablecimiento({ vigente, idTemporal: idNuevo, fechaFin, sol });
            }
            window.cerrarModalHorarios();
            if (esNuevo && idNuevo) await window.generarSolicitudHorario(codeEmp, idNuevo);
        } else {
            window.toast('❌ ' + (result.message || 'No se pudo guardar el horario'), 'error');
        }
    } finally {
        if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.innerHTML = '<i class="fas fa-check"></i> <span id="horarioBtnGuardarTexto">' + (horarioIdGrupoEnEdicion ? 'Actualizar Horario' : 'Guardar Horario') + '</span>'; }
    }
};

// ============================================================
// ELIMINAR
// ============================================================
// Función única de borrado: la usan tanto el botón "Eliminar" del
// formulario (solo visible en modo edición, actúa sobre
// horarioIdGrupoEnEdicion) como el botón de papelera de cada fila
// del panel "Horarios registrados" (actúa sobre CUALQUIER grupo,
// esté o no siendo editado en ese momento).

window.eliminarGrupoHorario = async function(idGrupo) {
    if (!idGrupo) return;
    if (!confirm(`¿Eliminar el horario ${idGrupo}? Esta acción no se puede deshacer.`)) return;

    const result = await window.HorarioAPI.eliminar(idGrupo);
    if (!result.success) {
        window.toast('❌ ' + (result.message || 'No se pudo eliminar el horario'), 'error');
        return;
    }

    window.toast('🗑️ Horario eliminado', 'success');

    // Si justo se eliminó el grupo que estaba abierto en el
    // formulario, se sale del modo edición para no dejar en pantalla
    // datos de un horario que ya no existe.
    if (horarioIdGrupoEnEdicion === idGrupo) {
        horarioIdGrupoEnEdicion = null;
        window.HorarioUI.limpiarFormulario();
        window.HorarioUI.setModoFormulario(false);
    }

    // El modal se queda abierto (no se cierra): solo se refresca el
    // panel de la lista, para poder seguir viendo/gestionando el
    // resto de horarios del empleado sin tener que reabrir el modal.
    await window.horarioCargarGruposExistentes();
};

// Botón "Eliminar" dentro del formulario (visible solo en modo
// edición): delega en la función compartida de arriba.
window.eliminarHorarioGrupoActual = async function() {
    if (!horarioIdGrupoEnEdicion) return;
    await window.eliminarGrupoHorario(horarioIdGrupoEnEdicion);
};


// ============================================================
// RESTABLECIMIENTO tras un horario TEMPORAL
// ============================================================
// Al terminar el rango del temporal se crea un registro nuevo con el horario anterior completo
// (desde el día siguiente a la fecha fin). Así, ese pasa a ser el vigente y el anterior queda histórico.
async function horarioCrearRestablecimiento({ vigente, idTemporal, fechaFin, sol }) {
    if (!vigente || !fechaFin) {
        window.toast('⚠️ No hay horario anterior que restablecer: el temporal se guardó sin restablecimiento', 'warning');
        return;
    }
    const M = window.HorarioModel;
    const dias = (vigente.DIAS || []).map(d => ({ dia: d.dia, activo: true, ingreso: d.ingreso, inicioRef: d.inicioRef || '', finRef: d.finRef || '', salida: d.salida }));
    const payload = M.construirPayloadGrupo({
        personal: window.personalSeleccionado,
        fechaInicio: M.diaSiguienteISO(fechaFin), fechaFin: '',
        diasActivos: dias,
        observacion: `Restablecimiento automático del horario anterior (${vigente.ID_GRUPO}) al concluir el horario temporal ${idTemporal || ''} el ${M.fechaATextoLegible(fechaFin)}.`,
        tipo: vigente.TIPO_HORARIO || 'Permanente',
        motivos: vigente.MOTIVOS ? String(vigente.MOTIVOS).split(',') : [],
        solicitadoPor: sol.solicitadoPor, jefe: sol.jefe, fechaSolicitud: sol.fechaSolicitud,
        conformidad: sol.conformidad, sustentos: ['Restablecimiento del horario anterior al concluir el horario temporal.']
    });
    const r = await window.HorarioAPI.crear(payload);
    window.toast(r.success ? '🔁 Se programó el restablecimiento del horario anterior' : '⚠️ El temporal se guardó, pero no se pudo programar el restablecimiento: ' + (r.message || ''), r.success ? 'success' : 'warning');
}

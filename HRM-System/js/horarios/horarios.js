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
    window.HorarioUI.setModoFormulario(false);

    const empleadoInput = document.getElementById('horarioEmpleado');
    if (empleadoInput) {
        empleadoInput.value = window.formatearPersonalSeleccionado(window.personalSeleccionado);
    }

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

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
    const grupos = (result.success && Array.isArray(result.data)) ? result.data : [];
    window.HorarioUI.renderGruposExistentes(grupos, horarioIdGrupoEnEdicion);

    const cont = document.getElementById('horarioGruposExistentes');
    if (cont) {
        // El modal SOLO entra en modo edición cuando se hace clic en
        // uno de estos botones "Editar". Abrir el modal (nuevo) o
        // presionar "Nuevo horario" nunca dispara esto por su cuenta:
        // ambos casos limpian horarioIdGrupoEnEdicion a null primero.
        cont.querySelectorAll('[data-accion="editar-grupo"]').forEach(btn => {
            btn.addEventListener('click', () => window.editarGrupoHorario(btn.dataset.idGrupo));
        });
        // Descargar/copiar operan sobre el grupo YA cargado en memoria
        // (result.data), sin volver a pedirlo al backend.
        cont.querySelectorAll('[data-accion="descargar-grupo"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const grupo = grupos.find(g => g.ID_GRUPO === btn.dataset.idGrupo);
                if (grupo) window.HorarioExport.descargarGrupo(grupo);
            });
        });
        cont.querySelectorAll('[data-accion="copiar-grupo"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const grupo = grupos.find(g => g.ID_GRUPO === btn.dataset.idGrupo);
                if (grupo) window.HorarioExport.copiarGrupo(grupo);
            });
        });
    }
};

window.nuevoHorarioDesdeExistente = function() {
    horarioIdGrupoEnEdicion = null;
    window.HorarioUI.limpiarFormulario();
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

    // <input type="date"> exige exactamente "YYYY-MM-DD": si llega un
    // ISO con hora (backend aún no republicado, ver nota en
    // horario-model.js/fechaATextoLegible) el input lo rechaza y
    // queda vacío en silencio. Se recorta a los primeros 10
    // caracteres para tolerar ambos casos.
    document.getElementById('horarioFechaInicio').value = (grupo.FECHA_INICIO || '').slice(0, 10);
    document.getElementById('horarioFechaFin').value = (grupo.FECHA_FIN || '').slice(0, 10);
    window.HorarioUI.pintarDiasEnTabla(grupo.DIAS);
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
    const fechaFin = document.getElementById('horarioFechaFin')?.value || '';
    const dias = window.HorarioUI.leerFilas();

    const errores = window.HorarioValidacion.validarGrupo({ fechaInicio, fechaFin, dias });
    if (errores.length > 0) {
        const texto = 'Falta completar: ' + errores.join('; ');
        window.HorarioUI.mostrarError(texto);
        window.toast('⚠️ ' + texto, 'error');
        return;
    }

    const diasActivos = dias.filter(d => d.activo);
    const payload = window.HorarioModel.construirPayloadGrupo({
        personal: window.personalSeleccionado,
        fechaInicio, fechaFin, diasActivos,
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
            window.cerrarModalHorarios();
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

window.eliminarHorarioGrupoActual = async function() {
    if (!horarioIdGrupoEnEdicion) return;
    if (!confirm(`¿Eliminar el horario ${horarioIdGrupoEnEdicion}? Esta acción no se puede deshacer.`)) return;

    const result = await window.HorarioAPI.eliminar(horarioIdGrupoEnEdicion);
    if (result.success) {
        window.toast('🗑️ Horario eliminado', 'success');
        window.cerrarModalHorarios();
    } else {
        window.toast('❌ ' + (result.message || 'No se pudo eliminar el horario'), 'error');
    }
};

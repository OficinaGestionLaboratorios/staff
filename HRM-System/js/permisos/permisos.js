// ============================================================
// PERMISOS.JS — Orquestador del módulo Permisos
// ============================================================
// No calcula, no valida ni pinta directamente: delega en
// window.PermisosModel / PermisosValidacion / PermisosAPI / PermisosUI.
//
// A diferencia de Sobretiempo, es de UNA SOLA FASE: se abre el
// modal, se registra la boleta (o se edita/elimina una existente) y
// se exporta — no hay una "Fase 2" que confirmar después.
// ============================================================

let permisoIdEnEdicion = null; // null = nueva boleta

// ============================================================
// ABRIR / CERRAR MODAL
// ============================================================

window.abrirModalPermisos = async function() {
    if (!window.personalSeleccionado) {
        window.toast('⚠️ Primero selecciona un empleado en la Lista de Personal', 'warning');
        return;
    }

    const modal = document.getElementById('modalPermisos');
    if (!modal) return;

    permisoIdEnEdicion = null;
    window.PermisosUI.inicializarClaseChips();
    window.PermisosUI.limpiar();
    window.PermisosUI.setModo(false);

    const empleadoInput = document.getElementById('permisoEmpleado');
    if (empleadoInput) empleadoInput.value = window.formatearPersonalSeleccionado(window.personalSeleccionado);

    // DEPENDENCIA es fija para todas las boletas de este sistema: ya
    // no se toma del LUGAR_TRABAJO del empleado (campo anulado), el
    // input queda readonly en el HTML.
    const dependenciaInput = document.getElementById('permisoDependencia');
    if (dependenciaInput) {
        dependenciaInput.value = 'OFICINA DE GESTIÓN DE LABORATORIO- OGL';
    }

    // El "funcionario que expide" suele ser quien está usando el
    // sistema en ese momento: si su nombre coincide con uno de los 2
    // predefinidos, se preselecciona (con su cargo ya bloqueado); si
    // no, cae en "Otro" con el nombre sugerido, editable. Solo se
    // sugiere la PRIMERA vez (si ya hay algo seleccionado, se
    // respeta — ver el comentario en PermisosUI.limpiar()).
    const selectFuncionario = document.getElementById('permisoFuncionarioSelect');
    if (selectFuncionario && !selectFuncionario.value) {
        const nombreSesion = window.AUTH?.getNombre?.() || '';
        if (nombreSesion) window.PermisosUI.pintarFuncionario(nombreSesion, '');
    }

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    window.EstadoCarga?.iniciar('permisos');
    await window.permisosCargarLista();
};

window.cerrarModalPermisos = function() {
    const modal = document.getElementById('modalPermisos');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    permisoIdEnEdicion = null;
};

// ============================================================
// PANEL "BOLETAS DE ESTE EMPLEADO"
// ============================================================

window.permisosCargarLista = async function() {
    const result = await window.PermisosAPI.listar(window.personalSeleccionado.CODE);
    const registros = (result.success && Array.isArray(result.data)) ? result.data : [];
    window.EstadoCarga?.finalizar('permisos', registros.length, !!result.success);
    window.PermisosUI.renderLista(registros, permisoIdEnEdicion);

    const cont = document.getElementById('permisosLista');
    if (!cont) return;

    const porId = id => registros.find(r => r.ID_PERMISO === id);
    window.AccionesRegistro.enlazar(cont, {
        editar: id => window.permisoEditar(id),
        exportar: id => { const r = porId(id); if (r) window.PermisosExportDOCX.generar(r); },
        copiar: id => { const r = porId(id); if (r) window.AccionesRegistro.copiar(window.permisoTexto(r)); },
        correo: id => { const r = porId(id); if (r) window.permisoAbrirCorreo(r); },
        eliminar: id => window.permisoEliminar(id)
    });
};

window.permisoFilas = function(r) {
    const f = window.PermisosModel.fechaATextoLegible;
    return [
        ['Trabajador', r.EMPLEADO || window.formatearPersonalSeleccionado(window.personalSeleccionado)],
        ['Boleta', r.ID_PERMISO], ['Clase de permiso', r.CLASE_PERMISO + (r.OTRA_ESPECIFICAR ? ` – ${r.OTRA_ESPECIFICAR}` : '')],
        ['Fecha', f(r.FECHA_PERMISO)], ['Hora de salida', r.HORA_SALIDA], ['Hora de retorno', r.HORA_RETORNO],
        ['Duración', r.DURACION_TOTAL ? `${r.DURACION_TOTAL} h` : ''], ['Motivo', r.MOTIVO_SALIDA],
        ['Lugar de destino', r.LUGAR_DESTINO], ['Detalle de capacitación', r.CAPACITACION_DETALLE], ['Estado', r.ESTADO]
    ];
};
window.permisoTexto = r => window.AccionesRegistro.filasATexto(`Permiso ${r.ID_PERMISO} — ${r.EMPLEADO || ''}`, window.permisoFilas(r));
window.permisoAbrirCorreo = function(r) {
    window.AccionesRegistro.abrirCorreoRegistro({
        clave: 'permisos', titulo: 'Correo de permiso',
        asunto: `Permiso ${r.CLASE_PERMISO || ''} ${window.PermisosModel.fechaATextoLegible(r.FECHA_PERMISO)} – ${r.EMPLEADO || ''}`.replace(/\s+/g, ' ').trim(),
        intro: 'Por medio del presente, remito el detalle del permiso:', filas: window.permisoFilas(r)
    });
};

window.permisoNuevo = function() {
    permisoIdEnEdicion = null;
    window.PermisosUI.limpiar();
    window.PermisosUI.setModo(false);
    window.permisosCargarLista();
};

// ============================================================
// CREAR / EDITAR
// ============================================================

window.permisoEditar = async function(idPermiso) {
    const result = await window.PermisosAPI.obtener(idPermiso);
    if (!result.success || !result.data) {
        window.toast('❌ ' + (result.message || 'No se pudo cargar la boleta'), 'error');
        return;
    }

    permisoIdEnEdicion = idPermiso;
    window.PermisosUI.pintar(result.data);
    window.PermisosUI.setModo(true);

    await window.permisosCargarLista();
    window.toast(`✏️ Editando boleta ${idPermiso}`, 'success');
};

window.guardarPermiso = async function() {
    window.PermisosUI.mostrarError('');

    if (!window.personalSeleccionado) {
        window.toast('⚠️ No hay empleado seleccionado', 'error');
        return;
    }

    const datos = window.PermisosUI.leer();
    const errores = window.PermisosValidacion.validar({ personal: window.personalSeleccionado, ...datos });
    if (errores.length > 0) {
        const texto = 'Falta completar: ' + errores.join('; ');
        window.PermisosUI.mostrarError(texto);
        window.toast('⚠️ ' + texto, 'error');
        return;
    }

    // Hora de salida y de retorno ya no son obligatorias (ver
    // PermisosValidacion). Si alguna quedó vacía, se avisa con un
    // mensaje de confirmación y, solo si el usuario acepta, se
    // guarda "S/R" (Sin Registrar) en su lugar — en ambos campos
    // por igual. Si cancela, no se guarda nada y vuelve al formulario.
    if (!datos.horaSalida || !datos.horaRetorno) {
        const faltantes = [];
        if (!datos.horaSalida) faltantes.push('la hora de salida');
        if (!datos.horaRetorno) faltantes.push('la hora de retorno');
        const continuar = confirm(
            `No se ha registrado ${faltantes.join(' ni ')}. En la boleta aparecerá como "sin registro". ¿Deseas continuar?`
        );
        if (!continuar) return;
        if (!datos.horaSalida) datos.horaSalida = 'S/R';
        if (!datos.horaRetorno) datos.horaRetorno = 'S/R';
    }

    const payload = window.PermisosModel.construirPayload({
        personal: window.personalSeleccionado,
        ...datos,
        idPermiso: permisoIdEnEdicion
    });

    const btn = document.getElementById('permisoBtnGuardar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

    try {
        const result = permisoIdEnEdicion
            ? await window.PermisosAPI.actualizar(permisoIdEnEdicion, payload)
            : await window.PermisosAPI.crear(payload);

        if (result.success) {
            window.toast(permisoIdEnEdicion
                ? '✅ Boleta actualizada correctamente'
                : '✅ Boleta de permiso registrada', 'success');
            permisoIdEnEdicion = null;
            window.PermisosUI.limpiar();
            window.PermisosUI.setModo(false);
            await window.permisosCargarLista();
        } else {
            window.toast('❌ ' + (result.message || 'No se pudo guardar la boleta'), 'error');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> <span id="permisoBtnTexto">' + (permisoIdEnEdicion ? 'Actualizar boleta' : 'Guardar boleta') + '</span>'; }
    }
};

// ============================================================
// ELIMINAR
// ============================================================

window.permisoEliminar = async function(idPermiso) {
    if (!idPermiso) return;
    if (!confirm(`¿Eliminar la boleta ${idPermiso}? Esta acción no se puede deshacer.`)) return;

    const result = await window.PermisosAPI.eliminar(idPermiso);
    if (!result.success) {
        window.toast('❌ ' + (result.message || 'No se pudo eliminar la boleta'), 'error');
        return;
    }

    window.toast('🗑️ Boleta eliminada', 'success');

    if (permisoIdEnEdicion === idPermiso) {
        permisoIdEnEdicion = null;
        window.PermisosUI.limpiar();
        window.PermisosUI.setModo(false);
    }

    await window.permisosCargarLista();
};

// Atajo del botón "Eliminar" del footer (solo visible cuando se está
// editando una boleta existente, igual que sobretiempoBtnEliminar).
window.permisoEliminarDesdeFooter = async function() {
    if (!permisoIdEnEdicion) return;
    await window.permisoEliminar(permisoIdEnEdicion);
};

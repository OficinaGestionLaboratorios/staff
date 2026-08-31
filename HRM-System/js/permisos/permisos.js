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

    const dependenciaInput = document.getElementById('permisoDependencia');
    if (dependenciaInput && !dependenciaInput.value) {
        dependenciaInput.value = window.personalSeleccionado.LUGAR_TRABAJO || '';
    }

    // El "funcionario que expide" suele ser quien está usando el
    // sistema en ese momento: se sugiere el nombre de la sesión
    // activa, pero queda editable por si lo expide otra persona.
    const funcionarioInput = document.getElementById('permisoFuncionarioExpide');
    if (funcionarioInput && !funcionarioInput.value) {
        funcionarioInput.value = window.AUTH?.getNombre?.() || '';
    }

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

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
    window.PermisosUI.renderLista(registros, permisoIdEnEdicion);

    const cont = document.getElementById('permisosLista');
    if (!cont) return;

    cont.querySelectorAll('[data-accion="editar-permiso"]').forEach(btn => {
        btn.addEventListener('click', () => window.permisoEditar(btn.dataset.id));
    });
    cont.querySelectorAll('[data-accion="exportar-permiso"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const registro = registros.find(r => r.ID_PERMISO === btn.dataset.id);
            if (registro) window.PermisosExportXLSX.generar(registro);
        });
    });
    cont.querySelectorAll('[data-accion="eliminar-permiso"]').forEach(btn => {
        btn.addEventListener('click', () => window.permisoEliminar(btn.dataset.id));
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

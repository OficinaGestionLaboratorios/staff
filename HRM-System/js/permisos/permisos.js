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

// (v144) Horario (jornada) del empleado seleccionado, para completar la hora de salida o de retorno que no se marcó.
// Se guarda en window.__permisoHorarios = { code, grupos, t } y se reutiliza durante 60 s.
window.permisoCargarHorarios = async function(forzar) {
    const code = window.personalSeleccionado && window.personalSeleccionado.CODE;
    if (!code || !window.HorarioAPI) return [];
    const c = window.__permisoHorarios;
    if (!forzar && c && c.code === code && Date.now() - c.t < 60000) return c.grupos;
    let grupos = [];
    try {
        const res = await window.HorarioAPI.listar(code);
        grupos = (res && res.success && Array.isArray(res.data)) ? res.data : [];
    } catch (e) { grupos = []; }
    window.__permisoHorarios = { code, grupos, t: Date.now() };
    return grupos;
};

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
    // (v144) Precarga la jornada del empleado (sin esperar) para calcular la duración al instante.
    window.permisoCargarHorarios(true).then(() => window.PermisosUI.actualizarDuracion());
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
        ['Duración', window.PermisosModel.duracionHM(window.PermisosModel.duracionDe(r)) ? `${window.PermisosModel.duracionHM(window.PermisosModel.duracionDe(r))} h` : ''], ['Motivo', r.MOTIVO_SALIDA],
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

    // (v144) Hora de salida y de retorno no son obligatorias. Si alguna quedó vacía se toma la de la jornada
    // laboral de ese día: sin salida → hora de INGRESO de la jornada; sin retorno → hora de SALIDA de la
    // jornada. Se guarda como "HH:MM (no registro)" y la duración se calcula con ellas. Solo si ese día no
    // tiene horario registrado se cae al comportamiento anterior ("S/R" = sin registro, tras confirmar).
    if (!datos.horaSalida || !datos.horaRetorno) {
        const grupos = await window.permisoCargarHorarios();
        const comp = window.PermisosModel.completarHoras({ grupos, fecha: datos.fechaPermiso, horaSalida: datos.horaSalida, horaRetorno: datos.horaRetorno });
        if (comp.ok) {
            datos.horaSalida = comp.horaSalida;
            datos.horaRetorno = comp.horaRetorno;
        } else if (comp.error) {
            const texto = 'Revisa las horas: ' + comp.error;
            window.PermisosUI.mostrarError(texto);
            window.toast('⚠️ ' + texto, 'error');
            return;
        } else {
            const faltantes = [];
            if (!datos.horaSalida) faltantes.push('la hora de salida');
            if (!datos.horaRetorno) faltantes.push('la hora de retorno');
            const continuar = confirm(
                `No se ha registrado ${faltantes.join(' ni ')} y el trabajador no tiene horario registrado para ese día, por lo que no se puede tomar la hora de su jornada. En la boleta aparecerá como "sin registro". ¿Deseas continuar?`
            );
            if (!continuar) return;
            if (!datos.horaSalida) datos.horaSalida = 'S/R';
            if (!datos.horaRetorno) datos.horaRetorno = 'S/R';
        }
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

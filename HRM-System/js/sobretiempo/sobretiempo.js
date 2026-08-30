// ============================================================
// SOBRETIEMPO.JS — Orquestador del módulo Sobretiempo
// ============================================================
// No calcula, no valida ni pinta directamente: delega en
// window.SobretiempoModel / SobretiempoValidacion / SobretiempoAPI /
// SobretiempoUI. Coordina el flujo de DOS fases:
//
//   abrir modal (selecciona empleado en Lista de Personal, igual que
//   Horarios) → lista de solicitudes del empleado →
//     ├─ "Nueva solicitud" / "Editar" → FASE 1 (generación de horas)
//     └─ "Registrar descanso" → FASE 2 (descanso compensatorio)
//         → recién aquí ESTADO pasa a "Completo" y se habilita
//           "Exportar" (ver sobretiempo-export-xlsx.js).
// ============================================================

let sobretiempoIdEnEdicion = null;   // Fase 1: null = nueva solicitud
let sobretiempoIdParaDescanso = null; // Fase 2: ID_SOLICITUD activo

// ============================================================
// ABRIR / CERRAR MODAL
// ============================================================

window.abrirModalSobretiempo = async function() {
    if (!window.personalSeleccionado) {
        window.toast('⚠️ Primero selecciona un empleado en la Lista de Personal', 'warning');
        return;
    }

    const modal = document.getElementById('modalSobretiempo');
    if (!modal) return;

    sobretiempoIdEnEdicion = null;
    sobretiempoIdParaDescanso = null;
    window.SobretiempoUI.inicializarTipoChips();
    window.SobretiempoUI.inicializarTablaFechas();   // <-- NUEVA
    window.SobretiempoUI.limpiarFase1();
    window.SobretiempoUI.setModoFase1(false);
    window.SobretiempoUI.mostrarFormFase1();

    const empleadoInput = document.getElementById('sobretiempoEmpleado');
    if (empleadoInput) empleadoInput.value = window.formatearPersonalSeleccionado(window.personalSeleccionado);

    const dependenciaInput = document.getElementById('sobretiempoDependencia');
    if (dependenciaInput && !dependenciaInput.value) {
        const p = window.personalSeleccionado;
        dependenciaInput.value = p.DEPENDENCIA || p.LUGAR_TRABAJO || p.CARGO || '';
    }

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    await window.sobretiempoCargarLista();
};

window.cerrarModalSobretiempo = function() {
    const modal = document.getElementById('modalSobretiempo');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    sobretiempoIdEnEdicion = null;
    sobretiempoIdParaDescanso = null;
};

// ============================================================
// PANEL "SOLICITUDES DE ESTE EMPLEADO"
// ============================================================

window.sobretiempoCargarLista = async function() {
    const result = await window.SobretiempoAPI.listar(window.personalSeleccionado.CODE);
    const registros = (result.success && Array.isArray(result.data)) ? result.data : [];
    window.SobretiempoUI.renderLista(registros, sobretiempoIdEnEdicion || sobretiempoIdParaDescanso);

    const cont = document.getElementById('sobretiempoLista');
    if (!cont) return;

    cont.querySelectorAll('[data-accion="editar-solicitud"]').forEach(btn => {
        btn.addEventListener('click', () => window.sobretiempoEditarSolicitud(btn.dataset.id));
    });
    cont.querySelectorAll('[data-accion="registrar-descanso"]').forEach(btn => {
        btn.addEventListener('click', () => window.sobretiempoAbrirFase2(btn.dataset.id));
    });
    cont.querySelectorAll('[data-accion="ver-solicitud"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const registro = registros.find(r => r.ID_SOLICITUD === btn.dataset.id);
            if (registro) window.sobretiempoVerCompleto(registro);
        });
    });
    cont.querySelectorAll('[data-accion="exportar-solicitud"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const registro = registros.find(r => r.ID_SOLICITUD === btn.dataset.id);
            if (registro) window.SobretiempoExportXLSX.generar(registro);
        });
    });
    cont.querySelectorAll('[data-accion="eliminar-solicitud"]').forEach(btn => {
        btn.addEventListener('click', () => window.sobretiempoEliminar(btn.dataset.id));
    });
};

window.sobretiempoNuevaSolicitud = function() {
    sobretiempoIdEnEdicion = null;
    window.SobretiempoUI.limpiarFase1();
    window.SobretiempoUI.setModoFase1(false);
    window.SobretiempoUI.ocultarFormFase2();
    sobretiempoIdParaDescanso = null;
    window.sobretiempoCargarLista();
};

// Muestra un resumen de solo lectura de una solicitud ya Completa
// (no tiene sentido reabrir Fase 1: ya no es editable una vez que
// tiene descanso registrado, ver updateSobretiempo en el backend).
window.sobretiempoVerCompleto = function(registro) {
    const M = window.SobretiempoModel;
    window.toast(
        `📋 ${registro.ID_SOLICITUD}: ${registro.TIPO_TRABAJO} el ${M.fechaATextoLegible(registro.FECHA_EJECUCION)} ` +
        `(${registro.TOTAL_HORAS}h) — descanso tomado el ${M.fechaATextoLegible(registro.FECHA_DESCANSO)} (${registro.TOTAL_HORAS_EFECTIVAS}h efectivas)`,
        'info'
    );
};

// ============================================================
// FASE 1 — GENERACIÓN DE HORAS
// ============================================================

window.sobretiempoEditarSolicitud = async function(idSolicitud) {
    const result = await window.SobretiempoAPI.obtener(idSolicitud);
    if (!result.success || !result.data) {
        window.toast('❌ ' + (result.message || 'No se pudo cargar la solicitud'), 'error');
        return;
    }

    sobretiempoIdEnEdicion = idSolicitud;
    window.SobretiempoUI.ocultarFormFase2();
    window.SobretiempoUI.pintarFase1(result.data);
    window.SobretiempoUI.setModoFase1(true);
    window.SobretiempoUI.mostrarErrorFase1('');

    await window.sobretiempoCargarLista();
    window.toast(`✏️ Editando solicitud ${idSolicitud}`, 'success');
};

window.guardarSobretiempoFase1 = async function() {
    window.SobretiempoUI.mostrarErrorFase1('');

    if (!window.personalSeleccionado) {
        window.toast('⚠️ No hay empleado seleccionado', 'error');
        return;
    }

    const datos = window.SobretiempoUI.leerFase1();
    const errores = window.SobretiempoValidacion.validarFase1({ personal: window.personalSeleccionado, ...datos });
    if (errores.length > 0) {
        const texto = 'Falta completar: ' + errores.join('; ');
        window.SobretiempoUI.mostrarErrorFase1(texto);
        window.toast('⚠️ ' + texto, 'error');
        return;
    }

    const payload = window.SobretiempoModel.construirPayloadFase1({
        personal: window.personalSeleccionado,
        ...datos,
        idSolicitud: sobretiempoIdEnEdicion
    });

    const btn = document.getElementById('sobretiempoBtnFase1');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

    try {
        const result = sobretiempoIdEnEdicion
            ? await window.SobretiempoAPI.actualizar(sobretiempoIdEnEdicion, payload)
            : await window.SobretiempoAPI.crear(payload);

        if (result.success) {
            window.toast(sobretiempoIdEnEdicion
                ? '✅ Solicitud actualizada correctamente'
                : '✅ Registrado. Queda pendiente el registro del descanso compensatorio.', 'success');
            sobretiempoIdEnEdicion = null;
            window.SobretiempoUI.limpiarFase1();
            window.SobretiempoUI.setModoFase1(false);
            await window.sobretiempoCargarLista();
        } else {
            window.toast('❌ ' + (result.message || 'No se pudo guardar la solicitud'), 'error');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> <span id="sobretiempoBtnFase1Texto">' + (sobretiempoIdEnEdicion ? 'Actualizar solicitud' : 'Guardar solicitud') + '</span>'; }
    }
};

// ============================================================
// FASE 2 — REGISTRAR EL DESCANSO COMPENSATORIO
// ============================================================
// Aquí se completa la Sección III del formato oficial (opcional:
// "solo de ser necesario", según INS-DRH-F-30.01). El botón
// "Exportar" ya está disponible desde que se crea la solicitud (Fase
// 1) para el trámite de firmas de las Secciones I y II — no depende
// de esta fase (ver sobretiempo-export-xlsx.js). Registrar el
// descanso aquí solo agrega los datos de la Sección III al Excel y
// cambia el ESTADO a "Completo".

window.sobretiempoAbrirFase2 = async function(idSolicitud) {
    const result = await window.SobretiempoAPI.obtener(idSolicitud);
    if (!result.success || !result.data) {
        window.toast('❌ ' + (result.message || 'No se pudo cargar la solicitud'), 'error');
        return;
    }

    sobretiempoIdParaDescanso = idSolicitud;
    window.sobretiempoRegistroFase2Actual = result.data;
    window.SobretiempoUI.mostrarFormFase2(result.data);
    await window.sobretiempoCargarLista();
};

window.sobretiempoCancelarFase2 = function() {
    sobretiempoIdParaDescanso = null;
    window.sobretiempoRegistroFase2Actual = null;
    window.SobretiempoUI.ocultarFormFase2();
    window.sobretiempoCargarLista();
};

window.guardarSobretiempoFase2 = async function() {
    window.SobretiempoUI.mostrarErrorFase2('');

    if (!sobretiempoIdParaDescanso) {
        window.toast('⚠️ No hay solicitud seleccionada', 'error');
        return;
    }

    const datos = window.SobretiempoUI.leerFase2();
    const errores = window.SobretiempoValidacion.validarFase2({
        ...datos,
        fechaEjecucion: window.sobretiempoRegistroFase2Actual?.FECHA_EJECUCION || ''
    });
    if (errores.length > 0) {
        const texto = 'Falta completar: ' + errores.join('; ');
        window.SobretiempoUI.mostrarErrorFase2(texto);
        window.toast('⚠️ ' + texto, 'error');
        return;
    }

    const payload = window.SobretiempoModel.construirPayloadFase2({ idSolicitud: sobretiempoIdParaDescanso, ...datos });

    const btn = document.getElementById('sobretiempoBtnFase2');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

    try {
        const result = await window.SobretiempoAPI.registrarDescanso(payload);
        if (result.success) {
            window.toast('✅ Descanso registrado — la solicitud ya está completa y lista para exportar', 'success');
            sobretiempoIdParaDescanso = null;
            window.sobretiempoRegistroFase2Actual = null;
            window.SobretiempoUI.ocultarFormFase2();
            await window.sobretiempoCargarLista();
        } else {
            window.toast('❌ ' + (result.message || 'No se pudo registrar el descanso'), 'error');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Guardar descanso'; }
    }
};

// ============================================================
// ELIMINAR
// ============================================================

window.sobretiempoEliminar = async function(idSolicitud) {
    if (!idSolicitud) return;
    if (!confirm(`¿Eliminar la solicitud ${idSolicitud}? Esta acción no se puede deshacer.`)) return;

    const result = await window.SobretiempoAPI.eliminar(idSolicitud);
    if (!result.success) {
        window.toast('❌ ' + (result.message || 'No se pudo eliminar la solicitud'), 'error');
        return;
    }

    window.toast('🗑️ Solicitud eliminada', 'success');

    if (sobretiempoIdEnEdicion === idSolicitud) {
        sobretiempoIdEnEdicion = null;
        window.SobretiempoUI.limpiarFase1();
        window.SobretiempoUI.setModoFase1(false);
    }
    if (sobretiempoIdParaDescanso === idSolicitud) {
        sobretiempoIdParaDescanso = null;
        window.SobretiempoUI.ocultarFormFase2();
    }

    await window.sobretiempoCargarLista();
};

// Atajo del botón "Eliminar" del footer (solo visible cuando se está
// editando una solicitud existente, igual que horarioBtnEliminar).
window.sobretiempoEliminarDesdeFooter = async function() {
    if (!sobretiempoIdEnEdicion) return;
    await window.sobretiempoEliminar(sobretiempoIdEnEdicion);
};

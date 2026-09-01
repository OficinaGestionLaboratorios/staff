// ============================================================
// VACACIONES.JS — Orquestador del módulo Vacaciones
// ============================================================
// No calcula, no valida ni pinta directamente: delega en
// window.VacacionesModel / VacacionesValidacion / VacacionesAPI /
// VacacionesUI. Coordina el flujo de DOS fases (mismo patrón que
// Sobretiempo):
//
//   abrir modal (selecciona empleado en Lista de Personal) →
//   lista de períodos vacacionales del empleado →
//     ├─ "Nuevo período" / "Editar" → FASE 1 (asigna días + fecha límite)
//     └─ "Registrar goce" → FASE 2 (tramo de vacaciones tomado)
//         → se puede llamar VARIAS veces por período: cada tramo se
//           DESCUENTA hasta agotar el saldo. El ESTADO pasa de
//           "Pendiente de goce" → "Goce parcial" → "Agotado" (o
//           "Vencido" si se pasa la fecha límite con saldo pendiente).
// ============================================================

let vacacionIdEnEdicion = null;   // Fase 1: null = nuevo período
let vacacionIdParaGoce = null;    // Fase 2: ID_VACACION activo

// ============================================================
// ABRIR / CERRAR MODAL
// ============================================================

window.abrirModalVacaciones = async function() {
    if (!window.personalSeleccionado) {
        window.toast('⚠️ Primero selecciona un empleado en la Lista de Personal', 'warning');
        return;
    }

    const modal = document.getElementById('modalVacaciones');
    if (!modal) return;

    vacacionIdEnEdicion = null;
    vacacionIdParaGoce = null;
    window.VacacionesUI.limpiarFase1();
    window.VacacionesUI.setModoFase1(false);
    window.VacacionesUI.mostrarFormFase1();

    const empleadoInput = document.getElementById('vacacionEmpleado');
    if (empleadoInput) empleadoInput.value = window.formatearPersonalSeleccionado(window.personalSeleccionado);

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    await window.vacacionesCargarLista();
};

window.cerrarModalVacaciones = function() {
    const modal = document.getElementById('modalVacaciones');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    vacacionIdEnEdicion = null;
    vacacionIdParaGoce = null;
};

// ============================================================
// PANEL "PERÍODOS DE ESTE EMPLEADO"
// ============================================================

window.vacacionesCargarLista = async function() {
    const result = await window.VacacionesAPI.listar(window.personalSeleccionado.CODE);
    const registros = (result.success && Array.isArray(result.data)) ? result.data : [];
    window.VacacionesUI.renderLista(registros, vacacionIdEnEdicion || vacacionIdParaGoce);

    const cont = document.getElementById('vacacionesLista');
    if (!cont) return;

    cont.querySelectorAll('[data-accion="editar-vacacion"]').forEach(btn => {
        btn.addEventListener('click', () => window.vacacionEditar(btn.dataset.id));
    });
    cont.querySelectorAll('[data-accion="registrar-goce"]').forEach(btn => {
        btn.addEventListener('click', () => window.vacacionAbrirFase2(btn.dataset.id));
    });
    cont.querySelectorAll('[data-accion="ver-vacacion"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const registro = registros.find(r => r.ID_VACACION === btn.dataset.id);
            if (registro) window.vacacionVerCompleto(registro);
        });
    });
    cont.querySelectorAll('[data-accion="eliminar-vacacion"]').forEach(btn => {
        btn.addEventListener('click', () => window.vacacionEliminar(btn.dataset.id));
    });
};

window.vacacionNuevoPeriodo = function() {
    vacacionIdEnEdicion = null;
    window.VacacionesUI.limpiarFase1();
    window.VacacionesUI.setModoFase1(false);
    window.VacacionesUI.ocultarFormFase2();
    vacacionIdParaGoce = null;
    window.vacacionesCargarLista();
};

// Resumen de solo lectura de un período ya Agotado (no tiene sentido
// reabrir Fase 1: una vez con goces registrados ya no es editable).
window.vacacionVerCompleto = function(registro) {
    window.toast(
        `📋 ${registro.ID_VACACION}: ${registro.PERIODO_VACACIONAL} — ` +
        `${registro.DIAS_ASIGNADOS} días asignados, ${registro.DIAS_TOMADOS} tomados en ${(registro.GOCES || []).length} tramo(s)`,
        'info'
    );
};

// ============================================================
// FASE 1 — REGISTRAR PERÍODO VACACIONAL (saldo)
// ============================================================

window.vacacionEditar = async function(idVacacion) {
    const result = await window.VacacionesAPI.obtener(idVacacion);
    if (!result.success || !result.data) {
        window.toast('❌ ' + (result.message || 'No se pudo cargar el período'), 'error');
        return;
    }

    vacacionIdEnEdicion = idVacacion;
    window.VacacionesUI.ocultarFormFase2();
    window.VacacionesUI.pintarFase1(result.data);
    window.VacacionesUI.setModoFase1(true);
    window.VacacionesUI.mostrarErrorFase1('');

    await window.vacacionesCargarLista();
    window.toast(`✏️ Editando período ${idVacacion}`, 'success');
};

window.guardarVacacionFase1 = async function() {
    window.VacacionesUI.mostrarErrorFase1('');

    if (!window.personalSeleccionado) {
        window.toast('⚠️ No hay empleado seleccionado', 'error');
        return;
    }

    const datos = window.VacacionesUI.leerFase1();
    const errores = window.VacacionesValidacion.validarFase1({ personal: window.personalSeleccionado, ...datos });
    if (errores.length > 0) {
        const texto = 'Falta completar: ' + errores.join('; ');
        window.VacacionesUI.mostrarErrorFase1(texto);
        window.toast('⚠️ ' + texto, 'error');
        return;
    }

    const payload = window.VacacionesModel.construirPayloadFase1({
        personal: window.personalSeleccionado,
        ...datos,
        idVacacion: vacacionIdEnEdicion
    });

    const btn = document.getElementById('vacacionBtnFase1');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

    try {
        const result = vacacionIdEnEdicion
            ? await window.VacacionesAPI.actualizar(vacacionIdEnEdicion, payload)
            : await window.VacacionesAPI.crear(payload);

        if (result.success) {
            window.toast(vacacionIdEnEdicion
                ? '✅ Período actualizado correctamente'
                : '✅ Período vacacional registrado. Queda pendiente el registro del goce.', 'success');
            vacacionIdEnEdicion = null;
            window.VacacionesUI.limpiarFase1();
            window.VacacionesUI.setModoFase1(false);
            await window.vacacionesCargarLista();
        } else {
            window.toast('❌ ' + (result.message || 'No se pudo guardar el período'), 'error');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> <span id="vacacionBtnFase1Texto">' + (vacacionIdEnEdicion ? 'Actualizar período' : 'Guardar período') + '</span>'; }
    }
};

// ============================================================
// FASE 2 — REGISTRAR GOCE DE VACACIONES (descuenta días, acumulable)
// ============================================================
// Se puede abrir y guardar varias veces para el mismo período hasta
// agotar el saldo asignado. Mientras quede saldo pendiente, al
// guardar la Fase 2 se vuelve a pintar (con el nuevo tramo ya
// sumado) para seguir registrando; solo se cierra automáticamente
// cuando el ESTADO pasa a "Agotado".

window.vacacionAbrirFase2 = async function(idVacacion) {
    const result = await window.VacacionesAPI.obtener(idVacacion);
    if (!result.success || !result.data) {
        window.toast('❌ ' + (result.message || 'No se pudo cargar el período'), 'error');
        return;
    }

    vacacionIdParaGoce = idVacacion;
    window.vacacionRegistroFase2Actual = result.data;
    window.VacacionesUI.mostrarFormFase2(result.data);
    await window.vacacionesCargarLista();
};

window.vacacionCancelarFase2 = function() {
    vacacionIdParaGoce = null;
    window.vacacionRegistroFase2Actual = null;
    window.VacacionesUI.ocultarFormFase2();
    window.vacacionesCargarLista();
};

window.guardarVacacionFase2 = async function() {
    window.VacacionesUI.mostrarErrorFase2('');

    if (!vacacionIdParaGoce) {
        window.toast('⚠️ No hay período seleccionado', 'error');
        return;
    }

    const datos = window.VacacionesUI.leerFase2();
    const errores = window.VacacionesValidacion.validarFase2({
        ...datos,
        diasPendientes: parseInt(window.vacacionRegistroFase2Actual?.DIAS_PENDIENTES, 10)
    });
    if (errores.length > 0) {
        const texto = 'Falta completar: ' + errores.join('; ');
        window.VacacionesUI.mostrarErrorFase2(texto);
        window.toast('⚠️ ' + texto, 'error');
        return;
    }

    const payload = window.VacacionesModel.construirPayloadFase2({ idVacacion: vacacionIdParaGoce, ...datos });

    const btn = document.getElementById('vacacionBtnFase2');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

    try {
        const result = await window.VacacionesAPI.registrarGoce(payload);
        if (result.success) {
            const estado = result.data?.ESTADO;
            if (estado === 'Agotado') {
                window.toast('✅ Goce registrado — el período ya no tiene días pendientes', 'success');
                vacacionIdParaGoce = null;
                window.vacacionRegistroFase2Actual = null;
                window.VacacionesUI.ocultarFormFase2();
            } else {
                window.toast(`✅ Goce registrado. Quedan ${result.data?.DIAS_PENDIENTES ?? '?'} día(s) pendientes.`, 'success');
                // Sigue en Fase 2: recarga el período (con el nuevo
                // goce ya incluido) para seguir registrando el
                // siguiente tramo, sin cerrar el formulario.
                await window.vacacionRecargarFase2();
            }
            await window.vacacionesCargarLista();
        } else {
            window.toast('❌ ' + (result.message || 'No se pudo registrar el goce'), 'error');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Guardar goce'; }
    }
};

// Vuelve a pedir el período activo de Fase 2 y repinta el formulario
// (usado tras registrar o eliminar un goce, para reflejar el saldo
// pendiente actualizado sin cerrar la Fase 2).
window.vacacionRecargarFase2 = async function() {
    if (!vacacionIdParaGoce) return;
    const actualizado = await window.VacacionesAPI.obtener(vacacionIdParaGoce);
    if (actualizado.success && actualizado.data) {
        window.vacacionRegistroFase2Actual = actualizado.data;
        window.VacacionesUI.mostrarFormFase2(actualizado.data);
    }
};

// Quita un goce ya registrado (botón 🗑 dentro del resumen de Fase 2).
// Sus días vuelven a quedar pendientes automáticamente.
window.vacacionEliminarGoce = async function(indice) {
    if (!vacacionIdParaGoce) return;
    if (!confirm('¿Quitar este goce registrado? Sus días volverán a quedar pendientes.')) return;

    const result = await window.VacacionesAPI.eliminarGoce(vacacionIdParaGoce, indice);
    if (!result.success) {
        window.toast('❌ ' + (result.message || 'No se pudo eliminar el goce'), 'error');
        return;
    }
    window.toast('🗑️ Goce eliminado', 'success');
    await window.vacacionRecargarFase2();
    await window.vacacionesCargarLista();
};

// ============================================================
// ELIMINAR PERÍODO
// ============================================================

window.vacacionEliminar = async function(idVacacion) {
    if (!idVacacion) return;
    if (!confirm(`¿Eliminar el período ${idVacacion}? Esta acción no se puede deshacer.`)) return;

    const result = await window.VacacionesAPI.eliminar(idVacacion);
    if (!result.success) {
        window.toast('❌ ' + (result.message || 'No se pudo eliminar el período'), 'error');
        return;
    }

    window.toast('🗑️ Período eliminado', 'success');

    if (vacacionIdEnEdicion === idVacacion) {
        vacacionIdEnEdicion = null;
        window.VacacionesUI.limpiarFase1();
        window.VacacionesUI.setModoFase1(false);
    }
    if (vacacionIdParaGoce === idVacacion) {
        vacacionIdParaGoce = null;
        window.VacacionesUI.ocultarFormFase2();
    }

    await window.vacacionesCargarLista();
};

// Atajo del botón "Eliminar" del footer (solo visible editando un
// período existente, igual que sobretiempoBtnEliminar).
window.vacacionEliminarDesdeFooter = async function() {
    if (!vacacionIdEnEdicion) return;
    await window.vacacionEliminar(vacacionIdEnEdicion);
};

// ============================================================
// REPORTE GENERAL (todos los empleados) — botón del submenu
// ============================================================
window.exportarTodasVacaciones = async function() {
    window.toast('⏳ Generando reporte de vacaciones...', 'info');
    const result = await window.VacacionesAPI.listar();
    const registros = (result.success && Array.isArray(result.data)) ? result.data : [];
    if (registros.length === 0) {
        window.toast('⚠️ No hay períodos vacacionales registrados todavía', 'warning');
        return;
    }
    window.VacacionesExportXLSX.generar(registros);
};

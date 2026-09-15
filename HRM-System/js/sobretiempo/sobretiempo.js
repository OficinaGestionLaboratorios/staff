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
//         → se puede llamar VARIAS veces por solicitud: cada
//           registro se ACUMULA hasta cubrir el total de horas
//           generadas (ej. 21h generadas, 12h hoy, 9h quedan
//           pendientes para otro día). El ESTADO pasa de "Pendiente
//           de descanso" → "Descanso parcial" → "Completo", y recién
//           en "Completo" se cierra la Fase 2 automáticamente.
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
    window.SobretiempoUI.inicializarTablaFechas();
    window.SobretiempoUI.limpiarFase1();
    window.SobretiempoUI.setModoFase1(false);
    window.SobretiempoUI.mostrarFormFase1();

    const empleadoInput = document.getElementById('sobretiempoEmpleado');
    if (empleadoInput) empleadoInput.value = window.formatearPersonalSeleccionado(window.personalSeleccionado);

    const dependenciaInput = document.getElementById('sobretiempoDependencia');
if (dependenciaInput && !dependenciaInput.value) {
    dependenciaInput.value = window.personalSeleccionado.LUGAR_TRABAJO || '';
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
// tiene algún descanso registrado, ver updateSobretiempo en el backend).
window.sobretiempoVerCompleto = function(registro) {
    const M = window.SobretiempoModel;
    window.toast(
        `📋 ${registro.ID_SOLICITUD}: ${registro.TIPO_TRABAJO}, ${registro.TOTAL_HORAS}h generadas — ` +
        `${registro.TOTAL_HORAS_EFECTIVAS}h de descanso compensadas en ${(registro.DESCANSOS || []).length} registro(s)`,
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
// FASE 2 — BANCO DE HORAS DE SOBRETIEMPO
// ============================================================
window.sobretiempoAbrirFase2 = async function() {
    if (!window.personalSeleccionado) {
        window.toast('⚠️ Primero selecciona un empleado', 'warning');
        return;
    }
    sobretiempoIdParaDescanso = '__BANCO__';
    window.SobretiempoUI.mostrarFormFase2();
    const jornada = parseFloat(window.personalSeleccionado?.JORNADA_DIARIA || window.personalSeleccionado?.HORAS_JORNADA_DIARIA || 8) || 8;
    const [bancoResult, solicitudesResult] = await Promise.all([
        window.SobretiempoAPI.obtenerBanco(window.personalSeleccionado.CODE),
        window.SobretiempoAPI.listarSolicitudesBanco(window.personalSeleccionado.CODE)
    ]);
    if (!bancoResult.success) {
        window.toast('❌ ' + (bancoResult.message || 'No se pudo cargar el banco de horas'), 'error');
        return;
    }
    window.sobretiempoBancoActual = bancoResult.data || [];
    window.SobretiempoUI.renderBancoHoras(window.sobretiempoBancoActual, solicitudesResult.success ? solicitudesResult.data : [], jornada);
};

window.sobretiempoCancelarFase2 = function() {
    sobretiempoIdParaDescanso = null;
    window.sobretiempoBancoActual = null;
    window.SobretiempoUI.ocultarFormFase2();
    window.sobretiempoCargarLista();
};

window.guardarSobretiempoFase2 = async function() {
    window.SobretiempoUI.mostrarErrorFase2('');
    if (!window.personalSeleccionado) return;

    const datos = window.SobretiempoUI.leerBancoHoras();
    if (!datos.selecciones.length) {
        const msg='Selecciona al menos una fecha y una cantidad de horas a utilizar.';
        window.SobretiempoUI.mostrarErrorFase2(msg); window.toast('⚠️ '+msg,'error'); return;
    }
    if (!datos.fechasDescanso.length) {
        const msg='Indica al menos una fecha propuesta para el descanso.';
        window.SobretiempoUI.mostrarErrorFase2(msg); window.toast('⚠️ '+msg,'error'); return;
    }

    const detalle=datos.selecciones.map(x => `${x.FECHA_SOBRETIEMPO}: ${Number(x.HORAS_A_UTILIZAR).toFixed(2)} h`).join('\n');
    const fechas=datos.fechasDescanso.join(', ');
    const confirmado=confirm(`RESUMEN DE SOLICITUD\n\nHoras a utilizar:\n${detalle}\n\nTotal: ${datos.total.toFixed(2)} h\nEquivalencia: ${datos.equivalencia}\nFecha(s) propuesta(s): ${fechas}\n\n¿Deseas generar la solicitud?`);
    if (!confirmado) return;

    const btn=document.getElementById('sobretiempoBtnFase2');
    if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Generando...';}
    try {
        const payload=window.SobretiempoModel.construirPayloadBanco({
            personal:window.personalSeleccionado,
            selecciones:datos.selecciones,
            fechasDescanso:datos.fechasDescanso,
            equivalencia:datos.equivalencia,
            observaciones:datos.observaciones
        });
        const result=await window.SobretiempoAPI.crearSolicitudBanco(payload);
        if(result.success){
            window.toast(`✅ Solicitud ${result.data?.ID_SOLICITUD_DESCANSO || ''} creada. ${datos.total.toFixed(2)} h quedaron comprometidas en el banco.`, 'success');
            // Producto final de la Fase 2: el correo de solicitud de
            // descanso compensatorio, listo para copiar y pegar (no se
            // envía desde la web, igual que la carta de Horarios).
            window.abrirModalCorreoSobretiempo?.({
                personal: window.personalSeleccionado,
                idSolicitudDescanso: result.data?.ID_SOLICITUD_DESCANSO || '',
                selecciones: datos.selecciones,
                fechasDescanso: datos.fechasDescansoDetalle,
                destinatario: datos.destinatario,
                observaciones: datos.observaciones
            });
            await window.sobretiempoAbrirFase2();
            await window.sobretiempoCargarLista();
        } else {
            window.toast('❌ '+(result.message||'No se pudo crear la solicitud'),'error');
            window.SobretiempoUI.mostrarErrorFase2(result.message||'No se pudo crear la solicitud');
        }
    } finally {
        if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-paper-plane"></i> Generar solicitud';}
    }
};

// Fase 2 ahora es un banco de horas. No se elimina ni se edita un
// descanso individual desde la fila de Fase 1: los consumos tienen
// su propia trazabilidad en BD_SOBRETIEMPO_MOVIMIENTOS.

// ============================================================
// ELIMINAR SOLICITUD
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

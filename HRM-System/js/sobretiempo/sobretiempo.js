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
    const solicitudesBanco = solicitudesResult.success ? solicitudesResult.data : [];
    window.SobretiempoUI.renderBancoHoras(window.sobretiempoBancoActual, solicitudesBanco, jornada);
    const solicitudesWrap = document.getElementById('sobretiempoBancoSolicitudes');
    if (solicitudesWrap) {
        solicitudesWrap.querySelectorAll('[data-accion="registrar-descanso-efectuado"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const total = parseFloat(btn.dataset.total) || 0;
                window.abrirModalRegistrarDescansoBanco?.(id, total, parseFloat(btn?.dataset?.pendiente || total));
            });
        });
    }
};

// ============================================================
// REGISTRAR DESCANSO EFECTUADO — FASE 2 / BANCO DE HORAS
// ============================================================
let bancoSolicitudEfectuadaId = null;
let bancoSolicitudEfectuadaTotal = 0;
let bancoSolicitudEfectuadaPendiente = 0;

function fechaHoyISO_() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function actualizarTotalEfectivoBanco_() {
    let total = 0;
    document.querySelectorAll('#registrarDescansoBancoFechas [data-efectivo-row]').forEach(row => {
        total += Math.max(parseFloat(row.querySelector('[data-efectivo-horas]')?.value) || 0, 0);
    });
    const el = document.getElementById('registrarDescansoBancoTotal');
    if (el) el.textContent = `Total efectuado: ${total.toFixed(2)} h`;
    return total;
}

function agregarFechaEfectivaBanco_(fecha = '', horas = '') {
    const wrap = document.getElementById('registrarDescansoBancoFechas');
    if (!wrap) return;
    const row = document.createElement('div');
    row.setAttribute('data-efectivo-row', '1');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 140px auto;gap:8px;align-items:end;margin-bottom:8px;';
    row.innerHTML = `
        <div>
            <label style="font-size:11px;color:#64748B;display:block;margin-bottom:4px;">Fecha efectiva</label>
            <input type="date" value="${window.esc(fecha)}" data-efectivo-fecha style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:7px;">
        </div>
        <div>
            <label style="font-size:11px;color:#64748B;display:block;margin-bottom:4px;">Horas efectuadas</label>
            <input type="number" min="0.01" step="0.01" value="${horas !== '' ? window.esc(horas) : ''}" data-efectivo-horas style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:7px;text-align:right;">
        </div>
        <button type="button" class="btn-chip btn-chip-danger" data-eliminar-efectivo style="padding:7px 9px;" title="Eliminar fecha"><i class="fas fa-trash"></i></button>
    `;
    row.querySelector('[data-efectivo-horas]').addEventListener('input', actualizarTotalEfectivoBanco_);
    row.querySelector('[data-eliminar-efectivo]').addEventListener('click', () => {
        row.remove();
        actualizarTotalEfectivoBanco_();
    });
    wrap.appendChild(row);
    actualizarTotalEfectivoBanco_();
}

window.agregarFechaEfectivaBanco = agregarFechaEfectivaBanco_;

window.abrirModalRegistrarDescansoBanco = function(idSolicitud, totalHoras, horasPendientes) {
    bancoSolicitudEfectuadaId = idSolicitud || null;
    bancoSolicitudEfectuadaTotal = parseFloat(totalHoras) || 0;
    bancoSolicitudEfectuadaPendiente = parseFloat(horasPendientes) || bancoSolicitudEfectuadaTotal;
    const modal = document.getElementById('modalRegistrarDescansoBanco');
    const wrap = document.getElementById('registrarDescansoBancoFechas');
    const resumen = document.getElementById('registrarDescansoBancoResumen');
    const error = document.getElementById('registrarDescansoBancoError');
    if (!modal || !wrap) return;
    if (resumen) resumen.innerHTML = `<strong>Solicitud:</strong> ${window.esc(idSolicitud)}<br><strong>Horas de la solicitud:</strong> ${bancoSolicitudEfectuadaTotal.toFixed(2)} h<br><strong>Horas pendientes por registrar:</strong> ${bancoSolicitudEfectuadaPendiente.toFixed(2)} h`;
    wrap.innerHTML = '';
    if (error) { error.style.display = 'none'; error.textContent = ''; }
    agregarFechaEfectivaBanco_(fechaHoyISO_(), bancoSolicitudEfectuadaPendiente.toFixed(2));
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.cerrarModalRegistrarDescansoBanco = function() {
    const modal = document.getElementById('modalRegistrarDescansoBanco');
    if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); }
    bancoSolicitudEfectuadaId = null;
    bancoSolicitudEfectuadaTotal = 0;
    bancoSolicitudEfectuadaPendiente = 0;
    document.body.style.overflow = '';
};

window.confirmarDescansoEfectuadoBanco = async function() {
    const error = document.getElementById('registrarDescansoBancoError');
    const btn = document.getElementById('btnConfirmarDescansoBanco');
    const filas = Array.from(document.querySelectorAll('#registrarDescansoBancoFechas [data-efectivo-row]'));
    const fechas = filas.map(row => ({
        fecha: row.querySelector('[data-efectivo-fecha]')?.value || '',
        horas: parseFloat(row.querySelector('[data-efectivo-horas]')?.value) || 0
    })).filter(x => x.fecha && x.horas > 0);
    const total = fechas.reduce((a, x) => a + x.horas, 0);
    if (!bancoSolicitudEfectuadaId) return;
    if (!fechas.length) {
        if (error) { error.style.display = 'block'; error.textContent = 'Registra al menos una fecha efectiva con horas mayores que cero.'; }
        return;
    }
    if (total - bancoSolicitudEfectuadaPendiente > 0.01) {
        if (error) { error.style.display = 'block'; error.textContent = `No puedes registrar más de las ${bancoSolicitudEfectuadaPendiente.toFixed(2)} h pendientes de esta solicitud.`; }
        return;
    }
    if (!confirm(`Se registrarán ${total.toFixed(2)} h como descanso efectivamente utilizado para la solicitud ${bancoSolicitudEfectuadaId}. El saldo del banco se reducirá únicamente por estas horas. ¿Continuar?`)) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...'; }
    try {
        const result = await window.SobretiempoAPI.registrarDescansoEfectuadoBanco({
            ID_SOLICITUD_DESCANSO: bancoSolicitudEfectuadaId,
            FECHAS_DESCANSO_EFECTUADO_JSON: JSON.stringify(fechas),
            OBSERVACIONES: 'Descanso compensatorio efectivamente realizado.'
        });
        if (!result.success) {
            if (error) { error.style.display = 'block'; error.textContent = result.message || 'No se pudo registrar el descanso efectuado.'; }
            return;
        }
        window.cerrarModalRegistrarDescansoBanco();
        window.toast(`✅ ${result.data?.ESTADO || 'Descanso registrado'}: ${total.toFixed(2)} h. Saldo actualizado.`, 'success');
        await window.sobretiempoAbrirFase2();
        await window.sobretiempoCargarLista();
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar descanso efectuado'; }
    }
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
    const confirmado=confirm(`RESUMEN DE SOLICITUD\n\nHoras a utilizar:\n${detalle}\n\nTotal: ${datos.total.toFixed(2)} h\nFecha(s) propuesta(s): ${fechas}\n\n¿Deseas generar la solicitud?`);
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
            window.toast(`✅ Solicitud ${result.data?.ID_SOLICITUD_DESCANSO || ''} creada. ${datos.total.toFixed(2)} h registradas como solicitud pendiente.`, 'success');
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

// ============================================================
// VACACIONES-UI.JS — Renderizado y manipulación del DOM del modal
// ============================================================
// Mismo criterio que sobretiempo-ui.js: todo lo que lee/escribe el
// DOM del módulo Vacaciones vive aquí. vacaciones.js decide QUÉ
// hacer; este archivo decide CÓMO pintarlo.
// ============================================================

window.VacacionesUI = (function() {
    const M = window.VacacionesModel;

    // ---- Panel "Períodos registrados de este empleado" ----

    function renderLista(registros, idActivo) {
        const wrap = document.getElementById('vacacionesListaWrap');
        const cont = document.getElementById('vacacionesLista');
        if (!wrap || !cont) return;

        if (!registros || registros.length === 0) {
            wrap.style.display = 'none';
            cont.innerHTML = '';
            return;
        }

        wrap.style.display = 'block';
        cont.innerHTML = registros.map(r => {
            const info = M.ESTADO_INFO[r.ESTADO] || M.ESTADO_INFO['Pendiente de goce'];
            const activo = r.ID_VACACION === idActivo;
            const pendiente = r.ESTADO !== 'Agotado';
            const sinGoces = (r.GOCES || []).length === 0;
            const diasTexto = (r.ESTADO === 'Goce parcial' || r.ESTADO === 'Vencido')
                ? `${window.esc(r.DIAS_ASIGNADOS || '0')} asignados · ${window.esc(r.DIAS_PENDIENTES || '0')} pendientes`
                : `${window.esc(r.DIAS_ASIGNADOS || '0')} días asignados`;
            return `
                <div class="horario-grupo-item ${activo ? 'activo' : ''}" data-id-vacacion="${window.esc(r.ID_VACACION)}">
                    <div class="horario-grupo-info">
                        <span class="horario-grupo-id">${window.esc(r.ID_VACACION)}</span>
                        <span class="badge-estado ${info.clase}"><i class="fas ${info.icono}"></i> ${window.esc(r.ESTADO)}</span>
                        <span class="horario-grupo-vigencia">${window.esc(r.PERIODO_VACACIONAL)} · Vence: ${window.esc(M.fechaATextoLegible(r.FECHA_LIMITE))}</span>
                        <span class="horario-grupo-horas">${diasTexto}</span>
                    </div>
                    <div class="horario-grupo-acciones">
                        ${pendiente ? `
                            <button type="button" class="btn-chip btn-chip-green" data-accion="registrar-goce" data-id="${window.esc(r.ID_VACACION)}"><i class="fas fa-plane-departure"></i> Registrar goce</button>
                        ` : `
                            <button type="button" class="btn-chip" data-accion="ver-vacacion" data-id="${window.esc(r.ID_VACACION)}"><i class="fas fa-eye"></i> Ver</button>
                        `}
                        <button type="button" class="btn-chip" data-accion="editar-vacacion" data-id="${window.esc(r.ID_VACACION)}" title="${sinGoces ? 'Editar período' : 'Corregir DNI/ID/observación (los días asignados y la fecha límite ya no se pueden tocar porque hay goces registrados)'}"><i class="fas fa-pen"></i> Editar</button>
                        <button type="button" class="btn-chip btn-chip-danger" data-accion="eliminar-vacacion" data-id="${window.esc(r.ID_VACACION)}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ---- FORM FASE 1 (registrar período/saldo) ----

    function leerFase1() {
        return {
            periodoVacacional: document.getElementById('vacacionPeriodo')?.value || '',
            diasAsignados: document.getElementById('vacacionDiasAsignados')?.value || '',
            fechaLimite: document.getElementById('vacacionFechaLimite')?.value || '',
            observacion: document.getElementById('vacacionObservacion')?.value || ''
        };
    }

    // Los tres campos que afectan el SALDO (período, días asignados,
    // fecha límite) solo son editables mientras el registro no tenga
    // ningún goce; el backend los ignora igual si llegan a enviarse
    // con goces ya registrados (ver updateVacacion en Codigo_Vacaciones.gs),
    // pero se bloquean también aquí para que quede claro en pantalla
    // por qué no cambian. DNI/ID/observación se siguen pudiendo
    // corregir siempre — no pasan por este bloqueo.
    function bloquearCamposSaldo(bloquear) {
        ['vacacionPeriodo', 'vacacionDiasAsignados', 'vacacionFechaLimite'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !!bloquear;
        });
    }

    function pintarFase1(registro) {
        document.getElementById('vacacionPeriodo').value = registro.PERIODO_VACACIONAL || '';
        document.getElementById('vacacionDiasAsignados').value = registro.DIAS_ASIGNADOS || M.DIAS_ASIGNADOS_DEFECTO;
        document.getElementById('vacacionFechaLimite').value = (registro.FECHA_LIMITE || '').slice(0, 10);
        document.getElementById('vacacionObservacion').value = registro.OBSERVACION || '';
        bloquearCamposSaldo((registro.GOCES || []).length > 0);
    }

    function limpiarFase1() {
        document.getElementById('vacacionPeriodo').value = '';
        document.getElementById('vacacionDiasAsignados').value = M.DIAS_ASIGNADOS_DEFECTO;
        document.getElementById('vacacionFechaLimite').value = '';
        document.getElementById('vacacionObservacion').value = '';
        bloquearCamposSaldo(false);
        mostrarErrorFase1('');
    }

    function mostrarErrorFase1(texto) {
        const msg = document.getElementById('vacacionMsgFase1');
        if (msg) msg.textContent = texto;
    }

    function setModoFase1(editando) {
        const titulo = document.getElementById('vacacionFase1Titulo');
        const btnTexto = document.getElementById('vacacionBtnFase1Texto');
        const btnEliminar = document.getElementById('vacacionBtnEliminar');
        if (titulo) titulo.textContent = editando ? 'Editar período vacacional' : '1. Registrar período vacacional';
        if (btnTexto) btnTexto.textContent = editando ? 'Actualizar período' : 'Guardar período';
        if (btnEliminar) btnEliminar.style.display = editando ? 'inline-flex' : 'none';
    }

    function mostrarFormFase1() {
        document.getElementById('vacacionFormFase1').style.display = 'block';
        document.getElementById('vacacionFormFase2').style.display = 'none';
        document.getElementById('vacacionFooterFase1').style.display = 'flex';
        document.getElementById('vacacionFooterFase2').style.display = 'none';
        mostrarErrorFase1('');
    }

    // ---- FORM FASE 2 (registrar goce) ----

    function renderGocesRegistrados(goces) {
        if (!goces || goces.length === 0) {
            return '<p style="font-size:13px;color:#94A3B8;margin-top:10px;">Aún no se ha registrado ningún goce para este período.</p>';
        }
        const filas = goces.map((g, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #F1F5F9;">
                <div style="font-size:13px;color:#334155;">
                    <strong>${window.esc(M.fechaATextoLegible(g.fechaInicio))} — ${window.esc(M.fechaATextoLegible(g.fechaFin))}</strong>
                    ${g.dias ? ` · ${window.esc(g.dias)} día(s)` : ''}
                    ${g.observacion ? ` · <span style="color:#64748B;">${window.esc(g.observacion)}</span>` : ''}
                </div>
                <div style="display:flex;gap:6px;">
                    <button type="button" class="btn-chip btn-download-uniform" data-accion="generar-documento-goce" data-indice="${i}" title="Descargar documento de solicitud (Word)"><i class="fas fa-download"></i></button>
                    <button type="button" class="btn-chip btn-chip-danger" data-accion="eliminar-goce" data-indice="${i}" title="Quitar este goce"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
        return `<div style="margin-top:8px;">${filas}</div>`;
    }

    let resumenFase2Listo = false;
    function inicializarResumenFase2() {
        if (resumenFase2Listo) return;
        const cont = document.getElementById('vacacionFase2Resumen');
        if (!cont) return;
        cont.addEventListener('click', (e) => {
            const btnEliminar = e.target.closest('[data-accion="eliminar-goce"]');
            if (btnEliminar) { window.vacacionEliminarGoce?.(parseInt(btnEliminar.dataset.indice, 10)); return; }
            const btnDocumento = e.target.closest('[data-accion="generar-documento-goce"]');
            if (btnDocumento) window.vacacionGenerarDocumentoGoce?.(parseInt(btnDocumento.dataset.indice, 10));
        });
        resumenFase2Listo = true;
    }

    // `opciones.soloLectura` = true cuando el período ya está
    // "Agotado" (no quedan días pendientes) o se abrió desde el
    // botón "Ver": oculta los campos para registrar un NUEVO tramo y
    // el botón "Guardar goce", pero conserva visibles los goces ya
    // registrados junto con su botón 📄 "Generar documento", que
    // sigue funcionando de forma independiente al guardado.
    function mostrarFormFase2(registro, opciones = {}) {
        const soloLectura = !!opciones.soloLectura;

        document.getElementById('vacacionFormFase1').style.display = 'none';
        document.getElementById('vacacionFormFase2').style.display = 'block';
        document.getElementById('vacacionFooterFase1').style.display = 'none';
        document.getElementById('vacacionFooterFase2').style.display = 'flex';
        inicializarResumenFase2();

        const nuevoTramoWrap = document.getElementById('vacacionNuevoTramoWrap');
        if (nuevoTramoWrap) nuevoTramoWrap.style.display = soloLectura ? 'none' : '';
        const btnGuardarFase2 = document.getElementById('vacacionBtnFase2');
        if (btnGuardarFase2) btnGuardarFase2.style.display = soloLectura ? 'none' : '';

        const chipStyle = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#EFF6FF;color:#1D4ED8;border-radius:12px;font-size:12px;font-weight:600;margin-right:8px;margin-bottom:6px;';
        const chipPendiente = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#FEF3C7;color:#B45309;border-radius:12px;font-size:12px;font-weight:700;margin-right:8px;margin-bottom:6px;';

        document.getElementById('vacacionFase2Resumen').innerHTML = `
            <div>
                <span style="${chipStyle}"><i class="fas fa-calendar-check"></i> ${window.esc(registro.PERIODO_VACACIONAL)}</span>
                <span style="${chipStyle}"><i class="fas fa-umbrella-beach"></i> Asignados: ${window.esc(registro.DIAS_ASIGNADOS)} d</span>
                <span style="${chipStyle}"><i class="fas fa-plane-departure"></i> Ya tomados: ${window.esc(registro.DIAS_TOMADOS)} d</span>
                <span style="${chipPendiente}"><i class="fas fa-hourglass-half"></i> Pendientes: ${window.esc(registro.DIAS_PENDIENTES)} d</span>
            </div>
            <p style="font-size:13px;color:#64748B;margin-top:8px;"><strong>Fecha límite de goce:</strong> ${window.esc(M.fechaATextoLegible(registro.FECHA_LIMITE))}</p>
            <div style="margin-top:10px;padding:10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
                <p style="font-size:11px;color:#64748B;margin:0 0 6px;">Estos dos campos son los que se imprimen en el documento Word de cada goce. Vienen prellenados, pero revísalos/corrígelos aquí antes de generar el documento — no dependen de ningún otro dato del sistema.</p>
                <div style="display:flex;gap:12px;flex-wrap:wrap;">
                    <label style="font-size:12px;color:#334155;font-weight:600;">DNI
                        <input type="text" id="vacacionDniDocumento" value="${window.esc(registro.DNI || '')}" style="display:block;margin-top:2px;padding:5px 8px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;width:150px;">
                    </label>
                    <label style="font-size:12px;color:#334155;font-weight:600;">ID Personal
                        <input type="text" id="vacacionIdPersonalDocumento" value="${window.esc(registro.ID_PERSONAL || '')}" style="display:block;margin-top:2px;padding:5px 8px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;width:150px;">
                    </label>
                </div>
            </div>
            <div style="margin-top:8px;">
                <strong style="font-size:13px;color:#334155;">Goces ya registrados</strong>
                ${renderGocesRegistrados(registro.GOCES)}
            </div>
        `;

        document.getElementById('vacacionFechaInicio').value = '';
        document.getElementById('vacacionFechaFin').value = '';
        document.getElementById('vacacionDiasTomados').value = '';
        document.getElementById('vacacionObservacionGoce').value = '';
        mostrarErrorFase2('');
        actualizarDiasTramo();
    }

    function ocultarFormFase2() {
        mostrarFormFase1();
    }

    function leerFase2() {
        return {
            fechaInicio: document.getElementById('vacacionFechaInicio')?.value || '',
            fechaFin: document.getElementById('vacacionFechaFin')?.value || '',
            diasTomados: document.getElementById('vacacionDiasTomados')?.value || '',
            observacionGoce: document.getElementById('vacacionObservacionGoce')?.value || ''
        };
    }

    function mostrarErrorFase2(texto) {
        const msg = document.getElementById('vacacionMsgFase2');
        if (msg) msg.textContent = texto;
    }

    // El campo "Días" se auto-calcula al elegir ambas fechas, pero
    // queda editable por si el usuario necesita ajustarlo (ej. si
    // hay algún feriado que la oficina no descuenta).
    function actualizarDiasTramo() {
        const fechaInicio = document.getElementById('vacacionFechaInicio')?.value || '';
        const fechaFin = document.getElementById('vacacionFechaFin')?.value || '';
        const campoDias = document.getElementById('vacacionDiasTomados');
        if (!campoDias) return;
        if (fechaInicio && fechaFin && fechaFin >= fechaInicio) {
            campoDias.value = M.calcularDiasTramo(fechaInicio, fechaFin);
        }
    }

    return {
        renderLista,
        leerFase1, pintarFase1, limpiarFase1, mostrarErrorFase1, setModoFase1, mostrarFormFase1,
        mostrarFormFase2, ocultarFormFase2, leerFase2, mostrarErrorFase2, actualizarDiasTramo
    };
})();

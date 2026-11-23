// ============================================================
// SOBRETIEMPO-UI.JS — Renderizado y manipulación del DOM del modal
// ============================================================
// Mismo criterio que horario-ui.js: todo lo que lee/escribe el DOM
// del módulo Sobretiempo vive aquí. sobretiempo.js decide QUÉ hacer;
// este archivo decide CÓMO pintarlo.
//
// La Fase 1 admite hasta M.MAX_FECHAS filas de fecha/hora (tabla
// #sobretiempoFechasBody). La Fase 2 se puede abrir VARIAS veces
// para la misma solicitud (mientras queden horas pendientes): cada
// vez muestra los descansos ya registrados (con botón para quitar
// alguno mal cargado) y el formulario para agregar el siguiente.
// ============================================================

window.SobretiempoUI = (function() {
    const M = window.SobretiempoModel;

    // ---- Panel "Solicitudes registradas de este empleado" ----

    function renderLista(registros, idSolicitudActiva) {
        const wrap = document.getElementById('sobretiempoListaWrap');
        const cont = document.getElementById('sobretiempoLista');
        if (!wrap || !cont) return;

        if (!registros || registros.length === 0) {
            wrap.style.display = 'none';
            cont.innerHTML = '';
            return;
        }

        wrap.style.display = 'block';
        cont.innerHTML = registros.map(r => {
            const info = M.ESTADO_INFO[r.ESTADO] || M.ESTADO_INFO['Pendiente de descanso'];
            const activo = r.ID_SOLICITUD === idSolicitudActiva;
            // "pendiente" cubre TANTO "Pendiente de descanso" como
            // "Descanso parcial": en ambos casos falta compensar
            // horas y el botón "Registrar descanso" sigue habilitado.
            const pendiente = r.ESTADO !== 'Completo';
            // "Editar" solo tiene sentido si la solicitud no tiene NADA
            // comprometido/utilizado todavía (ni por el mecanismo viejo
            // de DESCANSOS_JSON, ni por el banco de horas) — mismo
            // criterio que ya exige el backend en updateSobretiempo.
            const sinDescansos = (r.DESCANSOS || []).length === 0 && parseFloat(r.HORAS_BANCO || 0) <= 0;
            const nFechas = (r.FECHAS || []).length;
            const etiquetaFecha = nFechas > 1
                ? `${window.esc(M.fechaATextoLegible(r.FECHAS[0].fecha))} y ${nFechas - 1} más`
                : window.esc(M.fechaATextoLegible(r.FECHA_EJECUCION));
            const aut = r.ESTADO_AUTORIZACION || 'Aprobado';
            const autorizada = aut === 'Aprobado';
            const autInfo = M.AUTORIZACION_INFO[aut] || M.AUTORIZACION_INFO['Pendiente de aprobación'];
            const autHistorial = (r.AUTORIZACION || []).map(h => `${M.fechaATextoLegible(h.fecha)} · ${h.estado}${h.nota ? ' — ' + h.nota : ''}${h.usuario ? ' (' + h.usuario + ')' : ''}`).join('\n');
            const horasTexto = !autorizada
                ? `${window.esc(r.TOTAL_HORAS || '0')}h solicitadas · no suman al banco hasta que RR.HH. las apruebe`
                : r.ESTADO === 'Descanso parcial'
                    ? `${window.esc(r.TOTAL_HORAS || '0')}h generadas · ${window.esc(r.HORAS_PENDIENTES || '0')}h pendientes`
                    : `${window.esc(r.TOTAL_HORAS || '0')}h generadas`;
            return `
                <div class="horario-grupo-item ${activo ? 'activo' : ''}" data-id-solicitud="${window.esc(r.ID_SOLICITUD)}" title="${window.esc(r.ID_SOLICITUD)}">
                    <div class="horario-grupo-info">
                        <span class="horario-grupo-id">${window.esc(r.ID_SOLICITUD)}</span>
                        <span class="badge-estado ${autInfo.clase}" title="${window.esc(autHistorial || 'Sin historial')}"><i class="fas ${autInfo.icono}"></i> ${window.esc(aut)}</span>
                        ${autorizada ? `<span class="badge-estado ${info.clase}"><i class="fas ${info.icono}"></i> ${window.esc(r.ESTADO)}</span>` : ''}
                        <span class="horario-grupo-vigencia">${window.esc(r.TIPO_TRABAJO)} · ${etiquetaFecha}</span>
                        <span class="horario-grupo-horas">${horasTexto}</span>
                        <button type="button" class="btn-chip btn-download-uniform" data-solicitud-st="${window.esc(r.ID_SOLICITUD)}" title="Descargar la solicitud de sobretiempo en Excel"><i class="fas fa-file-excel"></i> Solicitud</button>
                    </div>
                    <div class="horario-grupo-acciones" style="flex-wrap:wrap;justify-content:flex-end;margin-left:auto;">
                        ${botonesAutorizacionHTML(r)}
                        ${window.AccionesRegistro.html(r.ID_SOLICITUD, { mostrar: ['editar', 'exportar', 'correo', 'eliminar'], tips: { exportar: 'Descargar resumen de horas y descansos' }, desactivar: (pendiente && sinDescansos) ? {} : { editar: 'ya tiene descansos registrados; se muestra su resumen' } })}
                    </div>
                </div>
            `;
        }).join('') + totalListaHTML(registros);
    }

    // Botones del flujo de autorización según el estado actual.
    function botonesAutorizacionHTML(r) {
        const est = r.ESTADO_AUTORIZACION || 'Aprobado';
        if (est === 'Anulado') return '';
        const anular = `<button type="button" class="btn-chip btn-chip-danger" data-accion="anular-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}" title="Dar de baja esta solicitud con motivo y constancia en el historial; libera sus horas del banco"><i class="fas fa-times-circle"></i> Anular</button>`;
        return botonesFlujoHTML(r) + anular;
    }
    function botonesFlujoHTML(r) {
        const id = window.esc(r.ID_SOLICITUD);
        const est = r.ESTADO_AUTORIZACION || 'Aprobado';
        const b = (estado, icono, texto, extra) => `<button type="button" class="btn-chip ${extra || ''}" data-accion="autorizar-solicitud" data-id="${id}" data-estado="${window.esc(estado)}"><i class="fas ${icono}"></i> ${texto}</button>`;
        const rechazar = b('Rechazado', 'fa-ban', 'Rechazar', 'btn-chip-danger');
        const fx = (r.FLUJO || {});
        const fdia = iso => window.SobretiempoModel.fechaATextoLegible(String(iso || '').slice(0, 10));
        if (est === 'Pendiente de aprobación') {
            if (!fx.conformidad) return `<button type="button" class="btn-chip btn-chip-green" data-accion="registrar-conformidad" data-id="${id}" title="Paso 2 del procedimiento: el trabajador firma la solicitud (firma y huella)"><i class="fas fa-signature"></i> Conformidad del trabajador</button>`;
            return `<span class="badge-estado estado-vigente" title="Firma y huella del trabajador"><i class="fas fa-check"></i> Conformidad ${fdia(fx.conformidad.fecha)}</span> `
                + `<button type="button" class="btn-chip btn-chip-green" data-accion="remitir-srybs" data-id="${id}" title="Paso 3 del procedimiento: remitir a SRYBS por correo o físico"><i class="fas fa-paper-plane"></i> Remitir a SRYBS</button>`;
        }
        const remitido = fx.remision ? `<span class="badge-estado estado-vigente" title="Remisión a SRYBS"><i class="fas fa-paper-plane"></i> Remitido (${window.esc(fx.remision.medio)}) ${fdia(fx.remision.fecha)}</span> ` : '';
        if (est === 'Derivado a RR.HH.') return remitido + b('Aprobado', 'fa-check-double', 'Aprobado por RR.HH.', 'btn-chip-green') + rechazar + b('Pendiente de aprobación', 'fa-undo', 'Volver a pendiente');
        if (est === 'Aprobado') {
            // Regla 6.2.3: trabajo en feriado → programar el descanso compensado en máx. 3 días hábiles.
            let plazo = '';
            if (r.TIPO_TRABAJO === 'Feriado' && r.ESTADO !== 'Completo' && r.FECHA_EJECUCION) {
                const M = window.SobretiempoModel, lim = M.sumarDiasHabiles(String(r.FECHA_EJECUCION).slice(0, 10), 3);
                const hoy = new Date(); const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
                plazo = hoyISO > lim
                    ? `<span class="badge-estado estado-vencido" title="INS-DRH-P-30, 6.2.3"><i class="fas fa-triangle-exclamation"></i> Plazo para programar el descanso venció el ${M.fechaATextoLegible(lim)}</span> `
                    : `<span class="badge-estado estado-parcial" title="INS-DRH-P-30, 6.2.3"><i class="fas fa-calendar-day"></i> Programar el descanso antes del ${M.fechaATextoLegible(lim)}</span> `;
            }
            const v = r.VERIFICACION;
            const verificar = `<button type="button" class="btn-chip ${v ? '' : 'btn-chip-green'}" data-accion="verificar-ejecucion" data-id="${id}" title="Control de Asistencia: verificar la ejecución (Sección III del formato)"><i class="fas fa-fingerprint"></i> ${v ? 'Verificado · ' + window.esc(v.horasEfectivas) + ' h (' + window.esc(v.destino) + ')' : 'Verificar ejecución'}</button>`;
            return plazo + verificar + (parseFloat(r.HORAS_BANCO || 0) > 0 ? '' : b('Derivado a RR.HH.', 'fa-undo', 'Revertir aprobación'));
        }
        if (est === 'Rechazado') return b('Pendiente de aprobación', 'fa-redo', 'Reabrir');
        return '';
    }

    // Suma de horas de todas las solicitudes del empleado (pie de la lista)
    function totalListaHTML(registros) {
        const num = v => parseFloat(v) || 0;
        const esAut = r => (r.ESTADO_AUTORIZACION || 'Aprobado') === 'Aprobado';
        const generadas = registros.filter(esAut).reduce((a, r) => a + num(r.TOTAL_HORAS), 0);
        const porAutorizar = registros.filter(r => !esAut(r) && r.ESTADO_AUTORIZACION !== 'Rechazado' && r.ESTADO_AUTORIZACION !== 'Anulado').reduce((a, r) => a + num(r.TOTAL_HORAS), 0);
        const pendientes = registros.filter(esAut).reduce((a, r) => a + (r.ESTADO === 'Descanso parcial' ? num(r.HORAS_PENDIENTES) : r.ESTADO === 'Pendiente de descanso' ? num(r.TOTAL_HORAS) : 0), 0);
        return `<div class="sobretiempo-lista-total" style="display:flex;justify-content:flex-end;align-items:center;gap:18px;margin-top:8px;padding:10px 14px;background:#F8FAFC;border-radius:10px;">
            <span style="font-size:13px;color:#64748B;">Por aprobar</span>
            <strong id="sobretiempoListaTotalPorAutorizar" style="font-size:18px;color:#64748B;">${porAutorizar.toFixed(2)} h</strong>
            <span style="font-size:13px;color:#64748B;">Horas aprobadas (${registros.length} solicitud${registros.length === 1 ? '' : 'es'})</span>
            <strong id="sobretiempoListaTotalHoras" style="font-size:18px;color:#1D4ED8;">${generadas.toFixed(2)} h</strong>
            <span style="font-size:13px;color:#64748B;">Pendientes de descanso</span>
            <strong id="sobretiempoListaTotalPendientes" style="font-size:18px;color:#B45309;">${pendientes.toFixed(2)} h</strong>
        </div>`;
    }

    // ---- TABLA DE FECHAS (Fase 1) ----

    function filaFechaHTML(f) {
        const d = f || {};
        return `
            <tr class="sobretiempo-fecha-row">
                <td><input type="date" data-field="fecha" value="${window.esc(d.fecha || '')}"></td>
                <td><input type="time" data-field="horaInicio" value="${window.esc(d.horaInicio || '')}"></td>
                <td><input type="time" data-field="refrigerioInicio" value="${window.esc(d.refrigerioInicio || '')}"></td>
                <td><input type="time" data-field="refrigerioFin" value="${window.esc(d.refrigerioFin || '')}"></td>
                <td><input type="time" data-field="horaFin" value="${window.esc(d.horaFin || '')}"></td>
                <td><span class="horario-dia-total sobretiempo-fecha-horas">—</span></td>
                <td><button type="button" class="btn-chip btn-chip-danger" data-accion="eliminar-fecha" title="Quitar esta fecha"><i class="fas fa-trash"></i></button></td>
            </tr>
        `;
    }

    let tablaFechasListo = false;
    function inicializarTablaFechas() {
        if (tablaFechasListo) return;
        const tbody = document.getElementById('sobretiempoFechasBody');
        if (!tbody) return;

        tbody.addEventListener('input', (e) => {
            if (e.target.matches('input[data-field]')) actualizarTotalHoras();
        });
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-accion="eliminar-fecha"]');
            if (btn) eliminarFilaFecha(btn.closest('tr'));
        });

        tablaFechasListo = true;
    }

    function actualizarBotonAgregarFecha() {
        const tbody = document.getElementById('sobretiempoFechasBody');
        const btn = document.getElementById('sobretiempoBtnAgregarFecha');
        if (!tbody || !btn) return;
        const lleno = tbody.children.length >= M.MAX_FECHAS;
        btn.disabled = lleno;
        btn.style.opacity = lleno ? '0.5' : '1';
        btn.style.cursor = lleno ? 'not-allowed' : 'pointer';
        btn.title = lleno ? `Máximo ${M.MAX_FECHAS} fechas por solicitud` : '';
    }

    function agregarFilaFecha(datos) {
        const tbody = document.getElementById('sobretiempoFechasBody');
        if (!tbody) return;
        if (tbody.children.length >= M.MAX_FECHAS) {
            window.toast(`⚠️ No se pueden registrar más de ${M.MAX_FECHAS} fechas por solicitud`, 'warning');
            return;
        }
        tbody.insertAdjacentHTML('beforeend', filaFechaHTML(datos));
        actualizarBotonAgregarFecha();
        actualizarTotalHoras();
    }

    function eliminarFilaFecha(row) {
        const tbody = document.getElementById('sobretiempoFechasBody');
        if (!tbody || !row) return;
        if (tbody.children.length <= 1) {
            window.toast('⚠️ Debe quedar al menos una fecha registrada', 'warning');
            return;
        }
        row.remove();
        actualizarBotonAgregarFecha();
        actualizarTotalHoras();
    }

    function leerFilasFechas() {
        const tbody = document.getElementById('sobretiempoFechasBody');
        if (!tbody) return [];
        return Array.from(tbody.querySelectorAll('tr')).map(row => ({
            fecha: row.querySelector('[data-field="fecha"]')?.value || '',
            horaInicio: row.querySelector('[data-field="horaInicio"]')?.value || '',
            horaFin: row.querySelector('[data-field="horaFin"]')?.value || '',
            refrigerioInicio: row.querySelector('[data-field="refrigerioInicio"]')?.value || '',
            refrigerioFin: row.querySelector('[data-field="refrigerioFin"]')?.value || ''
        }));
    }

    // Un <input type="time"> en formato 12 h con la hora escrita pero sin AM/PM
    // (o a medias) devuelve valor vacío: sin este chequeo el error decía
    // "falta la hora" aunque el usuario ya la había escrito.
    function horasIncompletas() {
        const tbody = document.getElementById('sobretiempoFechasBody');
        if (!tbody) return [];
        const nombres = { horaInicio: 'ingreso', refrigerioInicio: 'inicio de refrigerio', refrigerioFin: 'fin de refrigerio', horaFin: 'salida' };
        const msgs = [];
        Array.from(tbody.querySelectorAll('tr')).forEach((row, i) => {
            Object.keys(nombres).forEach(k => {
                const el = row.querySelector(`[data-field="${k}"]`);
                if (el && ((window.FechaHora && window.FechaHora.incompleto(el)) || (el.validity && el.validity.badInput))) {
                    el.style.outline = '2px solid #BB0000';
                    el.addEventListener('input', () => { el.style.outline = ''; }, { once: true });
                    msgs.push(`fecha #${i + 1}: la hora de ${nombres[k]} está incompleta o no es válida (usa formato de 24 h, ej. 08:00 o 13:30)`);
                }
            });
        });
        return msgs;
    }

    function actualizarTotalHoras() {
        const tbody = document.getElementById('sobretiempoFechasBody');
        if (!tbody) return;

        let total = 0;
        tbody.querySelectorAll('tr').forEach(row => {
            const horaInicio = row.querySelector('[data-field="horaInicio"]')?.value || '';
            const horaFin = row.querySelector('[data-field="horaFin"]')?.value || '';
            const refrigerioInicio = row.querySelector('[data-field="refrigerioInicio"]')?.value || '';
            const refrigerioFin = row.querySelector('[data-field="refrigerioFin"]')?.value || '';
            const span = row.querySelector('.sobretiempo-fecha-horas');

            if (horaInicio && horaFin) {
                const horas = M.calcularTotalHoras(horaInicio, horaFin, refrigerioInicio, refrigerioFin);
                if (span) span.textContent = horas + ' h';
                total += parseFloat(horas);
            } else if (span) {
                span.textContent = '—';
            }
        });

        const totalEl = document.getElementById('sobretiempoTotalHoras');
        if (totalEl) totalEl.textContent = total.toFixed(2) + ' h';
    }

    // ---- FORM FASE 1 (generación de horas) ----

    function leerFase1() {
        const tipoEl = document.querySelector('input[name="sobretiempoTipo"]:checked');
        return {
            tipoTrabajo: tipoEl ? tipoEl.value : '',
            dependencia: document.getElementById('sobretiempoDependencia')?.value || '',
            fechas: leerFilasFechas(),
            actividades: document.getElementById('sobretiempoActividades')?.value || '',
            justificacion: document.getElementById('sobretiempoJustificacion')?.value || '',
            fechaFormato: document.getElementById('sobretiempoFechaFormato')?.value || ''
        };
    }

    function pintarFase1(registro) {
        document.querySelectorAll('input[name="sobretiempoTipo"]').forEach(r => {
            r.checked = (r.value === registro.TIPO_TRABAJO);
        });
        document.getElementById('sobretiempoDependencia').value = registro.DEPENDENCIA || '';

        const tbody = document.getElementById('sobretiempoFechasBody');
        if (tbody) {
            tbody.innerHTML = '';
            const fechas = (registro.FECHAS && registro.FECHAS.length) ? registro.FECHAS : [{}];
            fechas.forEach(f => tbody.insertAdjacentHTML('beforeend', filaFechaHTML(f)));
        }

        document.getElementById('sobretiempoActividades').value = registro.ACTIVIDADES || '';
        document.getElementById('sobretiempoJustificacion').value = registro.JUSTIFICACION || '';
        const ffEl = document.getElementById('sobretiempoFechaFormato');
        if (ffEl) ffEl.value = registro.FECHA_FORMATO || hoyISO();
        sincronizarTipoChips();
        actualizarBotonAgregarFecha();
        actualizarTotalHoras();
    }

    // "OGL" + tipo de laboratorio del empleado seleccionado
    // (p. ej. "OGL - Generales"); solo "OGL" si no tiene tipo.
    function dependenciaPorDefecto() {
        const p = window.personalSeleccionado;
        if (!p) return '';
        const tipoLab = String(p.TIPO_LABORATORIO || '').trim();
        return tipoLab ? `OGL - ${tipoLab}` : 'OGL';
    }

    // Fecha de hoy (hora local) en formato yyyy-mm-dd para el input de fecha
    function hoyISO() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function limpiarFase1() {
        document.querySelectorAll('input[name="sobretiempoTipo"]').forEach(r => r.checked = false);
        // "Lugar de trabajo" NO se borra al limpiar (nueva generación de
        // horas, tras guardar o eliminar): pertenece al trabajador, no a
        // la solicitud. Solo se rellena con el valor por defecto si
        // estuviera vacío.
        const dependenciaEl = document.getElementById('sobretiempoDependencia');
        if (dependenciaEl && !dependenciaEl.value.trim()) {
            dependenciaEl.value = dependenciaPorDefecto();
        }

        const tbody = document.getElementById('sobretiempoFechasBody');
        if (tbody) {
            tbody.innerHTML = '';
            tbody.insertAdjacentHTML('beforeend', filaFechaHTML({}));
        }

        ['sobretiempoActividades', 'sobretiempoJustificacion'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const ffLimpio = document.getElementById('sobretiempoFechaFormato');
        if (ffLimpio) ffLimpio.value = hoyISO();

        sincronizarTipoChips();
        actualizarBotonAgregarFecha();
        actualizarTotalHoras();
        mostrarErrorFase1('');
    }

    function mostrarErrorFase1(texto) {
        const msg = document.getElementById('sobretiempoMsgValidacion');
        if (msg) msg.textContent = texto;
    }
    function mostrarErrorFase2(texto) {
        const msg = document.getElementById('sobretiempoMsgValidacion');
        if (msg) msg.textContent = texto;
    }

    // ---- Chips seleccionables de "Tipo de trabajo" ----
    let tipoChipsListo = false;
    function inicializarTipoChips() {
        if (tipoChipsListo) return;
        const cont = document.getElementById('sobretiempoTipoOpciones');
        if (!cont) return;
        cont.addEventListener('change', () => {
            cont.querySelectorAll('.sobretiempo-tipo-opcion').forEach(label => {
                const radio = label.querySelector('input[type="radio"]');
                label.classList.toggle('checked', !!radio?.checked);
            });
        });
        tipoChipsListo = true;
    }
    function sincronizarTipoChips() {
        const cont = document.getElementById('sobretiempoTipoOpciones');
        if (!cont) return;
        cont.querySelectorAll('.sobretiempo-tipo-opcion').forEach(label => {
            const radio = label.querySelector('input[type="radio"]');
            label.classList.toggle('checked', !!radio?.checked);
        });
    }

    // ---- Footer compartido (igual patrón que #horarioBtnEliminar) ----
    function setModoFase1(editando) {
        const titulo = document.getElementById('sobretiempoFase1Titulo');
        const btnTexto = document.getElementById('sobretiempoBtnFase1Texto');
        const btnEliminar = document.getElementById('sobretiempoBtnEliminar');
        if (titulo) titulo.textContent = editando ? 'Editar solicitud (generación de horas)' : '1. Registrar generación de horas';
        if (btnTexto) btnTexto.textContent = editando ? 'Actualizar solicitud' : 'Guardar solicitud';
        if (btnEliminar) btnEliminar.style.display = editando ? 'inline-flex' : 'none';
    }

    function mostrarFormFase1() {
        document.getElementById('sobretiempoFormFase1').style.display = 'block';
        document.getElementById('sobretiempoFormFase2').style.display = 'none';
        document.getElementById('sobretiempoFooterFase1').style.display = 'flex';
        document.getElementById('sobretiempoFooterFase2').style.display = 'none';
        mostrarErrorFase1('');
    }

    // ---- FORM FASE 2 (descanso compensatorio) ----

    // Lista de descansos ya registrados dentro del resumen, con
    // botón para quitar alguno mal cargado (delegado sobre el
    // propio contenedor, ver inicializarResumenFase2).
    function renderDescansosRegistrados(descansos) {
        if (!descansos || descansos.length === 0) {
            return '<p style="font-size:13px;color:#94A3B8;margin-top:10px;">Aún no se ha registrado ningún descanso para esta solicitud.</p>';
        }
        const filas = descansos.map((d, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #F1F5F9;">
                <div style="font-size:13px;color:#334155;">
                    <strong>${window.esc(M.fechaATextoLegible(d.fecha))}</strong>
                    ${d.horaInicio && d.horaFin ? ` · ${window.esc(d.horaInicio)}-${window.esc(d.horaFin)}` : ''}
                    ${d.horas ? ` · ${window.esc(d.horas)} h` : ''}
                    ${d.observaciones ? ` · <span style="color:#64748B;">${window.esc(d.observaciones)}</span>` : ''}
                </div>
                <button type="button" class="btn-chip btn-chip-danger" data-accion="eliminar-descanso" data-indice="${i}" title="Quitar este descanso"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');
        return `<div style="margin-top:8px;">${filas}</div>`;
    }

    let resumenFase2Listo = false;
    function inicializarResumenFase2() {
        if (resumenFase2Listo) return;
        const cont = document.getElementById('sobretiempoFase2Resumen');
        if (!cont) return;
        cont.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-accion="eliminar-descanso"]');
            if (btn) window.sobretiempoEliminarDescanso?.(parseInt(btn.dataset.indice, 10));
        });
        resumenFase2Listo = true;
    }

    function mostrarFormFase2() {
        document.getElementById('sobretiempoFormFase1').style.display = 'none';
        document.getElementById('sobretiempoFormFase2').style.display = 'block';
        document.getElementById('sobretiempoFooterFase1').style.display = 'none';
        document.getElementById('sobretiempoFooterFase2').style.display = 'flex';
        inicializarBancoHoras();
        mostrarErrorFase2('');
    }

    function ocultarFormFase2() { mostrarFormFase1(); }
    function leerFase2() { return {}; }
    function actualizarTotalHorasEfectivas() {}

    // ---- FASE 2 NUEVA: BANCO DE HORAS ----
    // Cada fila del descanso propuesto ahora lleva fecha + hora inicio
    // + hora fin (además de la fecha sola que ya se guardaba), para
    // que el correo final pueda mostrar la tabla "DESCANSO
    // COMPENSATORIO" con columnas DÍA/INICIO/FIN/TOTAL igual que el
    // modelo real (ver sobretiempo-export-correo.js). El total de
    // cada fila es solo informativo en el correo: no se exige que
    // coincida con la equivalencia calculada a partir de las horas
    // de sobretiempo utilizadas, porque el horario real del descanso
    // lo define Control de Asistencia.
    function actualizarTotalFilaDescanso(fila) {
        const ini = fila.querySelector('[data-banco-fecha-descanso-hora-inicio]')?.value || '';
        const fin = fila.querySelector('[data-banco-fecha-descanso-hora-fin]')?.value || '';
        const refIni = fila.querySelector('[data-banco-fecha-descanso-refrigerio-inicio]')?.value || '';
        const refFin = fila.querySelector('[data-banco-fecha-descanso-refrigerio-fin]')?.value || '';
        const span = fila.querySelector('[data-banco-fecha-descanso-total]');
        if (!span) return;
        span.textContent = (ini && fin) ? M.calcularTotalHoras(ini, fin, refIni, refFin) + ' h' : '—';
        actualizarResumenDescanso();
    }

    // Resumen en vivo bajo las fechas de descanso: horas compensadas
    // (del banco) vs horas de descanso. Verde = ok, ámbar = diferencia
    // grande, rojo = descanso mayor a lo compensado o faltan horas.
    function actualizarResumenDescanso() {
        const body = document.getElementById('sobretiempoFechasDescansoBody');
        if (!body) return;
        let el = document.getElementById('sobretiempoResumenDescanso');
        if (!el) {
            el = document.createElement('div');
            el.id = 'sobretiempoResumenDescanso';
            el.style.cssText = 'margin:6px 0 10px;padding:8px 12px;border-radius:8px;font-size:13px;font-weight:600;';
            body.insertAdjacentElement('afterend', el);
        }
        actualizarBancoTotal();
        const d = leerBancoHoras();
        const v = window.SobretiempoValidacion.validarBanco({ selecciones: d.selecciones, fechasDescanso: d.fechasDescansoDetalle });
        const sinHoras = (d.fechasDescansoDetalle || []).length === 0 || (d.fechasDescansoDetalle || []).some(f => !f.horaInicio || !f.horaFin);
        let estilo, msg;
        const saldo = saldoBancoDisponible.toFixed(2);
        if (!(d.fechasDescansoDetalle || []).length) { estilo = ['#F1F5F9', '#64748B']; msg = `Agrega las fechas y el horario del descanso: de ahí sale el total a descontar del banco. Saldo disponible: ${saldo} h.`; }
        else if (sinHoras) { estilo = ['#FFEBEB', '#BB0000']; msg = `Falta ingreso/salida en alguna fecha del descanso. Saldo disponible: ${saldo} h.`; }
        else if (v.errores.length) { estilo = ['#FFEBEB', '#BB0000']; msg = `Total de horas de descanso: ${v.descanso.toFixed(2)} h · Saldo disponible: ${saldo} h — ${v.errores[0]}`; }
        else { estilo = ['#F1FDF6', '#107E3E']; msg = `Total de horas de descanso: ${v.descanso.toFixed(2)} h · Saldo disponible: ${saldo} h ✔`; }
        el.style.background = estilo[0]; el.style.color = estilo[1];
        el.textContent = msg;
    }

    function agregarFechaDescansoBanco(datos) {
        const d = datos || {};
        const body=document.getElementById('sobretiempoFechasDescansoBody');
        if(!body) return;
        const div=document.createElement('div');
        div.style.cssText='display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;';
        div.style.alignItems='flex-end';
        div.innerHTML=`
            <label class="hc-campo"><span class="hc-lbl">Fecha</span><input type="date" data-banco-fecha-descanso value="${window.esc(d.fecha || '')}" style="max-width:170px;"></label>
            <label class="hc-campo"><span class="hc-lbl th-ing">Ingreso</span><input type="time" data-banco-fecha-descanso-hora-inicio value="${window.esc(d.horaInicio || '')}" title="Hora de ingreso" style="max-width:120px;"></label>
            <label class="hc-campo"><span class="hc-lbl th-ref">Inicio refrigerio</span><input type="time" data-banco-fecha-descanso-refrigerio-inicio value="${window.esc(d.refrigerioInicio || '')}" title="Inicio de refrigerio (opcional)" style="max-width:120px;"></label>
            <label class="hc-campo"><span class="hc-lbl th-ref">Fin refrigerio</span><input type="time" data-banco-fecha-descanso-refrigerio-fin value="${window.esc(d.refrigerioFin || '')}" title="Fin de refrigerio (opcional)" style="max-width:120px;"></label>
            <label class="hc-campo"><span class="hc-lbl th-ing">Salida</span><input type="time" data-banco-fecha-descanso-hora-fin value="${window.esc(d.horaFin || '')}" title="Hora de salida" style="max-width:120px;"></label>
            <label class="hc-campo"><span class="hc-lbl">Horas</span><span data-banco-fecha-descanso-total class="horario-dia-total" style="min-width:70px;">—</span></label>
            <button type="button" class="btn-chip btn-chip-danger" data-accion="quitar-fecha-descanso" title="Quitar fecha"><i class="fas fa-trash"></i></button>`;
        body.appendChild(div);
        actualizarTotalFilaDescanso(div);
    }

    function inicializarBancoHoras() {
        const body=document.getElementById('sobretiempoBancoBody');
        const fechas=document.getElementById('sobretiempoFechasDescansoBody');
        const add=document.getElementById('sobretiempoBtnAgregarFechaDescanso');
        // v131: el total a descontar sale de las fechas de descanso (ver leerBancoHoras); no hay campo de horas.
        if(fechas && !fechas.dataset.init){
            fechas.addEventListener('click',e=>{ const b=e.target.closest('[data-accion="quitar-fecha-descanso"]'); if(b){ const rows=fechas.children; if(rows.length>1)b.parentElement.remove(); else { b.parentElement.querySelectorAll('input').forEach(i=>i.value=''); actualizarTotalFilaDescanso(b.parentElement); } }});
            fechas.addEventListener('input',e=>{ if(e.target.matches('[data-banco-fecha-descanso-hora-inicio],[data-banco-fecha-descanso-hora-fin],[data-banco-fecha-descanso-refrigerio-inicio],[data-banco-fecha-descanso-refrigerio-fin]')) actualizarTotalFilaDescanso(e.target.closest('div')); });
            fechas.dataset.init='1';
        }
        if(add && !add.dataset.init){ add.addEventListener('click',()=>agregarFechaDescansoBanco()); add.dataset.init='1'; }
    }

    function renderBancoHoras(banco, solicitudes, jornadaDiaria, horasPorAutorizar) {
        inicializarBancoHoras();
        const body=document.getElementById('sobretiempoBancoBody');
        if(!body) return;
        const j=parseFloat(jornadaDiaria)||8;
        // v129: las fechas se muestran solo como referencia (fecha, día, horario y horas generadas).
        // El saldo se maneja como un TOTAL único; las horas a utilizar se descuentan de ese total.
        const filas=(banco||[]).filter(x=>parseFloat(x.HORAS_GENERADAS)>0);
        const sumTodo=k=>filas.reduce((a,x)=>a+(parseFloat(x[k])||0),0);
        const totalDisp=sumTodo('HORAS_DISPONIBLES');
        body.innerHTML=filas.length ? filas.map(x=>`<tr${parseFloat(x.HORAS_DISPONIBLES)>0 ? '' : ' style="opacity:.55;"'} data-disponibles="${window.esc(x.HORAS_DISPONIBLES)}">
            <td data-fecha-banco="${window.esc(x.FECHA_SOBRETIEMPO)}" data-hora-inicio-banco="${window.esc(x.HORA_INICIO||'')}" data-hora-fin-banco="${window.esc(x.HORA_FIN||'')}">${window.esc(M.fechaATextoLegible(x.FECHA_SOBRETIEMPO))}</td>
            <td>${window.esc(x.DIA||'')}</td>
            <td>${window.esc(x.ID_SOLICITUD_ORIGEN||'')}</td>
            <td>${x.HORA_INICIO && x.HORA_FIN ? window.esc(x.HORA_INICIO+' – '+x.HORA_FIN) : '—'}</td>
            <td><strong>${window.esc(x.HORAS_GENERADAS)} h</strong></td>
        </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;color:#64748B;padding:18px;">No hay horas generadas aprobadas.${parseFloat(horasPorAutorizar) > 0 ? ` Hay ${parseFloat(horasPorAutorizar).toFixed(2)} h pendientes de aprobación de RR.HH. (se suman al banco al marcarlas como "Aprobado").` : ''}</td></tr>`;
        const foot=document.getElementById('sobretiempoBancoFoot');
        if(foot){
            const f2=v=>v.toFixed(2)+' h';
            foot.innerHTML=filas.length ? `<tr style="background:#F1F5F9;font-weight:700;">
                <td colspan="4" style="text-align:right;">TOTAL GENERADAS</td><td>${f2(sumTodo('HORAS_GENERADAS'))}</td></tr>
                <tr style="background:#F8FAFC;"><td colspan="4" style="text-align:right;">Utilizadas · Comprometidas</td><td>${f2(sumTodo('HORAS_UTILIZADAS'))} · ${f2(sumTodo('HORAS_COMPROMETIDAS'))}</td></tr>
                <tr style="background:#F1F5F9;font-weight:700;"><td colspan="4" style="text-align:right;">TOTAL DISPONIBLE</td><td style="color:#1D4ED8;">${f2(totalDisp)}</td></tr>` : '';
        }
        saldoBancoDisponible=totalDisp;
        document.getElementById('sobretiempoBancoJornada').textContent=j.toFixed(2)+' h';
        actualizarBancoTotal();
        actualizarResumenDescanso();
        const fechas=document.getElementById('sobretiempoFechasDescansoBody');
        if(fechas){fechas.innerHTML='';agregarFechaDescansoBanco();}
        actualizarBancoTotal();
        actualizarResumenDescanso();
        const obs=document.getElementById('sobretiempoBancoObservaciones'); if(obs)obs.value='';
        const dest=document.getElementById('sobretiempoBancoDestinatario'); if(dest)dest.value='';
        const res=document.getElementById('sobretiempoBancoSolicitudes');
        if(res){
            const filasSolicitudes=(solicitudes||[]).slice(0,30).map(x=>{
                const pendiente = x.ESTADO === 'PENDIENTE';
                const idDc = window.esc(x.ID_SOLICITUD_DESCANSO);
                const btnOk = pendiente
                    ? `<button type="button" class="btn-chip btn-chip-green" style="padding:6px 10px;font-size:12px;" onclick="window.sobretiempoCompletarDescansoBanco('${idDc}')"><i class="fas fa-check"></i> Confirmar uso</button>`
                    : '';
                const fechasTxt = (x.FECHAS_DESCANSO||[]).map(f => {
                    const t = M.fechaATextoLegible(f.fecha);
                    return (f.horaInicio && f.horaFin) ? `${t} ${f.horaInicio}-${f.horaFin}` : t;
                }).join(', ');
                return `<div style="font-size:12px;color:#64748B;padding:5px 0;border-top:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                    <span><strong>${idDc}</strong> · ${window.esc(x.TOTAL_HORAS)} h · ${window.esc(x.ESTADO)}${fechasTxt ? ' · ' + window.esc(fechasTxt) : ''}</span>
                    <span style="white-space:nowrap;display:inline-flex;gap:8px;align-items:center;">${btnOk}${window.AccionesRegistro.html(x.ID_SOLICITUD_DESCANSO, { desactivar: pendiente ? {} : { editar: 'ya fue confirmada como utilizada', eliminar: 'ya fue confirmada como utilizada' } })}</span>
                </div>`;
            }).join('');
            res.innerHTML = (solicitudes||[]).length
                ? `<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:2px;">Solicitudes de descanso ya generadas</div><div style="max-height:260px;overflow-y:auto;">${filasSolicitudes}</div>`
                : '';
            window.sobretiempoEnlazarAccionesDescanso?.(res);
        }
    }

    let saldoBancoDisponible = 0;

    function actualizarBancoTotal() {
        // v131: el total a descontar del banco es la suma de las horas de las fechas de descanso propuestas.
        const total=leerBancoHoras().total;
        const totalEl=document.getElementById('sobretiempoBancoTotal'); if(totalEl) totalEl.textContent=total.toFixed(2)+' h';
        const jornada=parseFloat(document.getElementById('sobretiempoBancoJornada')?.textContent)||8;
        const eq=document.getElementById('sobretiempoBancoEquivalencia'); if(eq) eq.textContent=M.calcularEquivalenciaBanco(total,jornada);
    }

    function leerBancoHoras() {
        const fechasDescanso=Array.from(document.querySelectorAll('#sobretiempoFechasDescansoBody > div')).map(div=>({
            fecha: div.querySelector('[data-banco-fecha-descanso]')?.value || '',
            horaInicio: div.querySelector('[data-banco-fecha-descanso-hora-inicio]')?.value || '',
            refrigerioInicio: div.querySelector('[data-banco-fecha-descanso-refrigerio-inicio]')?.value || '',
            refrigerioFin: div.querySelector('[data-banco-fecha-descanso-refrigerio-fin]')?.value || '',
            horaFin: div.querySelector('[data-banco-fecha-descanso-hora-fin]')?.value || '',
        })).filter(f => f.fecha).map(f => ({
            ...f,
            horas: (f.horaInicio && f.horaFin) ? M.calcularTotalHoras(f.horaInicio, f.horaFin, f.refrigerioInicio, f.refrigerioFin) : ''
        }));
        // v131: el total a descontar del banco = suma de las horas de las fechas de descanso (con horario completo).
        const total=Math.round(fechasDescanso.reduce((a,f)=>a+(parseFloat(f.horas)||0),0)*100)/100;
        // v129/v131: se reparte el total a utilizar entre las fechas generadas, empezando por la más antigua
        // (FIFO). El usuario no elige fechas; esto solo mantiene el registro de origen que exige el banco.
        // horaInicio/horaFin viajan solo para el correo (ver sobretiempo-export-correo.js).
        const selecciones=[];
        let restante=total;
        document.querySelectorAll('#sobretiempoBancoBody tr[data-disponibles]').forEach(tr=>{
            if(restante<=0.0001) return;
            const disp=parseFloat(tr.dataset.disponibles)||0;
            if(disp<=0) return;
            const d=tr.querySelectorAll('td');
            const h=Math.round(Math.min(disp,restante)*100)/100;
            restante=Math.round((restante-h)*100)/100;
            selecciones.push({
                ID_SOLICITUD_ORIGEN:d[2]?.textContent.trim()||'',
                FECHA_SOBRETIEMPO:d[0]?.dataset?.fechaBanco||'',
                HORAS_A_UTILIZAR:h,
                HORA_INICIO:d[0]?.dataset?.horaInicioBanco||'',
                HORA_FIN:d[0]?.dataset?.horaFinBanco||''
            });
        });

        const jornada=parseFloat((document.getElementById('sobretiempoBancoJornada')?.textContent||'8').replace(' h',''))||8;
        return {
            selecciones,
            fechasDescanso: fechasDescanso.map(f => f.fecha), // compatibilidad con el payload actual del backend
            fechasDescansoDetalle: fechasDescanso, // detalle completo (con horas) para el correo
            total,
            equivalencia:M.calcularEquivalenciaBanco(total,jornada),
            destinatario: document.getElementById('sobretiempoBancoDestinatario')?.value || '',
            observaciones:document.getElementById('sobretiempoBancoObservaciones')?.value||''
        };
    }

    return {
        renderLista,
        inicializarTablaFechas, agregarFilaFecha, eliminarFilaFecha, actualizarTotalHoras,
        leerFase1, horasIncompletas, pintarFase1, limpiarFase1, dependenciaPorDefecto, mostrarErrorFase1, setModoFase1,
        mostrarFormFase1, mostrarFormFase2, ocultarFormFase2, leerFase2, actualizarTotalHorasEfectivas, mostrarErrorFase2,
        actualizarResumenDescanso, inicializarBancoHoras, renderBancoHoras, actualizarBancoTotal, leerBancoHoras, agregarFechaDescansoBanco,
        inicializarTipoChips
    };
})();

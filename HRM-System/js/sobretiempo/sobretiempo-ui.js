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
                    </div>
                    <div class="horario-grupo-acciones" style="flex-wrap:wrap;justify-content:flex-end;">
                        ${botonesAutorizacionHTML(r)}
                        ${pendiente ? `
                            ${sinDescansos ? `<button type="button" class="btn-chip" data-accion="editar-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-pen"></i> Editar</button>` : ''}
                        ` : `
                            <button type="button" class="btn-chip" data-accion="ver-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-eye"></i> Ver</button>
                        `}
                        <button type="button" class="btn-chip btn-download-uniform" data-accion="exportar-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}" title="${pendiente ? 'Descargar el formato con lo registrado hasta ahora' : 'Descargar el formato completo (Secciones I, II y III)'}"><i class="fas fa-download"></i> Exportar</button>
                        <button type="button" class="btn-chip btn-chip-danger" data-accion="eliminar-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('') + totalListaHTML(registros);
    }

    // Botones del flujo de autorización según el estado actual.
    function botonesAutorizacionHTML(r) {
        const id = window.esc(r.ID_SOLICITUD);
        const est = r.ESTADO_AUTORIZACION || 'Aprobado';
        const b = (estado, icono, texto, extra) => `<button type="button" class="btn-chip ${extra || ''}" data-accion="autorizar-solicitud" data-id="${id}" data-estado="${window.esc(estado)}"><i class="fas ${icono}"></i> ${texto}</button>`;
        const rechazar = b('Rechazado', 'fa-ban', 'Rechazar', 'btn-chip-danger');
        if (est === 'Pendiente de aprobación') return b('Aprobado', 'fa-check-double', 'Aprobado por RR.HH.', 'btn-chip-green') + rechazar;
        if (est === 'Aprobado') return parseFloat(r.HORAS_BANCO || 0) > 0 ? '' : b('Pendiente de aprobación', 'fa-undo', 'Revertir aprobación');
        if (est === 'Rechazado') return b('Pendiente de aprobación', 'fa-redo', 'Reabrir');
        return '';
    }

    // Suma de horas de todas las solicitudes del empleado (pie de la lista)
    function totalListaHTML(registros) {
        const num = v => parseFloat(v) || 0;
        const esAut = r => (r.ESTADO_AUTORIZACION || 'Aprobado') === 'Aprobado';
        const generadas = registros.filter(esAut).reduce((a, r) => a + num(r.TOTAL_HORAS), 0);
        const porAutorizar = registros.filter(r => !esAut(r) && r.ESTADO_AUTORIZACION !== 'Rechazado').reduce((a, r) => a + num(r.TOTAL_HORAS), 0);
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
            justificacion: document.getElementById('sobretiempoJustificacion')?.value || ''
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
        const d = leerBancoHoras();
        const v = window.SobretiempoValidacion.validarBanco({ selecciones: d.selecciones, fechasDescanso: d.fechasDescansoDetalle });
        const sinHoras = (d.fechasDescansoDetalle || []).length === 0 || (d.fechasDescansoDetalle || []).some(f => !f.horaInicio || !f.horaFin);
        let estilo, msg;
        if (!d.selecciones.length) { estilo = ['#F1F5F9', '#64748B']; msg = 'Selecciona las horas a utilizar del banco.'; }
        else if (sinHoras) { estilo = ['#FFEBEB', '#BB0000']; msg = `Compensadas: ${v.compensadas.toFixed(2)} h · Falta ingreso/salida del descanso.`; }
        else if (v.errores.length) { estilo = ['#FFEBEB', '#BB0000']; msg = `Compensadas: ${v.compensadas.toFixed(2)} h · Descanso: ${v.descanso.toFixed(2)} h — ${v.errores[0]}`; }
        else { estilo = ['#F1FDF6', '#107E3E']; msg = `Compensadas: ${v.compensadas.toFixed(2)} h · Descanso: ${v.descanso.toFixed(2)} h ✔ (diferencia ${(v.compensadas - v.descanso).toFixed(2)} h)`; }
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
        if(body && !body.dataset.init){
            body.addEventListener('input',e=>{ if(e.target.matches('[data-banco-horas]')) actualizarBancoTotal(); });
            body.addEventListener('change',e=>{ if(e.target.matches('[data-banco-check]')) { const tr=e.target.closest('tr'); const input=tr?.querySelector('[data-banco-horas]'); if(input){ input.disabled=!e.target.checked; if(e.target.checked && (!input.value || parseFloat(input.value)<=0)) input.value=input.max; if(!e.target.checked) input.value='0'; } actualizarBancoTotal(); }});
            body.dataset.init='1';
        }
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
        const disponibles=(banco||[]).filter(x=>parseFloat(x.HORAS_DISPONIBLES)>0);
        body.innerHTML=disponibles.length ? disponibles.map((x,i)=>`<tr>
            <td style="text-align:center;"><input type="checkbox" data-banco-check></td>
            <td data-fecha-banco="${window.esc(x.FECHA_SOBRETIEMPO)}" data-hora-inicio-banco="${window.esc(x.HORA_INICIO||'')}" data-hora-fin-banco="${window.esc(x.HORA_FIN||'')}">${window.esc(M.fechaATextoLegible(x.FECHA_SOBRETIEMPO))}</td>
            <td>${window.esc(x.DIA||'')}</td>
            <td>${window.esc(x.ID_SOLICITUD_ORIGEN||'')}</td>
            <td>${window.esc(x.HORAS_GENERADAS)} h</td>
            <td>${window.esc(x.HORAS_UTILIZADAS)} h</td>
            <td>${window.esc(x.HORAS_COMPROMETIDAS)} h</td>
            <td><strong>${window.esc(x.HORAS_DISPONIBLES)} h</strong></td>
            <td><input type="number" min="0" max="${window.esc(x.HORAS_DISPONIBLES)}" step="0.25" value="0" data-banco-horas disabled style="width:90px;text-align:right;"></td>
        </tr>`).join('') : `<tr><td colspan="9" style="text-align:center;color:#64748B;padding:18px;">No hay horas disponibles para utilizar.${parseFloat(horasPorAutorizar) > 0 ? ` Hay ${parseFloat(horasPorAutorizar).toFixed(2)} h pendientes de aprobación de RR.HH. (se habilitan al marcarlas como "Aprobado").` : ''}</td></tr>`;
        const foot=document.getElementById('sobretiempoBancoFoot');
        if(foot){
            const sum=k=>disponibles.reduce((a,x)=>a+(parseFloat(x[k])||0),0).toFixed(2)+' h';
            foot.innerHTML=disponibles.length ? `<tr style="background:#F1F5F9;font-weight:700;">
                <td colspan="4" style="text-align:right;">TOTAL</td>
                <td>${sum('HORAS_GENERADAS')}</td>
                <td>${sum('HORAS_UTILIZADAS')}</td>
                <td>${sum('HORAS_COMPROMETIDAS')}</td>
                <td style="color:#1D4ED8;">${sum('HORAS_DISPONIBLES')}</td>
                <td></td>
            </tr>` : '';
        }
        document.getElementById('sobretiempoBancoJornada').textContent=j.toFixed(2)+' h';
        actualizarBancoTotal();
        const fechas=document.getElementById('sobretiempoFechasDescansoBody');
        if(fechas){fechas.innerHTML='';agregarFechaDescansoBanco();}
        const obs=document.getElementById('sobretiempoBancoObservaciones'); if(obs)obs.value='';
        const dest=document.getElementById('sobretiempoBancoDestinatario'); if(dest)dest.value='';
        const res=document.getElementById('sobretiempoBancoSolicitudes');
        if(res){
            const filasSolicitudes=(solicitudes||[]).slice(0,30).map(x=>{
                const pendiente = x.ESTADO === 'PENDIENTE';
                const idDc = window.esc(x.ID_SOLICITUD_DESCANSO);
                const btnCorreo = `<button type="button" class="btn-chip btn-chip-blue" style="padding:2px 10px;font-size:11px;margin-left:8px;" onclick="window.sobretiempoGenerarCorreoDescanso('${idDc}')"><i class="fas fa-envelope"></i> Generar correo</button>`;
                const btnOk = pendiente
                    ? `<button type="button" class="btn-chip btn-chip-green" style="padding:2px 10px;font-size:11px;margin-left:8px;" onclick="window.sobretiempoCompletarDescansoBanco('${idDc}')"><i class="fas fa-check"></i> Confirmar uso</button>`
                    : '';
                const fechasTxt = (x.FECHAS_DESCANSO||[]).map(f => {
                    const t = M.fechaATextoLegible(f.fecha);
                    return (f.horaInicio && f.horaFin) ? `${t} ${f.horaInicio}-${f.horaFin}` : t;
                }).join(', ');
                return `<div style="font-size:12px;color:#64748B;padding:5px 0;border-top:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                    <span><strong>${idDc}</strong> · ${window.esc(x.TOTAL_HORAS)} h · ${window.esc(x.ESTADO)}${fechasTxt ? ' · ' + window.esc(fechasTxt) : ''}</span>
                    <span style="white-space:nowrap;">${btnCorreo}${btnOk}</span>
                </div>`;
            }).join('');
            res.innerHTML = (solicitudes||[]).length
                ? `<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:2px;">Solicitudes de descanso ya generadas</div><div style="max-height:260px;overflow-y:auto;">${filasSolicitudes}</div>`
                : '';
        }
    }

    function actualizarBancoTotal() {
        let total=0;
        document.querySelectorAll('#sobretiempoBancoBody tr').forEach(tr=>{
            const check=tr.querySelector('[data-banco-check]'), input=tr.querySelector('[data-banco-horas]');
            if(check?.checked) {
                const max=parseFloat(input?.max)||0, val=parseFloat(input?.value)||0;
                if(val>max && input) input.value=max;
                total+=Math.min(Math.max(val,0),max);
            }
        });
        const totalEl=document.getElementById('sobretiempoBancoTotal'); if(totalEl) totalEl.textContent=total.toFixed(2)+' h';
        const jornada=parseFloat(document.getElementById('sobretiempoBancoJornada')?.textContent)||8;
        const eq=document.getElementById('sobretiempoBancoEquivalencia'); if(eq) eq.textContent=M.calcularEquivalenciaBanco(total,jornada);
        actualizarResumenDescanso();
    }

    function leerBancoHoras() {
        const selecciones=[];
        document.querySelectorAll('#sobretiempoBancoBody tr').forEach(tr=>{
            const check=tr.querySelector('[data-banco-check]'), input=tr.querySelector('[data-banco-horas]');
            if(!check?.checked) return;
            const d=tr.querySelectorAll('td');
            const h=parseFloat(input?.value)||0;
            if(h<=0)return;
            // horaInicio/horaFin viajan solo para el correo (ver
            // sobretiempo-export-correo.js): NO forman parte de lo
            // que se envía al backend (crearSolicitudDescansoBanco
            // solo necesita origen+fecha+horas para descontar del
            // banco), así que no cambian el payload existente.
            selecciones.push({
                ID_SOLICITUD_ORIGEN:d[3]?.textContent.trim()||'',
                FECHA_SOBRETIEMPO:d[1]?.dataset?.fechaBanco||'',
                HORAS_A_UTILIZAR:h,
                HORA_INICIO:d[1]?.dataset?.horaInicioBanco||'',
                HORA_FIN:d[1]?.dataset?.horaFinBanco||''
            });
        });
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
        const total=parseFloat((document.getElementById('sobretiempoBancoTotal')?.textContent||'0').replace(' h',''))||0;
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
        leerFase1, pintarFase1, limpiarFase1, dependenciaPorDefecto, mostrarErrorFase1, setModoFase1,
        mostrarFormFase1, mostrarFormFase2, ocultarFormFase2, leerFase2, actualizarTotalHorasEfectivas, mostrarErrorFase2,
        actualizarResumenDescanso, inicializarBancoHoras, renderBancoHoras, actualizarBancoTotal, leerBancoHoras, agregarFechaDescansoBanco,
        inicializarTipoChips
    };
})();

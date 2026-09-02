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
            const sinDescansos = (r.DESCANSOS || []).length === 0;
            const nFechas = (r.FECHAS || []).length;
            const etiquetaFecha = nFechas > 1
                ? `${window.esc(M.fechaATextoLegible(r.FECHAS[0].fecha))} y ${nFechas - 1} más`
                : window.esc(M.fechaATextoLegible(r.FECHA_EJECUCION));
            const horasTexto = r.ESTADO === 'Descanso parcial'
                ? `${window.esc(r.TOTAL_HORAS || '0')}h generadas · ${window.esc(r.HORAS_PENDIENTES || '0')}h pendientes`
                : `${window.esc(r.TOTAL_HORAS || '0')}h generadas`;
            return `
                <div class="horario-grupo-item ${activo ? 'activo' : ''}" data-id-solicitud="${window.esc(r.ID_SOLICITUD)}">
                    <div class="horario-grupo-info">
                        <span class="horario-grupo-id">${window.esc(r.ID_SOLICITUD)}</span>
                        <span class="badge-estado ${info.clase}"><i class="fas ${info.icono}"></i> ${window.esc(r.ESTADO)}</span>
                        <span class="horario-grupo-vigencia">${window.esc(r.TIPO_TRABAJO)} · ${etiquetaFecha}</span>
                        <span class="horario-grupo-horas">${horasTexto}</span>
                    </div>
                    <div class="horario-grupo-acciones">
                        ${pendiente ? `
                            <button type="button" class="btn-chip btn-chip-green" data-accion="registrar-descanso" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-bed"></i> Registrar descanso</button>
                            ${sinDescansos ? `<button type="button" class="btn-chip" data-accion="editar-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-pen"></i> Editar</button>` : ''}
                        ` : `
                            <button type="button" class="btn-chip" data-accion="ver-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-eye"></i> Ver</button>
                        `}
                        <button type="button" class="btn-chip btn-chip-blue" data-accion="exportar-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}" title="${pendiente ? 'Exportar el formato con lo registrado hasta ahora' : 'Exportar el formato completo (Secciones I, II y III)'}"><i class="fas fa-file-excel"></i> Exportar</button>
                        <button type="button" class="btn-chip btn-chip-danger" data-accion="eliminar-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ---- TABLA DE FECHAS (Fase 1) ----

    function filaFechaHTML(f) {
        const d = f || {};
        return `
            <tr class="sobretiempo-fecha-row">
                <td><input type="date" data-field="fecha" value="${window.esc(d.fecha || '')}"></td>
                <td><input type="time" data-field="horaInicio" value="${window.esc(d.horaInicio || '')}"></td>
                <td><input type="time" data-field="horaFin" value="${window.esc(d.horaFin || '')}"></td>
                <td><input type="time" data-field="refrigerioInicio" value="${window.esc(d.refrigerioInicio || '')}"></td>
                <td><input type="time" data-field="refrigerioFin" value="${window.esc(d.refrigerioFin || '')}"></td>
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

    function limpiarFase1() {
        document.querySelectorAll('input[name="sobretiempoTipo"]').forEach(r => r.checked = false);
        const dependenciaEl = document.getElementById('sobretiempoDependencia');
        if (dependenciaEl) dependenciaEl.value = '';

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

    function mostrarFormFase2(registro) {
        document.getElementById('sobretiempoFormFase1').style.display = 'none';
        document.getElementById('sobretiempoFormFase2').style.display = 'block';
        document.getElementById('sobretiempoFooterFase1').style.display = 'none';
        document.getElementById('sobretiempoFooterFase2').style.display = 'flex';
        inicializarResumenFase2();

        const fechas = registro.FECHAS || [];
        // Se sugiere el horario de la ÚLTIMA fecha trabajada como
        // punto de partida; Control de Asistencia lo ajusta al
        // horario real en que se tomó este tramo del descanso.
        const ultima = fechas.length ? fechas[fechas.length - 1] : {};

        const chipStyle = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#EFF6FF;color:#1D4ED8;border-radius:12px;font-size:12px;font-weight:600;margin-right:8px;margin-bottom:6px;';
        const chipPendiente = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#FEF3C7;color:#B45309;border-radius:12px;font-size:12px;font-weight:700;margin-right:8px;margin-bottom:6px;';
        const fechasTexto = fechas
            .map(f => `${M.fechaATextoLegible(f.fecha)} (${f.horaInicio}-${f.horaFin}${f.horas ? ', ' + f.horas + 'h' : ''})`)
            .join(' · ');

        document.getElementById('sobretiempoFase2Resumen').innerHTML = `
            <div>
                <span style="${chipStyle}"><i class="fas fa-tag"></i> ${window.esc(registro.TIPO_TRABAJO)}</span>
                <span style="${chipStyle}"><i class="fas fa-calendar"></i> ${window.esc(fechasTexto)}</span>
                <span style="${chipStyle}"><i class="fas fa-business-time"></i> Generado: ${window.esc(registro.TOTAL_HORAS)} h</span>
                <span style="${chipStyle}"><i class="fas fa-bed"></i> Ya descansado: ${window.esc(registro.TOTAL_HORAS_EFECTIVAS)} h</span>
                <span style="${chipPendiente}"><i class="fas fa-hourglass-half"></i> Pendiente: ${window.esc(registro.HORAS_PENDIENTES)} h</span>
            </div>
            <p style="font-size:13px;color:#64748B;margin-top:8px;"><strong>Actividades:</strong> ${window.esc(registro.ACTIVIDADES)}</p>
            <div style="margin-top:8px;">
                <strong style="font-size:13px;color:#334155;">Descansos ya registrados</strong>
                ${renderDescansosRegistrados(registro.DESCANSOS)}
            </div>
        `;

        document.getElementById('sobretiempoFechaDescanso').value = '';
        document.getElementById('sobretiempoHoraInicioDescanso').value = ultima.horaInicio || '';
        document.getElementById('sobretiempoHoraFinDescanso').value = ultima.horaFin || '';
        document.getElementById('sobretiempoRefrigerioDescansoInicio').value = '';
        document.getElementById('sobretiempoRefrigerioDescansoFin').value = '';
        document.getElementById('sobretiempoObservacionesDescanso').value = '';
        mostrarErrorFase2('');
        actualizarTotalHorasEfectivas();
    }

    function ocultarFormFase2() {
        mostrarFormFase1();
    }

    function leerFase2() {
        return {
            fechaDescanso: document.getElementById('sobretiempoFechaDescanso')?.value || '',
            horaInicioDescanso: document.getElementById('sobretiempoHoraInicioDescanso')?.value || '',
            horaFinDescanso: document.getElementById('sobretiempoHoraFinDescanso')?.value || '',
            refrigerioDescansoInicio: document.getElementById('sobretiempoRefrigerioDescansoInicio')?.value || '',
            refrigerioDescansoFin: document.getElementById('sobretiempoRefrigerioDescansoFin')?.value || '',
            observaciones: document.getElementById('sobretiempoObservacionesDescanso')?.value || ''
        };
    }

    function actualizarTotalHorasEfectivas() {
        const { horaInicioDescanso, horaFinDescanso, refrigerioDescansoInicio, refrigerioDescansoFin } = leerFase2();
        const total = document.getElementById('sobretiempoTotalHorasEfectivas');
        if (total) total.textContent = M.calcularTotalHoras(horaInicioDescanso, horaFinDescanso, refrigerioDescansoInicio, refrigerioDescansoFin) + ' h';
        const refrigerio = document.getElementById('sobretiempoRefrigerioDescansoDuracion');
        if (refrigerio) refrigerio.textContent = (refrigerioDescansoInicio && refrigerioDescansoFin) ? '−' + M.calcularDuracionRefrigerio(refrigerioDescansoInicio, refrigerioDescansoFin) + ' h de refrigerio' : 'Sin refrigerio registrado';
    }

    return {
        renderLista,
        inicializarTablaFechas, agregarFilaFecha, eliminarFilaFecha, actualizarTotalHoras,
        leerFase1, pintarFase1, limpiarFase1, mostrarErrorFase1, setModoFase1,
        mostrarFormFase1, mostrarFormFase2, ocultarFormFase2, leerFase2, actualizarTotalHorasEfectivas, mostrarErrorFase2,
        inicializarTipoChips
    };
})();

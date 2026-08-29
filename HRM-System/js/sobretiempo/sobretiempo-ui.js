// ============================================================
// SOBRETIEMPO-UI.JS — Renderizado y manipulación del DOM del modal
// ============================================================
// Mismo criterio que horario-ui.js: todo lo que lee/escribe el DOM
// del módulo Sobretiempo vive aquí. sobretiempo.js decide QUÉ hacer;
// este archivo decide CÓMO pintarlo.
//
// La Fase 1 admite hasta M.MAX_FECHAS filas de fecha/hora (tabla
// #sobretiempoFechasBody, mismo patrón visual que la tabla semanal
// de Horarios): cada fila es un <tr data-field="..."> sin ids fijos
// (se leen/escriben por delegación), porque a diferencia de Horarios
// (7 días fijos) acá el número de filas es variable.
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
            const pendiente = r.ESTADO === 'Pendiente de descanso';
            const nFechas = (r.FECHAS || []).length;
            const etiquetaFecha = nFechas > 1
                ? `${window.esc(M.fechaATextoLegible(r.FECHAS[0].fecha))} y ${nFechas - 1} más`
                : window.esc(M.fechaATextoLegible(r.FECHA_EJECUCION));
            return `
                <div class="horario-grupo-item ${activo ? 'activo' : ''}" data-id-solicitud="${window.esc(r.ID_SOLICITUD)}">
                    <div class="horario-grupo-info">
                        <span class="horario-grupo-id">${window.esc(r.ID_SOLICITUD)}</span>
                        <span class="badge-estado ${info.clase}"><i class="fas ${info.icono}"></i> ${window.esc(r.ESTADO)}</span>
                        <span class="horario-grupo-vigencia">${window.esc(r.TIPO_TRABAJO)} · ${etiquetaFecha}</span>
                        <span class="horario-grupo-horas">${window.esc(r.TOTAL_HORAS || '0')}h generadas</span>
                    </div>
                    <div class="horario-grupo-acciones">
                        ${pendiente ? `
                            <button type="button" class="btn-chip btn-chip-green" data-accion="registrar-descanso" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-bed"></i> Registrar descanso</button>
                            <button type="button" class="btn-chip" data-accion="editar-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-pen"></i> Editar</button>
                        ` : `
                            <button type="button" class="btn-chip" data-accion="ver-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-eye"></i> Ver</button>
                        `}
                        <button type="button" class="btn-chip btn-chip-blue" data-accion="exportar-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}" title="${pendiente ? 'Exportar el formato para trámite de firmas (Secciones I y II)' : 'Exportar el formato completo (Secciones I, II y III)'}"><i class="fas fa-file-excel"></i> Exportar</button>
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

    // Delegación de eventos sobre el tbody (se registra UNA sola vez;
    // sigue funcionando aunque se agreguen/quiten filas después).
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

    // Recalcula las horas efectivas de CADA fila (jornada − refrigerio
    // de esa fila) y el total general (suma de todas las filas).
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

    // Mismo mensaje de validación único que usa Horarios (horarioMsgValidacion),
    // reutilizado para Fase 1 y Fase 2 — solo una de las dos está visible
    // a la vez, así que no hace falta un span por cada una.
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

    function mostrarFormFase2(registro) {
        document.getElementById('sobretiempoFormFase1').style.display = 'none';
        document.getElementById('sobretiempoFormFase2').style.display = 'block';
        document.getElementById('sobretiempoFooterFase1').style.display = 'none';
        document.getElementById('sobretiempoFooterFase2').style.display = 'flex';

        const fechas = registro.FECHAS || [];
        // Se sugiere el horario de la ÚLTIMA fecha registrada como
        // punto de partida; Control de Asistencia lo ajusta al
        // horario real en que se tomó el descanso.
        const ultima = fechas.length ? fechas[fechas.length - 1] : {};

        const chipStyle = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#EFF6FF;color:#1D4ED8;border-radius:12px;font-size:12px;font-weight:600;margin-right:8px;margin-bottom:6px;';
        const fechasTexto = fechas
            .map(f => `${M.fechaATextoLegible(f.fecha)} (${f.horaInicio}-${f.horaFin}${f.horas ? ', ' + f.horas + 'h' : ''})`)
            .join(' · ');

        document.getElementById('sobretiempoFase2Resumen').innerHTML = `
            <div>
                <span style="${chipStyle}"><i class="fas fa-tag"></i> ${window.esc(registro.TIPO_TRABAJO)}</span>
                <span style="${chipStyle}"><i class="fas fa-calendar"></i> ${window.esc(fechasTexto)}</span>
                <span style="${chipStyle}"><i class="fas fa-business-time"></i> Total generado: ${window.esc(registro.TOTAL_HORAS)} h</span>
            </div>
            <p style="font-size:13px;color:#64748B;margin-top:8px;"><strong>Actividades:</strong> ${window.esc(registro.ACTIVIDADES)}</p>
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

    // Recalcula "horas efectivas de descanso" (jornada de descanso −
    // su propio refrigerio) — misma lógica que actualizarTotalHoras
    // de Fase 1, aplicada al horario del descanso compensatorio.
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

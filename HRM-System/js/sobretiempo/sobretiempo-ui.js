// ============================================================
// SOBRETIEMPO-UI.JS — Renderizado y manipulación del DOM del modal
// ============================================================
// Mismo criterio que horario-ui.js: todo lo que lee/escribe el DOM
// del módulo Sobretiempo vive aquí. sobretiempo.js decide QUÉ hacer;
// este archivo decide CÓMO pintarlo.
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
            return `
                <div class="horario-grupo-item ${activo ? 'activo' : ''}" data-id-solicitud="${window.esc(r.ID_SOLICITUD)}">
                    <div class="horario-grupo-info">
                        <span class="horario-grupo-id">${window.esc(r.ID_SOLICITUD)}</span>
                        <span class="badge-estado ${info.clase}"><i class="fas ${info.icono}"></i> ${window.esc(r.ESTADO)}</span>
                        <span class="horario-grupo-vigencia">${window.esc(r.TIPO_TRABAJO)} · ${window.esc(M.fechaATextoLegible(r.FECHA_EJECUCION))}</span>
                        <span class="horario-grupo-horas">${window.esc(r.TOTAL_HORAS || '0')}h generadas</span>
                    </div>
                    <div class="horario-grupo-acciones">
                        ${pendiente ? `
                            <button type="button" class="btn-chip btn-chip-green" data-accion="registrar-descanso" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-bed"></i> Registrar descanso</button>
                            <button type="button" class="btn-chip" data-accion="editar-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-pen"></i> Editar</button>
                        ` : `
                            <button type="button" class="btn-chip" data-accion="ver-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-eye"></i> Ver</button>
                            <button type="button" class="btn-chip btn-chip-blue" data-accion="exportar-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}"><i class="fas fa-file-excel"></i> Exportar</button>
                        `}
                        <button type="button" class="btn-chip btn-chip-danger" data-accion="eliminar-solicitud" data-id="${window.esc(r.ID_SOLICITUD)}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ---- FORM FASE 1 (generación de horas) ----

    function leerFase1() {
        const tipoEl = document.querySelector('input[name="sobretiempoTipo"]:checked');
        return {
            tipoTrabajo: tipoEl ? tipoEl.value : '',
            dependencia: document.getElementById('sobretiempoDependencia')?.value || '',
            fechaEjecucion: document.getElementById('sobretiempoFechaEjecucion')?.value || '',
            horaInicio: document.getElementById('sobretiempoHoraInicio')?.value || '',
            horaFin: document.getElementById('sobretiempoHoraFin')?.value || '',
            actividades: document.getElementById('sobretiempoActividades')?.value || '',
            justificacion: document.getElementById('sobretiempoJustificacion')?.value || ''
        };
    }

    function pintarFase1(registro) {
        document.querySelectorAll('input[name="sobretiempoTipo"]').forEach(r => {
            r.checked = (r.value === registro.TIPO_TRABAJO);
        });
        document.getElementById('sobretiempoDependencia').value = registro.DEPENDENCIA || '';
        document.getElementById('sobretiempoFechaEjecucion').value = (registro.FECHA_EJECUCION || '').length === 10
            ? registro.FECHA_EJECUCION
            : window.SobretiempoModel.fechaATextoLegible(registro.FECHA_EJECUCION).split('/').reverse().join('-');
        document.getElementById('sobretiempoHoraInicio').value = registro.HORA_INICIO || '';
        document.getElementById('sobretiempoHoraFin').value = registro.HORA_FIN || '';
        document.getElementById('sobretiempoActividades').value = registro.ACTIVIDADES || '';
        document.getElementById('sobretiempoJustificacion').value = registro.JUSTIFICACION || '';
        sincronizarTipoChips();
        actualizarTotalHoras();
    }

    function limpiarFase1() {
        document.querySelectorAll('input[name="sobretiempoTipo"]').forEach(r => r.checked = false);
        ['sobretiempoDependencia', 'sobretiempoFechaEjecucion', 'sobretiempoHoraInicio', 'sobretiempoHoraFin', 'sobretiempoActividades', 'sobretiempoJustificacion'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        sincronizarTipoChips();
        actualizarTotalHoras();
        mostrarErrorFase1('');
    }

    function actualizarTotalHoras() {
        const { horaInicio, horaFin } = leerFase1();
        const total = document.getElementById('sobretiempoTotalHoras');
        if (total) total.textContent = M.calcularTotalHoras(horaInicio, horaFin) + ' h';
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
    // Alterna la clase .checked del <label> contenedor cuando cambia el
    // radio, para que se pinte igual que los chips de acciones rápidas
    // de Horarios. Delegado sobre el contenedor (existe desde el
    // primer render del HTML, nunca se vuelve a crear), así que basta
    // con engancharlo una sola vez.
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

        const chipStyle = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#EFF6FF;color:#1D4ED8;border-radius:12px;font-size:12px;font-weight:600;margin-right:8px;margin-bottom:6px;';
        document.getElementById('sobretiempoFase2Resumen').innerHTML = `
            <div>
                <span style="${chipStyle}"><i class="fas fa-tag"></i> ${window.esc(registro.TIPO_TRABAJO)}</span>
                <span style="${chipStyle}"><i class="fas fa-calendar"></i> Horas generadas: ${window.esc(M.fechaATextoLegible(registro.FECHA_EJECUCION))}</span>
                <span style="${chipStyle}"><i class="fas fa-clock"></i> ${window.esc(registro.HORA_INICIO)} a ${window.esc(registro.HORA_FIN)} (${window.esc(registro.TOTAL_HORAS)} h)</span>
            </div>
            <p style="font-size:13px;color:#64748B;margin-top:8px;"><strong>Actividades:</strong> ${window.esc(registro.ACTIVIDADES)}</p>
        `;

        document.getElementById('sobretiempoFechaDescanso').value = '';
        document.getElementById('sobretiempoHorasEfectivas').value = registro.TOTAL_HORAS || '';
        document.getElementById('sobretiempoObservacionesDescanso').value = '';
        mostrarErrorFase2('');
    }

    function ocultarFormFase2() {
        mostrarFormFase1();
    }

    function leerFase2() {
        return {
            fechaDescanso: document.getElementById('sobretiempoFechaDescanso')?.value || '',
            totalHorasEfectivas: document.getElementById('sobretiempoHorasEfectivas')?.value || '',
            observaciones: document.getElementById('sobretiempoObservacionesDescanso')?.value || ''
        };
    }

    return {
        renderLista,
        leerFase1, pintarFase1, limpiarFase1, actualizarTotalHoras, mostrarErrorFase1, setModoFase1,
        mostrarFormFase1, mostrarFormFase2, ocultarFormFase2, leerFase2, mostrarErrorFase2,
        inicializarTipoChips
    };
})();

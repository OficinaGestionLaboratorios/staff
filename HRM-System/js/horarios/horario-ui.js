// ============================================================
// HORARIO-UI.JS — Renderizado y manipulación del DOM del modal
// ============================================================
// Todo lo que lee/escribe el DOM del módulo Horarios vive aquí.
// horarios.js (el orquestador) decide QUÉ hacer; este archivo decide
// CÓMO pintarlo. Usa window.HorarioModel para los cálculos, nunca
// los repite.
// ============================================================

window.HorarioUI = (function() {
    const M = window.HorarioModel;

    // ---- Tabla semanal (7 filas, una por día) ----

    function renderTabla() {
        const tbody = document.getElementById('horarioSemanalBody');
        if (!tbody) return;

        tbody.innerHTML = M.DIAS.map(dia => `
            <tr class="dia-row" data-dia="${dia.key}">
                <td><span class="horario-dia-nombre dia-inactivo">${dia.corto}</span></td>
                <td style="text-align:center;">
                    <input type="checkbox" class="horario-checkbox-activo" data-field="activo">
                </td>
                <td><input type="time" data-field="ingreso" disabled></td>
                <td><input type="time" data-field="inicioRef" disabled></td>
                <td><input type="time" data-field="finRef" disabled></td>
                <td><input type="time" data-field="salida" disabled></td>
                <td><span class="horario-dia-total">0:00</span></td>
                <td><input type="text" data-field="obs" placeholder="Obs..." disabled></td>
            </tr>
        `).join('');

        // Delegación de eventos: un listener para toda la tabla, no uno
        // por celda (más liviano, y sigue funcionando aunque las filas
        // se reconstruyan).
        tbody.addEventListener('change', function(e) {
            const row = e.target.closest('tr');
            if (!row) return;
            if (e.target.dataset.field === 'activo') actualizarEstadoFila(row);
            actualizarResumen();
        });
        tbody.addEventListener('input', function(e) {
            if (!e.target.closest('tr')) return;
            if (['ingreso', 'inicioRef', 'finRef', 'salida'].includes(e.target.dataset.field)) {
                actualizarResumen();
            }
        });
    }

    // Habilita/deshabilita los campos de una fila según su checkbox activo.
    function actualizarEstadoFila(row) {
        const activo = row.querySelector('[data-field="activo"]').checked;
        const nombre = row.querySelector('.horario-dia-nombre');
        row.classList.toggle('dia-activo', activo);
        nombre.classList.toggle('dia-inactivo', !activo);

        ['ingreso', 'inicioRef', 'finRef', 'salida', 'obs'].forEach(f => {
            const input = row.querySelector(`[data-field="${f}"]`);
            if (input) input.disabled = !activo;
        });

        if (!activo) {
            ['ingreso', 'inicioRef', 'finRef', 'salida', 'obs'].forEach(f => {
                const input = row.querySelector(`[data-field="${f}"]`);
                if (input) input.value = '';
            });
        }
    }

    // Lee el estado actual de las 7 filas como un array de objetos
    // { dia, activo, ingreso, inicioRef, finRef, salida, obs }.
    function leerFilas() {
        return Array.from(document.querySelectorAll('#horarioSemanalBody tr')).map(row => ({
            dia: row.dataset.dia,
            activo: row.querySelector('[data-field="activo"]').checked,
            ingreso: row.querySelector('[data-field="ingreso"]').value,
            inicioRef: row.querySelector('[data-field="inicioRef"]').value,
            finRef: row.querySelector('[data-field="finRef"]').value,
            salida: row.querySelector('[data-field="salida"]').value,
            obs: row.querySelector('[data-field="obs"]').value
        }));
    }

    // Recalcula el total de cada fila y el resumen semanal completo.
    function actualizarResumen() {
        const filas = leerFilas();

        document.querySelectorAll('#horarioSemanalBody tr').forEach((row, i) => {
            const min = M.calcularMinutosDia(filas[i]);
            const totalEl = row.querySelector('.horario-dia-total');
            totalEl.textContent = M.minutosATexto(min);
            totalEl.classList.toggle('con-horas', min > 0);
        });

        const { totalMin, diasActivos, promedioMin } = M.calcularResumenSemana(filas);

        const contador = document.getElementById('horarioDiasContador');
        if (contador) contador.textContent = `(${diasActivos} día${diasActivos === 1 ? '' : 's'} seleccionado${diasActivos === 1 ? '' : 's'})`;

        const totalEl = document.getElementById('horarioHorasSemana');
        const diasEl = document.getElementById('horarioDiasActivos');
        const promedioEl = document.getElementById('horarioPromedioDia');
        if (totalEl) totalEl.textContent = M.minutosATexto(totalMin);
        if (diasEl) diasEl.textContent = String(diasActivos);
        if (promedioEl) promedioEl.textContent = M.minutosATexto(promedioMin);
    }

    // Rellena la tabla completa a partir de un array de días
    // ya guardado en BD_HORARIOS (para el modo edición).
    function pintarDiasEnTabla(diasGuardados) {
        const porNombre = {};
        (diasGuardados || []).forEach(d => { porNombre[d.dia] = d; });

        document.querySelectorAll('#horarioSemanalBody tr').forEach(row => {
            const guardado = porNombre[row.dataset.dia];
            const checkbox = row.querySelector('[data-field="activo"]');
            checkbox.checked = !!guardado;
            actualizarEstadoFila(row);

            if (guardado) {
                row.querySelector('[data-field="ingreso"]').value = guardado.ingreso || '';
                row.querySelector('[data-field="inicioRef"]').value = guardado.inicioRef || '';
                row.querySelector('[data-field="finRef"]').value = guardado.finRef || '';
                row.querySelector('[data-field="salida"]').value = guardado.salida || '';
                row.querySelector('[data-field="obs"]').value = guardado.obs || '';
            }
        });

        actualizarResumen();
    }

    // ---- Panel "Horarios registrados de este empleado" ----

    function renderGruposExistentes(grupos, idGrupoActivo) {
        const wrap = document.getElementById('horarioGruposExistentesWrap');
        const cont = document.getElementById('horarioGruposExistentes');
        if (!wrap || !cont) return;

        if (!grupos || grupos.length === 0) {
            wrap.style.display = 'none';
            cont.innerHTML = '';
            return;
        }

        wrap.style.display = 'block';
        cont.innerHTML = grupos.map(g => {
            const info = M.ESTADO_INFO[g.ESTADO] || M.ESTADO_INFO['Vigente'];
            const activo = g.ID_GRUPO === idGrupoActivo;
            const vigencia = g.FECHA_FIN
                ? `${M.fechaATextoLegible(g.FECHA_INICIO)} → ${M.fechaATextoLegible(g.FECHA_FIN)}`
                : `Desde ${M.fechaATextoLegible(g.FECHA_INICIO)}`;
            return `
                <div class="horario-grupo-item ${activo ? 'activo' : ''}" data-id-grupo="${window.esc(g.ID_GRUPO)}">
                    <div class="horario-grupo-info">
                        <span class="horario-grupo-id">${window.esc(g.ID_GRUPO)}</span>
                        <span class="badge-estado ${info.clase}"><i class="fas ${info.icono}"></i> ${window.esc(g.ESTADO)}</span>
                        <span class="horario-grupo-vigencia">${window.esc(vigencia)}</span>
                        <span class="horario-grupo-horas">${window.esc(M.horasDecimalATexto(g.HORAS_SEMANA))}h/sem</span>
                    </div>
                    <div class="horario-grupo-acciones">
                        <button type="button" class="btn-chip" data-accion="editar-grupo" data-id-grupo="${window.esc(g.ID_GRUPO)}"><i class="fas fa-pen"></i> Editar</button>
                        <button type="button" class="btn-chip" data-accion="descargar-grupo" data-id-grupo="${window.esc(g.ID_GRUPO)}" title="Descargar este horario (CSV)"><i class="fas fa-download"></i></button>
                        <button type="button" class="btn-chip" data-accion="copiar-grupo" data-id-grupo="${window.esc(g.ID_GRUPO)}" title="Copiar este horario"><i class="fas fa-copy"></i></button>
                        <button type="button" class="btn-chip btn-chip-danger" data-accion="eliminar-grupo" data-id-grupo="${window.esc(g.ID_GRUPO)}" title="Eliminar este horario"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ---- Modo del formulario (título, texto del botón, botón eliminar) ----

    function setModoFormulario(editando) {
        const titulo = document.getElementById('horarioModalTitulo');
        const btnTexto = document.getElementById('horarioBtnGuardarTexto');
        const btnEliminar = document.getElementById('horarioBtnEliminar');
        if (titulo) titulo.textContent = editando ? 'Editar Horario' : 'Registrar Horario';
        if (btnTexto) btnTexto.textContent = editando ? 'Actualizar Horario' : 'Guardar Horario';
        if (btnEliminar) btnEliminar.style.display = editando ? 'inline-flex' : 'none';
    }

    function limpiarFormulario() {
        document.getElementById('horarioFechaInicio').value = '';
        document.getElementById('horarioFechaFin').value = '';
        const msg = document.getElementById('horarioMsgValidacion');
        if (msg) msg.textContent = '';

        document.querySelectorAll('#horarioSemanalBody tr').forEach(row => {
            row.querySelector('[data-field="activo"]').checked = false;
            ['ingreso', 'inicioRef', 'finRef', 'salida', 'obs'].forEach(f => {
                row.querySelector(`[data-field="${f}"]`).value = '';
            });
            actualizarEstadoFila(row);
        });

        actualizarResumen();
    }

    function mostrarError(texto) {
        const msg = document.getElementById('horarioMsgValidacion');
        if (msg) msg.textContent = texto;
    }

    // ---- Acciones rápidas (botones de la cabecera de la tabla) ----

    // Marca o desmarca el checkbox "Activo" de las 7 filas a la vez.
    window.horarioMarcarTodos = function(activar) {
        document.querySelectorAll('#horarioSemanalBody tr').forEach(row => {
            row.querySelector('[data-field="activo"]').checked = activar;
            actualizarEstadoFila(row);
        });
        actualizarResumen();
    };

    // Toma el horario de la primera fila con ingreso+salida y lo
    // copia a TODOS los días, activándolos.
    window.horarioCopiarATodos = function() {
        const filas = Array.from(document.querySelectorAll('#horarioSemanalBody tr'));
        const origen = filas.find(row =>
            row.querySelector('[data-field="ingreso"]').value && row.querySelector('[data-field="salida"]').value
        );

        if (!origen) {
            window.toast('⚠️ Completa al menos un día con ingreso y salida antes de copiar', 'warning');
            return;
        }

        const valores = {
            ingreso: origen.querySelector('[data-field="ingreso"]').value,
            inicioRef: origen.querySelector('[data-field="inicioRef"]').value,
            finRef: origen.querySelector('[data-field="finRef"]').value,
            salida: origen.querySelector('[data-field="salida"]').value
        };

        filas.forEach(row => {
            row.querySelector('[data-field="activo"]').checked = true;
            actualizarEstadoFila(row);
            row.querySelector('[data-field="ingreso"]').value = valores.ingreso;
            row.querySelector('[data-field="inicioRef"]').value = valores.inicioRef;
            row.querySelector('[data-field="finRef"]').value = valores.finRef;
            row.querySelector('[data-field="salida"]').value = valores.salida;
        });

        actualizarResumen();
        window.toast('📋 Horario copiado a todos los días', 'success');
    };

    // Activa Lunes-Viernes con el horario estándar y desactiva Sáb/Dom.
    window.horarioAplicarEstandar = function() {
        document.querySelectorAll('#horarioSemanalBody tr').forEach(row => {
            const esLaborable = M.DIAS_LABORABLES.includes(row.dataset.dia);
            row.querySelector('[data-field="activo"]').checked = esLaborable;
            actualizarEstadoFila(row);
            if (esLaborable) {
                row.querySelector('[data-field="ingreso"]').value = M.ESTANDAR.ingreso;
                row.querySelector('[data-field="inicioRef"]').value = M.ESTANDAR.inicioRef;
                row.querySelector('[data-field="finRef"]').value = M.ESTANDAR.finRef;
                row.querySelector('[data-field="salida"]').value = M.ESTANDAR.salida;
            }
        });
        actualizarResumen();
        window.toast('🕐 Horario estándar (L-V) aplicado', 'success');
    };

    return {
        renderTabla, actualizarEstadoFila, leerFilas, actualizarResumen,
        pintarDiasEnTabla, renderGruposExistentes, setModoFormulario,
        limpiarFormulario, mostrarError
    };
})();

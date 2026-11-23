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

        ['ingreso', 'inicioRef', 'finRef', 'salida'].forEach(f => {
            const input = row.querySelector(`[data-field="${f}"]`);
            if (input) input.disabled = !activo;
        });

        if (!activo) {
            ['ingreso', 'inicioRef', 'finRef', 'salida'].forEach(f => {
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
            salida: row.querySelector('[data-field="salida"]').value
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
        actualizarAnticipacion();

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
            }
        });

        actualizarResumen();
    }

    // ---- Observación GENERAL del horario (un solo campo para todo el registro) ----
    function leerObservacion() {
        const el = document.getElementById('horarioObservacion');
        return el ? el.value.trim() : '';
    }
    function escribirObservacion(texto) {
        const el = document.getElementById('horarioObservacion');
        if (el) el.value = texto || '';
    }

    // ---- Solicitud de cambio de horario (procedimiento INS-DRH-P-28) ----
    const $v = id => document.getElementById(id);
    function leerTipo() { return $v('horarioTipo')?.value || ''; }
    function leerSolicitud() {
        const solicitadoPor = $v('horarioSolicitadoPor')?.value || '';
        return {
            tipo: leerTipo(),
            solicitadoPor,
            fechaSolicitud: $v('horarioFechaSolicitud')?.value || '',
            conformidad: !!$v('horarioConformidad')?.checked && solicitadoPor === 'Jefe',
            sustentos: leerSustentos(),
            detalle: leerObservacion()
        };
    }
    // ---- Alternativas de sustento (según quién solicita) ----
    window.__sustentosSel = window.__sustentosSel || new Set();
    function renderSustentos() {
        const cont = $v('horarioSustentoOpciones');
        if (!cont) return;
        const por = $v('horarioSolicitadoPor')?.value || '';
        const lista = (window.HorarioModel.SUSTENTOS[por]) || [];
        if (!lista.length) { cont.innerHTML = '<small style="color:#94A3B8;">Seleccione primero quién solicita el cambio.</small>'; return; }
        cont.innerHTML = lista.map((t, i) => `
            <label style="display:flex;align-items:flex-start;gap:6px;font-weight:400;">
                <input type="checkbox" data-sustento="${i}" ${window.__sustentosSel.has(t) ? 'checked' : ''}> <span>${window.esc(t)}</span>
            </label>`).join('');
        cont.querySelectorAll('[data-sustento]').forEach(cb => cb.addEventListener('change', () => {
            const t = lista[Number(cb.dataset.sustento)];
            if (cb.checked) window.__sustentosSel.add(t); else window.__sustentosSel.delete(t);
        }));
    }
    function leerSustentos() {
        const lista = window.HorarioModel.SUSTENTOS[$v('horarioSolicitadoPor')?.value || ''] || [];
        return lista.filter(t => window.__sustentosSel.has(t));
    }
    // En un temporal solo se pueden marcar los días de la semana que ocurren dentro del rango de fechas.
    function aplicarRestriccionDias() {
        const permitidos = leerTipo() === 'Temporal'
            ? window.HorarioModel.diasEnRango($v('horarioFechaInicio')?.value, $v('horarioFechaFin')?.value) : null;
        document.querySelectorAll('#horarioSemanalBody tr').forEach(row => {
            const cb = row.querySelector('[data-field="activo"]');
            const bloquear = !!permitidos && !permitidos.has(row.dataset.dia);
            if (bloquear && cb.checked) { cb.checked = false; actualizarEstadoFila(row); }
            cb.disabled = bloquear;
            row.style.opacity = bloquear ? '0.45' : '';
        });
    }
    // Motivo (6.1/8): lo fija quién solicita. Trabajador → SOCIAL (PERSONAL); Jefe → TÉCNICO (OPERATIVO).
    function leerMotivos() {
        const por = $v('horarioSolicitadoPor')?.value;
        return por === 'Trabajador' ? ['PERSONAL'] : por === 'Jefe' ? ['OPERATIVO'] : [];
    }
    function escribirSolicitud(g) {
        g = g || {};
        if ($v('horarioTipo')) $v('horarioTipo').value = g.TIPO_HORARIO === 'Temporal' ? 'Temporal' : (g.TIPO_HORARIO ? 'Permanente' : tabActual);
        if ($v('horarioSolicitadoPor')) $v('horarioSolicitadoPor').value = g.SOLICITADO_POR || '';
        if ($v('horarioFechaSolicitud')) $v('horarioFechaSolicitud').value = String(g.FECHA_SOLICITUD || '').slice(0, 10);
        if ($v('horarioConformidad')) $v('horarioConformidad').checked = g.CONFORMIDAD_TRABAJADOR === 'SI';
        window.__sustentosSel = new Set(String(g.SUSTENTOS || '').split('|').map(x => x.trim()).filter(Boolean));
        alCambiarTipo();
    }
    // Aplica las reglas del procedimiento al formulario (qué se bloquea, qué se exige y con cuánta anticipación).
    function alCambiarTipo() {
        const tipo = leerTipo();
        const selPor = $v('horarioSolicitadoPor');
        // Rotativo: solo lo llena el jefe de la dependencia (alcance / actividad 3).
        if (tipo === 'Rotativo' && selPor) { selPor.value = 'Jefe'; }
        if (selPor) selPor.disabled = (tipo === 'Rotativo');
        const por = selPor?.value || '';
        const motivos = leerMotivos();
        if ($v('horarioMotivoPersonal')) $v('horarioMotivoPersonal').checked = motivos.includes('PERSONAL');
        if ($v('horarioMotivoOperativo')) $v('horarioMotivoOperativo').checked = motivos.includes('OPERATIVO');
        const wrap = $v('horarioConformidadWrap');
        if (wrap) wrap.style.display = (por === 'Jefe' && tipo !== 'Rotativo') ? 'block' : 'none';
        if (por !== 'Jefe' && $v('horarioConformidad')) $v('horarioConformidad').checked = false;
        renderSustentos();
        aplicarRestriccionDias();

        // Fecha de fin: temporal = obligatoria; permanente = se cierra sola al registrar el siguiente.
        const fin = $v('horarioFechaFin'), ayuda = $v('horarioFechaFinAyuda');
        const wrapFin = $v('horarioFechaFinWrap'), lblFin = $v('horarioFechaFinLabel');
        if (fin) {
            fin.disabled = (tipo === 'Permanente');
            // Temporal: máximo 6 días corridos desde el inicio (inicio y fin incluidos).
            const ini = $v('horarioFechaInicio')?.value || '';
            if (tipo === 'Temporal' && ini) {
                fin.min = ini;
                fin.max = M.diaSiguienteISO ? sumarDias(ini, M.REGLAS.MAX_DIAS_TEMPORAL - 1) : '';
            } else { fin.removeAttribute('min'); fin.removeAttribute('max'); }
        }
        // Permanente nuevo: sin fecha de fin (la cierra el siguiente). Si ya viene cerrada (edición), se muestra solo lectura.
        if (wrapFin) wrapFin.style.display = (tipo === 'Permanente' && !(fin && fin.value)) ? 'none' : '';
        if (lblFin) lblFin.innerHTML = tipo === 'Temporal' ? 'Fecha de fin <span class="required">*</span>' : 'Fecha de fin (la fija el siguiente permanente)';
        if (ayuda) {
            ayuda.textContent = tipo === 'Temporal' ? `Obligatoria. Máximo ${M.REGLAS.MAX_DIAS_TEMPORAL} días corridos; al terminar rige de nuevo el horario permanente`
                : 'Se cierra el día anterior al inicio del siguiente permanente';
        }
        pintarNotaTab();
        actualizarAnticipacion();
    }
    // Texto en vivo: cuántos días de anticipación exige el procedimiento y si se cumplen.
    function actualizarAnticipacion() {
        const box = $v('horarioReglaAnticipacion');
        if (!box) return;
        const M = M_(), sol = leerSolicitud();
        const ini = $v('horarioFechaInicio')?.value || '';
        if (!sol.tipo || !sol.solicitadoPor) { box.textContent = ''; return; }
        const grupos = window.__horarioGrupos || [];
        const vigente = M.seleccionarVigente(grupos, ini, window.__horarioIdEnEdicion || null);
        const cambioMin = (sol.solicitadoPor === 'Jefe' && !sol.conformidad && sol.tipo !== 'Rotativo' && vigente)
            ? M.cambioMaxMinutos(leerFilas().filter(f => f.activo), vigente.DIAS) : null;
        const req = M.anticipacionRequerida(Object.assign({}, sol, { cambioMin }));
        let txt = `📋 ${req.regla}.`;
        const dias = M.diasEntreISO(sol.fechaSolicitud, ini);
        if (dias !== null) txt += dias >= req.dias ? ` ✔ Cumple (${dias} días).` : ` ⚠ No cumple (${Math.max(dias, 0)} de ${req.dias} días).`;
        if (sol.tipo === 'Rotativo') txt += ' Debe adjuntar el cuadro de rotaciones de la unidad.';
        box.textContent = txt;
        box.style.color = (dias !== null && dias < req.dias) ? '#B91C1C' : '#475569';
    }
    const M_ = () => window.HorarioModel;

    function sumarDias(iso, n) {
        const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    }

    // ---- Pestañas Permanente / Temporal (v132) ----
    let tabActual = 'Permanente';
    function tipoDe(g) { return g.TIPO_HORARIO === 'Temporal' ? 'Temporal' : (g.TIPO_HORARIO === 'Rotativo' ? 'Rotativo' : 'Permanente'); }
    function leerTab() { return tabActual; }
    // sinLimpiar = true: solo cambia la pestaña (lo usa abrir el modal y editar, que rellenan el formulario enseguida).
    function setTab(tipo, sinLimpiar) {
        tabActual = tipo === 'Temporal' ? 'Temporal' : 'Permanente';
        document.querySelectorAll('#horarioTabs .horario-tab').forEach(b => b.classList.toggle('active', b.dataset.tipo === tabActual));
        if ($v('horarioTipo')) $v('horarioTipo').value = tabActual;
        const lt = $v('horarioListaTitulo');
        if (lt) lt.textContent = tabActual === 'Temporal' ? 'Horarios temporales de este empleado' : 'Horarios permanentes de este empleado';
        if (!sinLimpiar) limpiarFormulario(false);
        else alCambiarTipo();
    }
    function pintarNotaTab() {
        const el = $v('horarioTabNota');
        if (!el) return;
        const Mo = window.HorarioModel, base = Mo.horarioEfectivoEn(window.__horarioGrupos || [], Mo.hoyISO()).base;
        const ref = base ? `Rige ahora: ${Mo.fechaATextoLegible(base.FECHA_INICIO)} en adelante.` : 'Este empleado aún no tiene horario permanente vigente.';
        el.innerHTML = tabActual === 'Temporal'
            ? `<i class="fas fa-info-circle"></i> Solo cambia los días y fechas indicados (máximo ${Mo.REGLAS.MAX_DIAS_TEMPORAL} días corridos). Al terminar, rige otra vez el último horario permanente. ${ref}`
            : `<i class="fas fa-info-circle"></i> No lleva fecha de fin: el inicio de un nuevo permanente cierra el anterior. ${ref}`;
    }
    // Resumen fijo: total de horarios, permanente vigente y temporal en curso.
    function pintarResumenTipos(grupos) {
        const Mo = window.HorarioModel, hoy = Mo.hoyISO();
        const lista = (grupos || []).filter(g => tipoDe(g) !== 'Rotativo');
        const nP = lista.filter(g => tipoDe(g) === 'Permanente').length, nT = lista.length - nP;
        const eP = $v('horarioTabNPermanente'), eT = $v('horarioTabNTemporal');
        if (eP) eP.textContent = nP;
        if (eT) eT.textContent = nT;
        const ef = Mo.horarioEfectivoEn(lista, hoy);
        const res = $v('horarioResumenTipos');
        if (!res) return;
        const f = Mo.fechaATextoLegible;
        res.innerHTML = `
            <span class="horario-resumen-chip"><b>${lista.length}</b> horarios en total</span>
            <span class="horario-resumen-chip"><i class="fas fa-calendar-check"></i> Permanente vigente: <b>${ef.base ? 'desde ' + f(ef.base.FECHA_INICIO) : '—'}</b></span>
            <span class="horario-resumen-chip"><i class="fas fa-hourglass-half"></i> Temporal en curso: <b>${ef.temporal ? f(ef.temporal.FECHA_INICIO) + ' → ' + f(ef.temporal.FECHA_FIN) : 'ninguno'}</b></span>`;
    }

    // 6.7: aviso cuando un horario temporal vigente está por vencer (hay que solicitar la extensión antes).
    function venceTemporal(g) {
        if (g.TIPO_HORARIO !== 'Temporal' || !g.FECHA_FIN || g.ESTADO === 'Histórico') return '';
        const hoy = window.HorarioModel.hoyISO();
        const d = window.HorarioModel.diasEntreISO(hoy, g.FECHA_FIN);
        if (d === null || d < 0 || d > 7) return '';
        return `<span class="badge-estado estado-historico" title="Si requiere extensión, debe solicitarla de nuevo antes del vencimiento (6.7)"><i class="fas fa-hourglass-end"></i> Vence en ${d} día(s)</span>`;
    }

    // Aclara en la lista cómo se relacionan el temporal/rotativo y el permanente: el periodo en curso,
    // o el ya concluido (rige otra vez el último permanente, sin hacer nada).
    function notaTemporal(g, grupos) {
        const Mo = window.HorarioModel, hoy = Mo.hoyISO();
        if (Mo.esSuperpuesto(g)) {
            return g.ESTADO === 'Histórico'
                ? '<span class="badge-estado estado-historico" title="El periodo ya pasó: rige de nuevo el último horario permanente"><i class="fas fa-undo"></i> Concluido · rige el permanente</span>'
                : '';
        }
        if (g.ESTADO !== 'Vigente') return '';
        const t = (grupos || []).find(x => Mo.esSuperpuesto(x) && x.ID_GRUPO !== g.ID_GRUPO && Mo.cubreFecha(x, hoy));
        return t ? `<span class="badge-estado estado-programado" title="Solo cambia los días que trae; los demás días rige este horario"><i class="fas fa-layer-group"></i> ${window.esc(t.TIPO_HORARIO)} en curso${t.FECHA_FIN ? ' hasta ' + Mo.fechaATextoLegible(t.FECHA_FIN) : ''}</span>` : '';
    }

    // ---- Panel "Horarios registrados de este empleado" ----

    function renderGruposExistentes(todos, idGrupoActivo) {
        const wrap = document.getElementById('horarioGruposExistentesWrap');
        const cont = document.getElementById('horarioGruposExistentes');
        if (!wrap || !cont) return;

        pintarResumenTipos(todos);
        pintarNotaTab();
        // Solo se listan los de la pestaña activa (el rotativo no se muestra por ahora).
        const grupos = (todos || []).filter(g => tipoDe(g) === tabActual);

        wrap.style.display = 'block';
        if (grupos.length === 0) {
            cont.innerHTML = `<div class="horario-grupos-vacio">${tabActual === 'Temporal' ? 'Sin horarios temporales registrados.' : 'Sin horarios permanentes registrados.'}</div>`;
            return;
        }
        const etiquetaEstado = e => tabActual === 'Temporal' ? ({ 'Vigente': 'En curso', 'Histórico': 'Terminado' }[e] || e) : e;
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
                        <span class="badge-estado ${info.clase}"><i class="fas ${info.icono}"></i> ${window.esc(etiquetaEstado(g.ESTADO))}</span>
                        <span class="horario-grupo-vigencia">${window.esc(vigencia)}</span>
                        <span class="horario-grupo-horas">${window.esc(M.horasDecimalATexto(g.HORAS_SEMANA))}h/sem</span>
                        ${venceTemporal(g)}
                        ${notaTemporal(g, todos)}
                        <button type="button" class="btn-chip btn-download-uniform" data-solicitud="${window.esc(g.ID_GRUPO)}" title="Descargar la Solicitud para evaluación de cambio de horario (INS-DRH-F-28.01)"><i class="fas fa-file-excel"></i> Solicitud</button>
                    </div>
                    ${window.AccionesRegistro.html(g.ID_GRUPO, { mostrar: window.AccionesRegistro.ORDEN })}
                </div>
            `;
        }).join('');
    }

    // ---- Modo del formulario (título, texto del botón, botón eliminar) ----

    function setModoFormulario(editando) {
        const titulo = document.getElementById('horarioModalTitulo');
        const btnTexto = document.getElementById('horarioBtnGuardarTexto');
        const btnEliminar = document.getElementById('horarioBtnEliminar');
        if (titulo) titulo.textContent = (editando ? 'Editar Horario ' : 'Registrar Horario ') + (tabActual === 'Temporal' ? 'Temporal' : 'Permanente');
        if (btnTexto) btnTexto.textContent = editando ? 'Actualizar Horario' : 'Guardar Horario';
        if (btnEliminar) btnEliminar.style.display = editando ? 'inline-flex' : 'none';
    }

    // conservarHoras = true: limpia todo el formulario (fechas de
    // vigencia, observaciones, mensajes) pero deja intactas las horas
    // de la tabla semanal (días marcados, ingreso, refrigerio y
    // salida). Lo usa el botón "Nuevo".
    function limpiarFormulario(conservarHoras) {
        document.getElementById('horarioFechaInicio').value = '';
        document.getElementById('horarioFechaFin').value = '';
        escribirObservacion('');
        escribirSolicitud({});
        if ($v('horarioFechaSolicitud')) $v('horarioFechaSolicitud').value = new Date().toISOString().slice(0, 10);
        actualizarAnticipacion();
        const msg = document.getElementById('horarioMsgValidacion');
        if (msg) msg.textContent = '';

        document.querySelectorAll('#horarioSemanalBody tr').forEach(row => {
            if (conservarHoras) return;
            row.querySelector('[data-field="activo"]').checked = false;
            ['ingreso', 'inicioRef', 'finRef', 'salida'].forEach(f => {
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
        limpiarFormulario, mostrarError, leerObservacion, escribirObservacion,
        leerTipo, leerTab, setTab, leerMotivos, leerSolicitud, escribirSolicitud, alCambiarTipo, actualizarAnticipacion
    };
})();

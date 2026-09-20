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
            const horasTexto = r.ESTADO === 'Descanso parcial'
                ? `${window.esc(r.TOTAL_HORAS || '0')}h generadas · ${window.esc(r.HORAS_PENDIENTES || '0')}h pendientes`
                : `${window.esc(r.TOTAL_HORAS || '0')}h generadas`;
            return `
                <div class="horario-grupo-item ${activo ? 'activo' : ''}" data-id-solicitud="${window.esc(r.ID_SOLICITUD)}" title="${window.esc(r.ID_SOLICITUD)}">
                    <div class="horario-grupo-info">
                        <span class="horario-grupo-id">${window.esc(r.ID_SOLICITUD)}</span>
                        <span class="badge-estado ${info.clase}"><i class="fas ${info.icono}"></i> ${window.esc(r.ESTADO)}</span>
                        <span class="horario-grupo-vigencia">${window.esc(r.TIPO_TRABAJO)} · ${etiquetaFecha}</span>
                        <span class="horario-grupo-horas">${horasTexto}</span>
                    </div>
                    <div class="horario-grupo-acciones">
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
        }).join('');
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
    }

    function agregarFechaDescansoBanco(datos) {
        const d = datos || {};
        const body=document.getElementById('sobretiempoFechasDescansoBody');
        if(!body) return;
        const div=document.createElement('div');
        div.style.cssText='display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;';
        div.innerHTML=`
            <input type="date" data-banco-fecha-descanso value="${window.esc(d.fecha || '')}" style="max-width:170px;">
            <input type="time" data-banco-fecha-descanso-hora-inicio value="${window.esc(d.horaInicio || '')}" title="Hora de inicio del descanso" style="max-width:120px;">
            <input type="time" data-banco-fecha-descanso-refrigerio-inicio value="${window.esc(d.refrigerioInicio || '')}" title="Refrig. inicio (opcional)" style="max-width:120px;">
            <input type="time" data-banco-fecha-descanso-refrigerio-fin value="${window.esc(d.refrigerioFin || '')}" title="Refrig. fin (opcional)" style="max-width:120px;">
            <input type="time" data-banco-fecha-descanso-hora-fin value="${window.esc(d.horaFin || '')}" title="Hora de fin del descanso" style="max-width:120px;">
            <span data-banco-fecha-descanso-total class="horario-dia-total" style="min-width:70px;">—</span>
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

    function renderBancoHoras(banco, solicitudes, jornadaDiaria) {
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
        </tr>`).join('') : '<tr><td colspan="9" style="text-align:center;color:#64748B;padding:18px;">No hay horas disponibles para utilizar.</td></tr>';
        document.getElementById('sobretiempoBancoJornada').textContent=j.toFixed(2)+' h';
        actualizarBancoTotal();
        const fechas=document.getElementById('sobretiempoFechasDescansoBody');
        if(fechas){fechas.innerHTML='';agregarFechaDescansoBanco();}
        const obs=document.getElementById('sobretiempoBancoObservaciones'); if(obs)obs.value='';
        const dest=document.getElementById('sobretiempoBancoDestinatario'); if(dest)dest.value='';
        const res=document.getElementById('sobretiempoBancoSolicitudes');
        if(res){
            const filasSolicitudes=(solicitudes||[]).slice(0,5).map(x=>{
                const pendiente = x.ESTADO === 'PENDIENTE';
                const btn = pendiente
                    ? `<button type="button" class="btn-chip btn-chip-green" style="padding:2px 10px;font-size:11px;margin-left:8px;" onclick="window.sobretiempoCompletarDescansoBanco('${window.esc(x.ID_SOLICITUD_DESCANSO)}')"><i class="fas fa-check"></i> Marcar completado</button>`
                    : '';
                return `<div style="font-size:12px;color:#64748B;padding:5px 0;border-top:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;">
                    <span><strong>${window.esc(x.ID_SOLICITUD_DESCANSO)}</strong> · ${window.esc(x.TOTAL_HORAS)} h · ${window.esc(x.ESTADO)}</span>
                    ${btn}
                </div>`;
            }).join('');
            res.innerHTML = (solicitudes||[]).length
                ? `<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:2px;">Solicitudes de descanso ya generadas</div>${filasSolicitudes}`
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
        leerFase1, pintarFase1, limpiarFase1, mostrarErrorFase1, setModoFase1,
        mostrarFormFase1, mostrarFormFase2, ocultarFormFase2, leerFase2, actualizarTotalHorasEfectivas, mostrarErrorFase2,
        inicializarBancoHoras, renderBancoHoras, actualizarBancoTotal, leerBancoHoras, agregarFechaDescansoBanco,
        inicializarTipoChips
    };
})();

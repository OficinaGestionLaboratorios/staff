// ============================================================
// CONTRATOS-UI.JS — Historial de contratos y renovaciones
// ============================================================
// Pinta, dentro de un contenedor, el resumen de continuidad y la
// tabla del historial de un trabajador, con los botones para
// registrar una renovación (nuevo registro) o corregir con motivo.
// Usa ContratosAPI (backend) y ContratosCalc (cálculos puros).
// ============================================================
window.ContratosUI = (function () {
    const C = window.ContratosCalc;
    const esc = s => window.esc(s);
    const fmt = iso => iso ? window.formatearFecha(iso) : '';
    const puedeEditar = () => window.AUTH.tienePermiso('personal', 'editar');
    const puedeEliminar = () => window.AUTH.tienePermiso('personal', 'eliminar');

    const BADGE = {
        Vigente: 'background:#E1F4E7;color:#107E3E', Vencido: 'background:#EEF1F4;color:#556B82', Programado: 'background:#E3F0FC;color:#0A6ED1'
    };
    const badge = (txt, st) => `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;${st}">${esc(txt)}</span>`;

    const cache = {}; // CODE -> contratos (por si se necesita al abrir un formulario)
    let contenedores = {}; // id contenedor -> empleado (para re-pintar tras un cambio)

    // ---------------- panel ----------------
    async function render(contenedorId, emp) {
        const box = document.getElementById(contenedorId);
        if (!box || !emp || !emp.CODE) return;
        contenedores[contenedorId] = emp;
        box.innerHTML = `<div class="detail-section-title"><i class="fas fa-file-signature"></i> Historial contractual</div>
            <div style="color:#94A3B8;padding:8px 0">Cargando historial…</div>`;
        let r;
        try { r = await window.ContratosAPI.listar(emp.CODE); } catch (e) { r = { success: false, message: e.message }; }
        if (!document.getElementById(contenedorId)) return;
        if (!r || !r.success) {
            box.innerHTML = `<div class="detail-section-title"><i class="fas fa-file-signature"></i> Historial contractual</div>
                <div style="color:#BB0000;padding:8px 0">No se pudo cargar el historial: ${esc((r && r.message) || 'error')}</div>`;
            return;
        }
        cache[emp.CODE] = r.data || [];
        box.innerHTML = html(emp, cache[emp.CODE]);
    }

    function html(emp, lista) {
        const R = C.resumen(lista);
        const ed = puedeEditar();
        const vinc = emp.FECHA_VINCULACION ? fmt(emp.FECHA_VINCULACION) : '—';
        const chip = (l, v) => `<span class="detail-chip"><span class="chip-label">${l}:</span><span class="chip-value">${v}</span></span>`;

        let situacion;
        if (!R.total) situacion = 'Sin contratos registrados';
        else if (R.vigente) situacion = `Vigente (${fmt(R.vigente.inicioISO)} → ${R.vigente.ceseISO ? fmt(R.vigente.ceseISO) : 'sin cese'})` +
            (R.diasParaVencer !== null && R.diasParaVencer <= 30 ? ` · vence en ${R.diasParaVencer} día(s)` : '');
        else if (R.sinContratoActual) situacion = `Sin contrato vigente desde hace ${R.diasSinContratoActual} día(s)`;
        else situacion = 'Programado';

        const chips = [
            chip('Primera vinculación', esc(vinc)),
            chip('Contratos', R.total),
            chip('Situación actual', esc(situacion)),
            R.racha ? chip('Continuidad actual', `${R.racha.periodos} período(s) seguidos · ${esc(C.durTexto(R.racha.dias))}`) : '',
            chip('Interrupciones', R.interrupciones.length + (R.diasSinContrato ? ` (${R.diasSinContrato} días sin contrato)` : ''))
        ].join('');

        const filas = R.tramos.map(t => {
            const k = t.contrato;
            const interv = t.intervalo === null ? '—'
                : t.continuo ? badge('Continuo', 'background:#E1F4E7;color:#107E3E')
                    : badge(t.intervalo + ' día(s) sin contrato', 'background:#FFF3D6;color:#B25E00');
            const corr = k.CORREGIDO ? ` <i class="fas fa-pen" title="Corregido: ${esc(k.MOTIVO_CORRECCION)}" style="color:#B25E00;font-size:11px"></i>` : '';
            const acc = ed ? `<button class="btn btn-secondary" style="padding:3px 8px;font-size:11px" onclick="window.ContratosUI.corregir('${esc(emp.CODE)}','${esc(k.ID_CONTRATO)}')"><i class="fas fa-pen"></i> Corregir</button>` : '';
            const del = puedeEliminar() ? ` <button class="btn btn-secondary" style="padding:3px 8px;font-size:11px;color:#BB0000;border-color:#F3B8B8" title="Eliminar este contrato" onclick="window.ContratosUI.eliminar('${esc(emp.CODE)}','${esc(k.ID_CONTRATO)}')"><i class="fas fa-trash"></i> Eliminar</button>` : '';
            return `<tr>
                <td>${t.n}</td><td>${esc(k.TIPO_CONTRATO || '')}</td><td>${fmt(t.inicioISO)}</td>
                <td>${t.ceseISO ? fmt(t.ceseISO) : '<em>sin cese</em>'}</td><td>${esc(C.durTexto(t.duracion))}</td>
                <td>${interv}</td><td>${badge(t.estado, BADGE[t.estado])}${corr}</td>
                <td style="max-width:200px">${esc(k.OBSERVACION || '')}</td><td style="white-space:nowrap">${acc}${del}</td></tr>`;
        }).join('');

        const botones = ed ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
            <button class="btn btn-primary" onclick="window.ContratosUI.renovar('${esc(emp.CODE)}')"><i class="fas fa-file-circle-plus"></i> Registrar ${R.total ? 'renovación' : 'primer contrato'}</button>
            <button class="btn btn-secondary" onclick="window.ContratosUI.corregirVinculacion('${esc(emp.CODE)}')"><i class="fas fa-calendar-check"></i> Corregir fecha de vinculación</button></div>` : '';

        const interr = R.interrupciones.length ? `<div style="margin:8px 0;font-size:12px;color:#B25E00">
            ${R.interrupciones.map(i => `⚠ Sin contrato del ${fmt(C.iso(i.desde))} al ${fmt(C.iso(i.hasta))} (${i.dias} día${i.dias === 1 ? '' : 's'})`).join('<br>')}</div>` : '';

        return `<div class="detail-section-title"><i class="fas fa-file-signature"></i> Historial contractual</div>
            <div class="detail-chips">${chips}</div>${interr}${botones}
            ${R.total ? `<div style="overflow-x:auto"><table class="data-table" style="width:100%;font-size:12px">
                <thead><tr><th>N.º</th><th>Tipo</th><th>Inicio</th><th>Cese</th><th>Duración</th><th>Intervalo previo</th><th>Estado</th><th>Observación</th><th></th></tr></thead>
                <tbody>${filas}</tbody></table></div>`
                : '<div style="color:#94A3B8;padding:6px 0">Aún no hay contratos registrados para este trabajador.</div>'}`;
    }

    // ---------------- formulario modal genérico ----------------
    function formulario(cfg) {
        cerrar();
        const ov = document.createElement('div');
        ov.id = 'modalContratos';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
        const campos = cfg.campos.map(c => {
            const base = `id="ct_${c.id}" style="width:100%"${c.required ? ' required' : ''}`;
            let input;
            if (c.type === 'select') input = `<select ${base}>${c.options.map(o => `<option ${o === c.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
            else if (c.type === 'textarea') input = `<textarea ${base} rows="2" placeholder="${esc(c.placeholder || '')}">${esc(c.value || '')}</textarea>`;
            else input = `<input type="${c.type || 'text'}" ${base} value="${esc(c.value || '')}" placeholder="${esc(c.placeholder || '')}">`;
            return `<div class="form-group" style="margin-bottom:10px"><label>${esc(c.label)}${c.required ? ' <span class="required">*</span>' : ''}</label>${input}${c.hint ? `<small style="color:#94A3B8">${esc(c.hint)}</small>` : ''}</div>`;
        }).join('');
        ov.innerHTML = `<div style="background:#fff;border-radius:10px;max-width:480px;width:100%;padding:20px;max-height:90vh;overflow:auto">
            <h3 style="margin:0 0 4px">${esc(cfg.titulo)}</h3>
            ${cfg.subtitulo ? `<p style="margin:0 0 12px;color:#64748B;font-size:13px">${esc(cfg.subtitulo)}</p>` : ''}
            ${campos}<div id="ct_aviso" style="font-size:12px;margin:4px 0 10px;min-height:16px"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button type="button" class="btn btn-secondary" id="ct_cancel">Cancelar</button>
                <button type="button" class="btn btn-primary" id="ct_ok"><i class="fas fa-save"></i> Guardar</button></div></div>`;
        document.body.appendChild(ov);
        const val = id => { const el = document.getElementById('ct_' + id); return el ? el.value.trim() : ''; };
        document.getElementById('ct_cancel').onclick = cerrar;
        ov.addEventListener('mousedown', e => { if (e.target === ov) cerrar(); });
        if (cfg.alIniciar) cfg.alIniciar(val);
        document.getElementById('ct_ok').onclick = async () => {
            const v = {}; cfg.campos.forEach(c => { v[c.id] = val(c.id); });
            const falta = cfg.campos.find(c => c.required && !v[c.id]);
            if (falta) { window.toast('⚠️ Complete: ' + falta.label, 'error'); return; }
            const btn = document.getElementById('ct_ok'); btn.disabled = true;
            try {
                const r = await cfg.guardar(v);
                if (r && r.success) { cerrar(); window.toast('✅ ' + (r.message || 'Guardado'), 'success'); await alCambiar(cfg.code); }
                else window.toast('❌ ' + ((r && r.message) || 'Error'), 'error');
            } catch (e) { window.toast('❌ ' + e.message, 'error'); }
            finally { btn.disabled = false; }
        };
    }
    function cerrar() { const m = document.getElementById('modalContratos'); if (m) m.remove(); }

    // Tras guardar: refresca la lista de personal (la ficha refleja el contrato más
    // reciente) y vuelve a pintar el panel y el detalle si están abiertos.
    async function alCambiar(code) {
        try { await window.API.list(true); } catch (e) { /* se muestra lo que haya */ }
        // Si el listado está visible detrás, se repinta con los datos nuevos.
        try {
            if (window.Router && window.Router.getVistaActual() === 'listado') {
                window.renderTabla(window.API.getDatos());
                window.actualizarContadoresGenerales && window.actualizarContadoresGenerales();
            }
        } catch (e) { /* no crítico */ }
        const emp = (window.API.getDatos() || []).find(p => String(p.CODE) === String(code));
        if (window.InformesDatos) window.InformesDatos.invalidar();
        if (!emp) return;
        const det = document.getElementById('modalDetalle');
        if (det && det.classList.contains('active') && window.currentDetail && String(window.currentDetail.CODE) === String(code)) window.verDetalle(emp);
        Object.keys(contenedores).forEach(id => { if (String(contenedores[id].CODE) === String(code)) render(id, emp); });
    }

    const empDe = code => (window.API.getDatos() || []).find(p => String(p.CODE) === String(code)) || {};

    // ---------------- acciones ----------------
    function renovar(code) {
        const emp = empDe(code), lista = cache[code] || [], R = C.resumen(lista);
        const ult = R.ultimo;
        const sugerido = ult && ult.ceseISO ? C.iso(ult.cese + 1) : (!ult && emp.FECHA_VINCULACION ? String(emp.FECHA_VINCULACION).slice(0, 10) : '');
        formulario({
            code, titulo: R.total ? 'Registrar renovación' : 'Registrar primer contrato',
            subtitulo: 'Se crea un contrato nuevo; los anteriores no se modifican.',
            campos: [
                { id: 'ini', label: 'Inicio del contrato', type: 'date', required: true, value: sugerido },
                { id: 'cese', label: 'Cese / vencimiento', type: 'date', value: sugerido ? C.ceseTrimestral(sugerido) : '', hint: 'Sugerido a 3 meses; vacío = sin fecha de término.' },
                { id: 'tipo', label: 'Tipo de contrato', type: 'select', options: ['Temporal', 'Permanente'], value: emp.TIPO_CONTRATO || 'Temporal' },
                { id: 'obs', label: 'Observación', type: 'textarea' }
            ],
            alIniciar: val => {
                let tocado = false;
                const ini = document.getElementById('ct_ini'), cese = document.getElementById('ct_cese'), av = document.getElementById('ct_aviso');
                cese.addEventListener('input', () => { tocado = true; });
                const aviso = () => {
                    const i = C.num(ini.value);
                    if (i === null || !ult || ult.cese === null) { av.textContent = ''; return; }
                    const g = i - ult.cese - 1;
                    av.style.color = g === 0 ? '#107E3E' : '#B25E00';
                    av.textContent = g === 0 ? '✔ Continúa sin interrupción respecto al contrato anterior.'
                        : g > 0 ? `⚠ Quedan ${g} día(s) sin contrato entre el anterior y este.` : '❌ Se solapa con el contrato anterior.';
                };
                ini.addEventListener('input', () => { if (!tocado) cese.value = C.ceseTrimestral(ini.value); aviso(); });
                aviso();
            },
            guardar: v => window.ContratosAPI.crear({ CODE: code, INICIO_PERIODO: v.ini, CESE_PERIODO: v.cese, TIPO_CONTRATO: v.tipo, OBSERVACION: v.obs })
        });
    }

    function corregir(code, idContrato) {
        const k = (cache[code] || []).find(c => c.ID_CONTRATO === idContrato);
        if (!k) return;
        formulario({
            code, titulo: `Corregir contrato N.º ${k.NUMERO}`,
            subtitulo: 'Solo para corregir errores de registro. Para una renovación use «Registrar renovación». El cambio queda auditado.',
            campos: [
                { id: 'ini', label: 'Inicio del contrato', type: 'date', required: true, value: k.INICIO_PERIODO },
                { id: 'cese', label: 'Cese / vencimiento', type: 'date', value: k.CESE_PERIODO },
                { id: 'tipo', label: 'Tipo de contrato', type: 'select', options: ['Temporal', 'Permanente'], value: k.TIPO_CONTRATO || 'Temporal' },
                { id: 'obs', label: 'Observación', type: 'textarea', value: k.OBSERVACION },
                { id: 'motivo', label: 'Motivo de la corrección', type: 'textarea', required: true, placeholder: 'Ej.: error de digitación en la fecha de cese' }
            ],
            guardar: v => window.ContratosAPI.corregir({ ID_CONTRATO: idContrato, INICIO_PERIODO: v.ini, CESE_PERIODO: v.cese || ' ', /* ' ' = vaciar el cese (la API descarta valores vacíos) */ TIPO_CONTRATO: v.tipo, OBSERVACION: v.obs, MOTIVO_CORRECCION: v.motivo })
        });
    }

    function eliminar(code, idContrato) {
        const k = (cache[code] || []).find(c => c.ID_CONTRATO === idContrato);
        if (!k) return;
        formulario({
            code, titulo: `Eliminar contrato N.º ${k.NUMERO}`,
            subtitulo: `${fmt(k.INICIO_PERIODO)} → ${k.CESE_PERIODO ? fmt(k.CESE_PERIODO) : 'sin cese'}. Se borra del historial y el resto se renumera. Queda constancia en la auditoría.`,
            campos: [{ id: 'motivo', label: 'Motivo de la eliminación', type: 'textarea', required: true, placeholder: 'Ej.: contrato registrado por error' }],
            guardar: v => window.ContratosAPI.eliminar({ ID_CONTRATO: idContrato, MOTIVO_CORRECCION: v.motivo })
        });
    }

    function corregirVinculacion(code) {
        const emp = empDe(code);
        formulario({
            code, titulo: 'Corregir fecha de primera vinculación',
            subtitulo: 'Esta fecha es fija durante toda la trayectoria; solo se modifica para corregir un error y queda auditado.',
            campos: [
                { id: 'fecha', label: 'Fecha de vinculación', type: 'date', required: true, value: emp.FECHA_VINCULACION ? String(emp.FECHA_VINCULACION).slice(0, 10) : '' },
                { id: 'motivo', label: 'Motivo de la corrección', type: 'textarea', required: true }
            ],
            guardar: v => window.ContratosAPI.corregirVinculacion({ CODE: code, FECHA_VINCULACION: v.fecha, MOTIVO_CORRECCION: v.motivo })
        });
    }

    return { render, renovar, corregir, eliminar, corregirVinculacion, cerrar };
})();

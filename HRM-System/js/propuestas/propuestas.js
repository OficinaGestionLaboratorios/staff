// ============================================================
// PROPUESTAS.JS — Módulo ADMIN: evaluar las propuestas que el
// personal envía desde el portal (horario, permiso, vacaciones,
// licencia). Lo propuesto vive aparte (BD_PROPUESTAS); al APROBAR se
// registra en el módulo oficial correspondiente (ver
// Codigo_Propuestas.gs). Solo visible/usable para rol "admin".
// ============================================================
(function () {
    const TIPOS = {
        HORARIO:  { nombre: 'Horario',   icono: 'fa-clock' },
        PERMISO:  { nombre: 'Permiso',   icono: 'fa-door-open' },
        VACACION: { nombre: 'Vacaciones', icono: 'fa-umbrella-beach' },
        LICENCIA: { nombre: 'Licencia',  icono: 'fa-file-medical-alt' }
    };
    const FUNCIONARIOS = { 'Wilfredo G. Leon Gonzales': 'Supervisor', 'Jose Luis Plasencia Carranza': 'Jefe de Oficina OGL' };
    const ESC = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = id => document.getElementById(id);
    const v = id => ($(id) ? $(id).value.trim() : '');
    const fTxt = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
    const toMin = h => { const m = /^(\d{2}):(\d{2})$/.exec(h || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
    const diasEntre = (a, b) => { if (!a || !b) return 0; const d = Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000) + 1; return d > 0 ? d : 0; };
    function minDia(i, a, b, s) {
        const x = toMin(i), y = toMin(s); if (x == null || y == null || y <= x) return 0;
        let m = y - x; const r1 = toMin(a), r2 = toMin(b); if (r1 != null && r2 != null && r2 > r1) m -= (r2 - r1); return Math.max(m, 0);
    }

    let lista = [];
    let actual = null;

    function api(accion, params = {}) {
        let url = window.API_URL + '?action=' + accion;
        Object.entries(params).forEach(([k, val]) => { if (val !== '' && val != null) url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(val); });
        return window.AUTH.request(url);
    }

    function mostrar(vista) {
        $('propVistaLista').style.display = vista === 'lista' ? '' : 'none';
        $('propVistaDetalle').style.display = vista === 'detalle' ? '' : 'none';
    }

    window.abrirModalPropuestas = async function () {
        if (window.AUTH.getRol() !== 'admin') { window.toast?.('Solo un administrador puede evaluar propuestas', 'warning'); return; }
        const m = $('modalPropuestas');
        m.style.display = 'flex'; m.classList.add('active'); document.body.style.overflow = 'hidden';
        mostrar('lista');
        await window.propuestasCargar();
    };
    window.cerrarModalPropuestas = function () {
        const m = $('modalPropuestas');
        m.classList.remove('active'); m.style.display = 'none'; document.body.style.overflow = '';
        window.propuestasActualizarContador?.();
    };

    window.propuestasCargar = async function () {
        const tb = $('propTbody');
        tb.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;"><i class="fas fa-spinner fa-spin"></i> Cargando propuestas...</td></tr>';
        const r = await api('listPropuestas', { estado: v('propFiltroEstado'), tipo: v('propFiltroTipo') });
        if (!r.success) { tb.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">❌ ${ESC(r.message)}</td></tr>`; return; }
        lista = r.data || [];
        if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">No hay propuestas con ese filtro.</td></tr>'; return; }
        tb.innerHTML = lista.map(p => `
            <tr>
                <td>${fTxt(p.FECHA_REGISTRO)}</td>
                <td>${ESC(p.EMPLEADO)}<br><small class="text-muted">${ESC(p.ID_PERSONAL)}</small></td>
                <td><span class="prop-tipo"><i class="fas ${(TIPOS[p.TIPO] || {}).icono || 'fa-file'}"></i> ${(TIPOS[p.TIPO] || {}).nombre || ESC(p.TIPO)}</span></td>
                <td>${ESC(p.RESUMEN)}</td>
                <td><span class="prop-badge ${p.ESTADO}">${p.ESTADO}</span></td>
                <td style="text-align:right;"><button type="button" class="btn btn-primary" style="padding:6px 14px;" onclick="window.propuestaAbrir('${ESC(p.ID_PROPUESTA)}')">${p.ESTADO === 'PENDIENTE' ? 'Evaluar' : 'Ver'}</button></td>
            </tr>`).join('');
    };

    // Insignia con el número de propuestas pendientes en el sidebar.
    window.propuestasActualizarContador = async function () {
        if (!window.AUTH || window.AUTH.getRol() !== 'admin') return;
        const r = await api('listPropuestas', { estado: 'PENDIENTE' });
        const b = $('propContadorMenu');
        if (!b) return;
        const n = r.success ? (r.data || []).length : 0;
        b.textContent = n; b.style.display = n ? '' : 'none';
    };

    // ---------- Detalle / evaluación ----------
    window.propuestaAbrir = function (id) {
        actual = lista.find(p => p.ID_PROPUESTA === id);
        if (!actual) return;
        const d = actual.DATOS || {}, pend = actual.ESTADO === 'PENDIENTE', ro = pend ? '' : 'readonly disabled';
        $('propDetTitulo').textContent = `${(TIPOS[actual.TIPO] || {}).nombre || actual.TIPO} — ${actual.EMPLEADO}`;
        $('propDetSub').innerHTML = `${ESC(actual.ID_PROPUESTA)} · enviada el ${fTxt(actual.FECHA_REGISTRO)} · <span class="prop-badge ${actual.ESTADO}">${actual.ESTADO}</span>`;
        $('propDetForm').innerHTML = (pend
            ? '<div class="prop-aviso"><i class="fas fa-circle-info"></i> Lo que ves es lo que propuso el trabajador. Puedes ajustarlo antes de aprobar; al aprobar se registra en el módulo oficial.</div>'
            : '') + ({ HORARIO: hHorario, PERMISO: hPermiso, VACACION: hVacacion, LICENCIA: hLicencia })[actual.TIPO](d, ro);
        enlazar(actual.TIPO);
        $('propDetMsg').textContent = '';
        $('propComentario').value = actual.COMENTARIO_ADMIN || '';
        $('propComentario').readOnly = !pend;
        $('propAccionesPend').style.display = pend ? '' : 'none';
        $('propResuelta').innerHTML = pend ? '' :
            `<div class="prop-aviso">Resuelta el ${fTxt(actual.FECHA_RESOLUCION)} por ${ESC(actual.RESUELTO_POR)}${actual.ID_REGISTRO_OFICIAL ? ` — registro oficial <b>${ESC(actual.ID_REGISTRO_OFICIAL)}</b>` : ''}.</div>`;
        mostrar('detalle');
    };

    function hHorario(d, ro) {
        const mapa = {}; (d.DIAS || []).forEach(x => { mapa[x.dia] = x; });
        const filas = (d.DIAS || []).map(x => `
            <tr data-dia="${ESC(x.dia)}"><td><b>${ESC(x.dia)}</b></td>
              <td><input type="time" class="ing" value="${ESC(x.ingreso)}" ${ro}></td>
              <td><input type="time" class="ini" value="${ESC(x.inicioRef)}" ${ro}></td>
              <td><input type="time" class="fin" value="${ESC(x.finRef)}" ${ro}></td>
              <td><input type="time" class="sal" value="${ESC(x.salida)}" ${ro}></td></tr>`).join('');
        return `<div class="prop-grid">
              <div class="prop-f"><label>Rige desde</label><input type="date" id="pdIni" value="${ESC(d.FECHA_INICIO)}" ${ro}></div>
              <div class="prop-f"><label>Hasta</label><input type="date" id="pdFin" value="${ESC(d.FECHA_FIN)}" ${ro}></div></div>
            <table class="prop-dias"><thead><tr><th>Día</th><th>Ingreso</th><th>Inicio refrigerio</th><th>Fin refrigerio</th><th>Salida</th></tr></thead><tbody>${filas}</tbody></table>
            ${d.OBSERVACION ? `<div class="prop-f"><label>Observación del trabajador</label><textarea rows="2" readonly>${ESC(d.OBSERVACION)}</textarea></div>` : ''}`;
    }
    function hPermiso(d, ro) {
        const fun = d.FUNCIONARIO_EXPIDE || '';
        const opts = Object.keys(FUNCIONARIOS).map(n => `<option value="${ESC(n)}" ${fun === n ? 'selected' : ''}>${ESC(n)}</option>`).join('');
        const clases = ['Personal', 'Comisión de Servicio', 'Capacitación', 'Enfermedad', 'Lactancia', 'Otra'].map(c => `<option ${d.CLASE_PERMISO === c ? 'selected' : ''}>${c}</option>`).join('');
        return `<div class="prop-grid">
              <div class="prop-f"><label>Fecha</label><input type="date" id="pdFecha" value="${ESC(d.FECHA_PERMISO)}" ${ro}></div>
              <div class="prop-f"><label>Hora de salida</label><input type="time" id="pdSal" value="${ESC(d.HORA_SALIDA)}" ${ro}></div>
              <div class="prop-f"><label>Hora de retorno</label><input type="time" id="pdRet" value="${ESC(d.HORA_RETORNO)}" ${ro}></div>
              <div class="prop-f"><label>Clase</label><select id="pdClase" ${ro}>${clases}</select></div></div>
            <div class="prop-grid">
              <div class="prop-f"><label>Especificar (si “Otra”)</label><input type="text" id="pdOtra" value="${ESC(d.OTRA_ESPECIFICAR)}" ${ro}></div>
              <div class="prop-f"><label>Lugar de destino</label><input type="text" id="pdDest" value="${ESC(d.LUGAR_DESTINO)}" ${ro}></div>
              <div class="prop-f"><label>Detalle capacitación</label><input type="text" id="pdCap" value="${ESC(d.DETALLE_CAPACITACION)}" ${ro}></div></div>
            <div class="prop-f"><label>Motivo de la salida</label><textarea id="pdMotivo" rows="2" ${ro}>${ESC(d.MOTIVO_SALIDA)}</textarea></div>
            <div class="prop-grid" style="margin-top:12px;">
              <div class="prop-f"><label>Funcionario que expide la boleta *</label>
                <select id="pdFun" ${ro}><option value="">Selecciona...</option>${opts}</select></div>
              <div class="prop-f"><label>Cargo</label><input type="text" id="pdCargoFun" value="${ESC(d.CARGO_FUNCIONARIO || FUNCIONARIOS[fun] || '')}" readonly></div></div>`;
    }
    function hVacacion(d, ro) {
        return `<div class="prop-grid">
              <div class="prop-f"><label>Período vacacional</label><input type="text" id="pdPer" value="${ESC(d.PERIODO_VACACIONAL)}" ${ro}></div>
              <div class="prop-f"><label>Desde</label><input type="date" id="pdIni" value="${ESC(d.FECHA_INICIO)}" ${ro}></div>
              <div class="prop-f"><label>Hasta</label><input type="date" id="pdFin" value="${ESC(d.FECHA_FIN)}" ${ro}></div>
              <div class="prop-f"><label>Días</label><input type="text" id="pdDias" value="${diasEntre(d.FECHA_INICIO, d.FECHA_FIN)}" readonly></div></div>
            <div class="prop-grid">
              <div class="prop-f"><label>Fecha límite de goce (solo si el período aún no existe)</label><input type="date" id="pdLim" value="${ESC(d.FECHA_LIMITE)}" ${ro}></div>
              <div class="prop-f"><label>Días asignados (si se crea el período)</label><input type="number" id="pdAsig" min="1" max="30" value="${ESC(d.DIAS_ASIGNADOS || 30)}" ${ro}></div></div>
            <div class="prop-f"><label>Observación</label><textarea id="pdObs" rows="2" ${ro}>${ESC(d.OBSERVACION)}</textarea></div>`;
    }
    function hLicencia(d, ro) {
        return `<div class="prop-grid">
              <div class="prop-f"><label>Tipo</label><input type="text" id="pdTipo" value="${ESC(d.TIPO_LICENCIA)}" readonly></div>
              <div class="prop-f"><label>Desde</label><input type="date" id="pdIni" value="${ESC(d.FECHA_INICIO)}" ${ro}></div>
              <div class="prop-f"><label>Hasta</label><input type="date" id="pdFin" value="${ESC(d.FECHA_FIN)}" ${ro}></div>
              <div class="prop-f"><label>Días</label><input type="text" id="pdDias" value="${diasEntre(d.FECHA_INICIO, d.FECHA_FIN)}" readonly></div></div>
            <div class="prop-f"><label>Motivo</label><textarea id="pdMotivo" rows="3" ${ro}>${ESC(d.MOTIVO)}</textarea></div>
            <div class="prop-f" style="margin-top:12px;"><label>Anexos</label><input type="text" id="pdAnexos" value="${ESC(d.ANEXOS)}" ${ro}></div>`;
    }

    function enlazar(tipo) {
        if (tipo === 'PERMISO' && $('pdFun')) $('pdFun').addEventListener('change', () => { $('pdCargoFun').value = FUNCIONARIOS[v('pdFun')] || ''; });
        if ((tipo === 'VACACION' || tipo === 'LICENCIA') && $('pdIni')) {
            const f = () => { $('pdDias').value = diasEntre(v('pdIni'), v('pdFin')); };
            $('pdIni').addEventListener('input', f); $('pdFin').addEventListener('input', f);
        }
    }

    function recolectar() {
        const base = Object.assign({}, actual.DATOS), t = actual.TIPO;
        if (t === 'HORARIO') {
            const dias = []; let tot = 0;
            document.querySelectorAll('.prop-dias tbody tr').forEach(tr => {
                const g = c => tr.querySelector('.' + c).value;
                const m = minDia(g('ing'), g('ini'), g('fin'), g('sal')); tot += m;
                dias.push({ dia: tr.dataset.dia, ingreso: g('ing'), inicioRef: g('ini'), finRef: g('fin'), salida: g('sal'), horas: (m / 60).toFixed(2) });
            });
            return Object.assign(base, { FECHA_INICIO: v('pdIni'), FECHA_FIN: v('pdFin'), DIAS: dias, HORAS_SEMANA: (tot / 60).toFixed(2) });
        }
        if (t === 'PERMISO') {
            const a = toMin(v('pdSal')), b = toMin(v('pdRet'));
            return Object.assign(base, { FECHA_PERMISO: v('pdFecha'), HORA_SALIDA: v('pdSal'), HORA_RETORNO: v('pdRet'),
                DURACION_TOTAL: (a != null && b != null && b > a) ? `${Math.floor((b - a) / 60)}:${String((b - a) % 60).padStart(2, '0')}` : '',
                CLASE_PERMISO: v('pdClase'), OTRA_ESPECIFICAR: v('pdOtra'), LUGAR_DESTINO: v('pdDest'), DETALLE_CAPACITACION: v('pdCap'),
                MOTIVO_SALIDA: v('pdMotivo'), FUNCIONARIO_EXPIDE: v('pdFun'), CARGO_FUNCIONARIO: FUNCIONARIOS[v('pdFun')] || '' });
        }
        if (t === 'VACACION') {
            return Object.assign(base, { PERIODO_VACACIONAL: v('pdPer'), FECHA_INICIO: v('pdIni'), FECHA_FIN: v('pdFin'),
                DIAS_TOMADOS: diasEntre(v('pdIni'), v('pdFin')), FECHA_LIMITE: v('pdLim'), DIAS_ASIGNADOS: v('pdAsig'), OBSERVACION: v('pdObs') });
        }
        return Object.assign(base, { FECHA_INICIO: v('pdIni'), FECHA_FIN: v('pdFin'), MOTIVO: v('pdMotivo'), ANEXOS: v('pdAnexos') });
    }

    async function resolver(accion) {
        if (!actual) return;
        const msg = $('propDetMsg'); msg.textContent = '';
        const comentario = v('propComentario');
        if (accion === 'RECHAZAR' && !comentario) { msg.textContent = 'Escribe en el comentario el motivo del rechazo.'; return; }
        if (!confirm(accion === 'APROBAR' ? '¿Aprobar y registrar esta propuesta en el módulo oficial?' : '¿Rechazar esta propuesta?')) return;

        const btns = document.querySelectorAll('#propAccionesPend button'); btns.forEach(b => { b.disabled = true; });
        const params = { id: actual.ID_PROPUESTA, accion, comentario, key: window.API_KEY };
        if (accion === 'APROBAR') params.datos = JSON.stringify(recolectar());
        const r = await api('resolverPropuesta', params);
        btns.forEach(b => { b.disabled = false; });

        if (!r.success) { msg.textContent = r.message || 'No se pudo resolver la propuesta.'; return; }
        window.toast?.('✅ ' + r.message, 'success');
        mostrar('lista');
        await window.propuestasCargar();
    }
    window.propuestaAprobar = () => resolver('APROBAR');
    window.propuestaRechazar = () => resolver('RECHAZAR');
    window.propuestaVolverLista = () => mostrar('lista');
})();

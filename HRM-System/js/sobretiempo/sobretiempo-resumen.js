// ============================================================
// SOBRETIEMPO-RESUMEN.JS — Resumen «HORAS SOBRETIEMPO» / «DESCANSO
// COMPENSATORIO» (tablas lado a lado: DIA · INICIO · FIN · TOTAL).
// ============================================================
//  - Descarga en Excel (xlsx-js-style) de UNA solicitud (icono verde de
//    cada fila) con los descansos ligados a ella.
// ============================================================
window.SobretiempoResumen = (function () {
    const M = () => window.SobretiempoModel;
    const num = v => parseFloat(v) || 0;
    const AZUL_TOTAL = 'BDE3F5';

    const cmpFecha = (a, b) => String(a.fecha).localeCompare(String(b.fecha));

    // registros: solicitudes de sobretiempo; banco: solicitudes de descanso del banco de horas.
    // opciones.idSolicitud → solo esa solicitud y los descansos que consumen sus horas.
    function armar(registros, banco, opciones) {
        const id = opciones && opciones.idSolicitud;
        const regs = (registros || []).filter(r => id
            ? r.ID_SOLICITUD === id
            : (r.ESTADO_AUTORIZACION || 'Aprobado') === 'Aprobado');
        const st = [], dc = [];
        regs.forEach(r => {
            (r.FECHAS || []).forEach(f => st.push({ fecha: f.fecha, ini: f.horaInicio, fin: f.horaFin, horas: num(f.horas) }));
            (r.DESCANSOS || []).forEach(d => dc.push({ fecha: d.fecha, ini: d.horaInicio, fin: d.horaFin, horas: num(d.horas) }));
        });
        (banco || []).forEach(x => {
            if (id && !(x.SELECCIONES || []).some(s => String(s.ID_SOLICITUD_ORIGEN) === String(id))) return;
            (x.FECHAS_DESCANSO || []).forEach(f => dc.push({ fecha: f.fecha, ini: f.horaInicio, fin: f.horaFin, horas: num(f.horas) }));
        });
        st.sort(cmpFecha); dc.sort(cmpFecha);
        const sum = l => l.reduce((a, x) => a + x.horas, 0);
        return { st, dc, totalSt: sum(st), totalDc: sum(dc) };
    }

    const hm = h => M().horasDecimalATextoHM(h);
    const dia = f => M().diaSemanaYFechaTexto(f);

    // ---------- Pantalla: modal flotante abierto con el botón «Ver detalle» (ojo) ----------
    function tablaHTML(titulo, filas, total, minFilas) {
        const esc = window.esc;
        let body = filas.length
            ? filas.map(x => `<tr><td style="text-align:left;">${esc(dia(x.fecha))}</td><td>${esc(x.ini || '')}</td><td>${esc(x.fin || '')}</td><td>${hm(x.horas)}</td></tr>`).join('')
            : `<tr><td colspan="4" style="text-align:center;color:#6A6D70;">Sin registros</td></tr>`;
        // Rellena con filas vacías (con borde) para que ambas tablas queden del mismo alto.
        const faltan = (minFilas || 0) - Math.max(filas.length, 1);
        for (let i = 0; i < faltan; i++) body += '<tr class="st-bal-relleno"><td style="text-align:left;">&nbsp;</td><td></td><td></td><td></td></tr>';
        return `<table class="st-balance-tabla">
            <thead><tr><th colspan="4" class="st-bal-titulo">${esc(titulo)}</th></tr>
            <tr><th>DIA</th><th>INICIO</th><th>FIN</th><th>TOTAL</th></tr></thead>
            <tbody>${body}</tbody>
            <tfoot><tr><td colspan="3" class="st-bal-vacio"></td><td class="st-bal-total">${hm(total)}</td></tr></tfoot>
        </table>`;
    }

    // Datos de la última carga de la lista; el modal se arma con ellos al abrirlo.
    let ultimo = { registros: [], banco: [] };

    function actualizarDatos(registros, banco) {
        ultimo = { registros: registros || [], banco: banco || [] };
        // Si el modal está abierto mientras se recarga la lista, lo refresca.
        if (document.getElementById('sobretiempoModalEstado')) abrirBalance();
    }

    function cerrarBalance() {
        const m = document.getElementById('sobretiempoModalEstado');
        if (m) m.remove();
        document.removeEventListener('keydown', teclaEsc);
        document.body.style.overflow = '';
    }

    function teclaEsc(e) { if (e.key === 'Escape') cerrarBalance(); }

    function abrirBalance() {
        if (!ultimo.registros.length) { window.toast('⚠️ Este empleado aún no tiene solicitudes de sobretiempo', 'warning'); return; }
        const d = armar(ultimo.registros, ultimo.banco);
        const saldo = d.totalSt - d.totalDc;
        const filasMax = Math.max(d.st.length, d.dc.length, 1);
        const prev = document.getElementById('sobretiempoModalEstado');
        if (prev) prev.remove();
        const emp = window.personalSeleccionado || {};
        const nombre = [emp.APELLIDOS_NOMBRES, emp.NOMBRES].find(Boolean) || '';
        const m = document.createElement('div');
        m.id = 'sobretiempoModalEstado';
        m.className = 'st-modal-fondo';
        m.innerHTML = `<div class="st-modal" role="dialog" aria-modal="true" aria-label="Estado de horas de sobretiempo y descanso">
            <div class="st-modal-cab">
                <div><strong><i class="fas fa-balance-scale"></i> Estado de horas</strong>${nombre ? `<div class="st-modal-sub">${window.esc(nombre)}</div>` : ''}</div>
                <button type="button" class="st-modal-x" data-accion="cerrar" aria-label="Cerrar"><i class="fas fa-times"></i></button>
            </div>
            <div class="st-modal-cuerpo">
                <div class="st-balance-saldo">Sobretiempo ${hm(d.totalSt)} − Descanso ${hm(d.totalDc)} = <b>${hm(saldo)}</b> por compensar</div>
                <div class="st-balance-tablas">${tablaHTML('HORAS SOBRETIEMPO', d.st, d.totalSt, filasMax)}${tablaHTML('DESCANSO COMPENSATORIO', d.dc, d.totalDc, filasMax)}</div>
                <div class="st-balance-nota">Solo solicitudes aprobadas por RR.HH.</div>
            </div>
            <div class="st-modal-pie">
                <button type="button" class="btn-chip btn-chip-green" data-accion="descargar"><i class="fas fa-download"></i> Descargar balance</button>
                <button type="button" class="btn-chip" data-accion="cerrar">Cerrar</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        document.body.style.overflow = 'hidden';
        m.addEventListener('click', e => { if (e.target === m) cerrarBalance(); });
        m.querySelectorAll('[data-accion="cerrar"]').forEach(b => b.addEventListener('click', cerrarBalance));
        m.querySelector('[data-accion="descargar"]').addEventListener('click', () => descargar(d, 'Balance_horas_' + String(emp.ID_PERSONAL || '')));
        document.addEventListener('keydown', teclaEsc);
    }

    // ---------- Excel ----------
    function descargar(datos, nombre) {
        if (typeof XLSX === 'undefined' || !XLSX.utils) { window.toast('⚠️ No se pudo cargar la librería de Excel (XLSX). Revisa tu conexión.', 'warning'); return false; }
        const borde = { style: 'thin', color: { rgb: '000000' } };
        const B = { top: borde, bottom: borde, left: borde, right: borde };
        const fuente = (extra) => Object.assign({ name: 'Calibri', sz: 11 }, extra || {});
        const filas = Math.max(datos.st.length, datos.dc.length, 1);
        const ws = {};
        const put = (r, c, v, s) => { ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: String(v), s }; };

        const bloque = (c0, titulo, lista, total) => {
            put(0, c0, titulo, { font: fuente({ bold: true }), alignment: { horizontal: 'center' }, border: B });
            for (let k = 1; k < 4; k++) put(0, c0 + k, '', { border: B });
            ['DIA', 'INICIO', 'FIN', 'TOTAL'].forEach((t, k) => put(1, c0 + k, t, { font: fuente({ bold: true }), alignment: { horizontal: 'center' }, border: B }));
            for (let i = 0; i < filas; i++) {
                const x = lista[i];
                const v = x ? [dia(x.fecha), x.ini || '', x.fin || '', hm(x.horas)] : ['', '', '', ''];
                v.forEach((t, k) => put(2 + i, c0 + k, t, { font: fuente(), alignment: { horizontal: k === 0 ? 'left' : 'right' }, border: B }));
            }
            for (let k = 0; k < 3; k++) put(2 + filas, c0 + k, '', { border: B });
            put(2 + filas, c0 + 3, hm(total), { font: fuente({ bold: true }), alignment: { horizontal: 'right' }, border: B, fill: { patternType: 'solid', fgColor: { rgb: AZUL_TOTAL } } });
        };
        bloque(0, 'HORAS SOBRETIEMPO', datos.st, datos.totalSt);
        bloque(5, 'DESCANSO COMPENSATORIO', datos.dc, datos.totalDc);

        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 2 + filas, c: 8 } });
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 0, c: 5 }, e: { r: 0, c: 8 } }];
        ws['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 4 }, { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Resumen');
        XLSX.writeFile(wb, (nombre || 'Resumen_sobretiempo').replace(/[^\w\-À-ÿ]+/g, '_') + '.xlsx');
        window.toast('📥 Resumen descargado', 'success');
        return true;
    }

    function descargarSolicitud(registros, banco, idSolicitud) {
        return descargar(armar(registros, banco, { idSolicitud }), 'Resumen_' + idSolicitud);
    }

    return { armar, actualizarDatos, abrirBalance, cerrarBalance, descargar, descargarSolicitud };
})();

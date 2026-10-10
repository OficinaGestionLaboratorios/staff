// ============================================================
// INFORMES-EXPORT.JS — Excel / CSV / PDF (ficha consolidada)
// ============================================================
// Excel usa la librería xlsx-js-style ya cargada en app.html
// (window.XLSX). El PDF se genera como página imprimible
// ("Guardar como PDF" en el diálogo de impresión del navegador),
// sin depender de librerías externas.
// Los permisos de clase Enfermedad salen siempre como
// "Descanso médico registrado" (sin detalle médico).
// ============================================================
window.InformesExport = (function () {
    const C = window.InformesCalc, SI = C.SIN_INFO, e = window.InformesUtil.e;
    const f = x => (x === null || x === undefined || x === '') ? SI : x;

    function seguro(s) { return C.norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'ficha'; }

    // Todas las secciones de la ficha como tablas planas (misma fuente para PDF/Excel/CSV).
    function secciones(r) {
        const t = C.hoy(), s = C.situacion(r, t), I = C.indicadores(r, t), p = r.p, tr = I.tr;
        const S = [];
        S.push({ t: '1. Datos personales', cols: ['Campo', 'Valor'], rows: [
            ['Nombre completo', C.nombreInv(p)], ['Código', p.CODE], ['ID_PERSONAL', p.ID_PERSONAL], ['DNI', p.DNI], ['Cargo', p.CARGO], ['Área / programa', p.PROGRAMA],
            ['Laboratorio / lugar de trabajo', p.LUGAR_TRABAJO], ['Tipo de vinculación (contrato)', p.TIPO_CONTRATO], ['Fecha de vinculación', p.FECHA_VINCULACION ? C.fmt(C.parse(p.FECHA_VINCULACION)) : ''],
            ['Correo institucional', p.EMAIL_INSTITUCIONAL], ['Teléfono', p.TELEFONO]].map(x => [x[0], f(x[1])]) });
        S.push({ t: '2. Situación actual (al ' + C.fmt(t) + ')', cols: ['Concepto', 'Detalle'], rows: [
            ['Estado actual', s.estado], ['Horario vigente', s.hv ? C.resumenHorario(s.hv.g) + ' (' + s.hv.g.ID_GRUPO + ')' : SI],
            ['Contrato vigente', s.contrato ? (s.contrato.tipo || 'Tipo no registrado') + ' · ' + C.fmt(s.contrato.inicio) + ' – ' + (s.contrato.fin !== null ? C.fmt(s.contrato.fin) : 'ACTUAL') : 'Sin contrato vigente'],
            ['Antigüedad', I.antiguedad], ['Alertas', s.alertas.length ? s.alertas.map(a => a.icono + ' ' + a.texto).join(' | ') : 'Sin alertas']] });
        S.push({ t: '3. Contratos', cols: ['N°', 'Tipo', 'Inicio', 'Término', 'Duración', 'Cargo', 'Área', 'Laboratorio', 'Jornada', 'Estado'],
            rows: tr.contratos.map(c => [c.n, f(c.tipo), c.inicio !== null ? C.fmt(c.inicio) : C.INCOMPLETA, c.fin !== null ? C.fmt(c.fin) : 'ACTUAL', c.inicio !== null ? C.durTexto(c.inicio, c.fin === null ? t : Math.min(c.fin, t)) : C.INCOMPLETA, f(c.cargo), f(c.area), f(c.laboratorio), f(c.jornada), c.estado]),
            nota: 'Total de contratos: ' + tr.nContratos + ' · Tiempo contratado: ' + C.durDias(tr.diasContratado) + '. La ficha de personal solo conserva el contrato vigente o último.' });
        S.push({ t: '4. Periodos sin contrato', cols: ['Periodo', 'Desde', 'Hasta', 'Duración'],
            rows: tr.segmentos.filter(x => x.tipo !== 'contrato').map(x => [x.tipo === 'sin' ? 'Sin contrato' : 'Previo sin detalle contractual', C.fmt(x.desde), C.fmt(x.hasta), C.durTexto(x.desde, x.hasta)]),
            nota: 'Tiempo sin contrato: ' + C.durDias(tr.diasSinContrato) + ' · Interrupciones contractuales: ' + tr.interrupciones });
        S.push({ t: '5. Historial de horarios', cols: ['Horario', 'Inicio', 'Término', 'Horario semanal', 'Turno', 'Jornada', 'Estado'],
            rows: [...I.hs].reverse().map(h => [h.g.ID_GRUPO, C.fmt(h.ini), h.fin === null ? 'Hasta nuevo aviso' : C.fmt(h.fin), C.resumenHorario(h.g), f(C.turnoDe(h.g)), h.g.HORAS_SEMANA ? parseFloat(h.g.HORAS_SEMANA) + ' h/sem' : SI, h.g.ESTADO || SI]),
            nota: 'Cambios de horario: ' + (I.cambiosHorario === null ? SI : I.cambiosHorario) });
        S.push({ t: '6. Horas extras', cols: ['Fecha', 'Hora inicial', 'Hora final', 'Total horas', 'Motivo', 'Estado'],
            rows: I.ex.map(x => [C.fmt(x.fecha), f(x.ini), f(x.fin), C.fmtHoras(x.horas), f(x.motivo), f(x.estado)]),
            nota: 'Histórico aprobado: ' + C.fmtHoras(I.te.historico) + ' · Año: ' + C.fmtHoras(I.te.anio) + ' · Mes: ' + C.fmtHoras(I.te.mes) });
        S.push({ t: '7. Permisos', cols: ['Fecha', 'Hora inicial', 'Hora final', 'Duración', 'Motivo', 'Sustento', 'Estado'],
            rows: I.pe.map(x => [C.fmt(x.fecha), f(x.ini), f(x.fin), C.fmtHoras(x.horas), x.medico ? 'Descanso médico registrado' : f((x.clase ? x.clase + ': ' : '') + x.motivo), SI, x.estado]),
            nota: 'Total: ' + I.tp.n + ' permiso(s) · ' + C.fmtHoras(I.tp.horas) });
        S.push({ t: '8. Vacaciones', cols: ['Periodo', 'Inicio', 'Fin', 'Días', 'Estado'],
            rows: I.va.tramos.map(v => [v.periodo, C.fmt(v.inicio), C.fmt(v.fin), v.dias, v.inicio > t ? 'Programado' : (v.fin < t ? 'Histórico' : 'Vigente')]),
            nota: I.va.periodos.length ? 'Días utilizados: ' + I.va.tomados + ' · Días pendientes: ' + I.va.pendientes : SI });
        S.push({ t: '9. Descansos médicos y ausencias', cols: ['Tipo', 'Inicio', 'Fin', 'Días / horas', 'Estado', 'Sustento', 'Observaciones'],
            rows: C.ausencias(r, t).map(a => [a.tipo, C.fmt(a.inicio), C.fmt(a.fin), a.dias ? a.dias : (a.horas ? C.fmtHoras(a.horas) : '—'), a.estado, a.sustento, a.medico ? 'Descanso médico registrado' : f(a.obs)]) });
        S.push({ t: '10. Incidencias de asistencia', cols: ['Concepto', 'Cantidad'], rows: ['Incidencias', 'Omisiones de marcación', 'Tardanzas', 'Salidas anticipadas', 'Jornadas incompletas'].map(x => [x, SI]),
            nota: 'El sistema no almacena marcaciones de asistencia.' });
        const ev = window.InformesFicha.eventos(r).filter(x => x.lane !== 'extra' || true).sort((a, b) => a.ini - b.ini);
        S.push({ t: '11. Línea de tiempo histórica', cols: ['Desde', 'Hasta', 'Evento', 'Detalle'],
            rows: ev.map(x => [C.fmt(x.ini), x.abierto ? 'ACTUAL' : C.fmt(x.fin ?? x.ini), x.titulo, x.lineas.filter(l => !['Fecha', 'Fechas', 'Periodo', 'Vigencia'].includes(l[0])).map(l => l[0] + ': ' + f(l[1])).join(' · ')]) });
        return S;
    }

    function bajar(blob, nombre) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    const csvCel = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';

    function ficha(r, fmt) {
        if (!r) return;
        const sec = secciones(r), nom = seguro(C.nombreInv(r.p)) + '_' + C.iso(C.hoy());
        if (fmt === 'csv') {
            let out = csvCel('FICHA CONSOLIDADA DEL TRABAJADOR') + '\n' + csvCel(C.nombreInv(r.p)) + '\n';
            sec.forEach(s => { out += '\n' + csvCel(s.t) + '\n' + s.cols.map(csvCel).join(',') + '\n'; (s.rows.length ? s.rows : [[SI]]).forEach(x => { out += x.map(csvCel).join(',') + '\n'; }); if (s.nota) out += csvCel(s.nota) + '\n'; });
            bajar(new Blob(['\ufeff' + out], { type: 'text/csv;charset=utf-8' }), 'ficha_' + nom + '.csv');
        } else if (fmt === 'xlsx') {
            if (!window.XLSX) return window.toast('❌ Librería Excel no disponible', 'error');
            const wb = XLSX.utils.book_new();
            sec.forEach(s => {
                const aoa = [s.cols, ...(s.rows.length ? s.rows : [[SI]])]; if (s.nota) aoa.push([], [s.nota]);
                const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = s.cols.map((c, i) => ({ wch: Math.min(60, Math.max(12, c.length + 2, ...s.rows.map(x => String(x[i] ?? '').length + 2))) }));
                XLSX.utils.book_append_sheet(wb, ws, s.t.replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31));
            });
            XLSX.writeFile(wb, 'ficha_' + nom + '.xlsx');
        } else if (fmt === 'pdf') {
            const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Ficha consolidada – ${e(C.nombreInv(r.p))}</title><style>
                body{font-family:Arial,Helvetica,sans-serif;color:#32363A;margin:18px;font-size:11px}h1{font-size:18px;margin:0 0 2px;color:#0854A0}h2{font-size:13px;margin:16px 0 4px;color:#0854A0;border-bottom:1px solid #BFC8D1;padding-bottom:2px}
                .sub{color:#6A6D70;margin-bottom:10px}table{border-collapse:collapse;width:100%;margin-bottom:4px}th{background:#F5F6F7;text-align:left;font-size:10px;text-transform:uppercase;color:#6A6D70}th,td{border:1px solid #D5DADD;padding:3px 5px;vertical-align:top}
                .n{color:#6A6D70;font-size:10px;margin:2px 0}.v{color:#6A6D70;font-style:italic;padding:4px}tr{page-break-inside:avoid}@media print{.no{display:none}}</style></head><body>
                <div class="no" style="margin-bottom:10px"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>
                <h1>FICHA CONSOLIDADA DEL TRABAJADOR</h1><div class="sub">${e(C.nombreInv(r.p))} · Código ${e(r.p.CODE)} · Emitida el ${C.fmt(C.hoy())}</div>
                ${sec.map(s => `<h2>${e(s.t)}</h2>${s.rows.length ? `<table><thead><tr>${s.cols.map(c => `<th>${e(c)}</th>`).join('')}</tr></thead><tbody>${s.rows.map(x => `<tr>${x.map(c => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<div class="v">${SI}</div>`}${s.nota ? `<div class="n">${e(s.nota)}</div>` : ''}`).join('')}
                </body></html>`;
            const w = window.open('', '_blank');
            if (!w) return window.toast('⚠️ El navegador bloqueó la ventana. Permite ventanas emergentes para generar el PDF.', 'warning');
            w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (x) {} }, 400);
        }
    }

    function consulta(fmt) {
        const S = window.InformesEstado, q = window.InformesConsulta.CONSULTAS.find(x => x.id === S.consulta);
        const res = window.InformesConsulta.ejecutar(q);
        const cols = ['Trabajador', 'Código', 'DNI', 'Cargo', 'Laboratorio', 'Estado', 'Detalle'];
        const rows = res.map(x => [C.nombreInv(x.rec.p), x.rec.p.CODE, f(x.rec.p.DNI), f(x.rec.p.CARGO), f(x.rec.p.LUGAR_TRABAJO), window.InformesSit(x.rec).estado, x.det]);
        const nom = 'consulta_' + seguro(q.t) + '_' + C.iso(C.hoy());
        if (fmt === 'csv') bajar(new Blob(['\ufeff' + [cols, ...rows].map(x => x.map(csvCel).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }), nom + '.csv');
        else { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols, ...rows]), q.t.slice(0, 31)); XLSX.writeFile(wb, nom + '.xlsx'); }
    }
    return { ficha, consulta, secciones };
})();

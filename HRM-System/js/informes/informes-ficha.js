// ============================================================
// INFORMES-FICHA.JS — Ficha integral del trabajador
// ============================================================
(function () {
    const C = window.InformesCalc, S = window.InformesEstado, e = window.InformesUtil.e;
    const SI = C.SIN_INFO;
    const COL = { contrato: '#0A6ED1', sin: '#E9730C', previo: '#BFC8D1', horario: '#5B738B', vac: '#107E3E', lic: '#9B59B6', perm: '#0A6ED1', med: '#7B3FA0', extra: '#E9730C', extraP: '#A65000' };
    const LANES = [['contratos', 'Contratos'], ['horarios', 'Horarios'], ['vac', 'Vacaciones'], ['lic', 'Licencias'], ['perm', 'Permisos'], ['med', 'Descanso médico'], ['extra', 'Horas extras']];
    const TABS = [['resumen', 'Resumen y consultas'], ['contratos', 'Trayectoria contractual'], ['horarios', 'Horarios'], ['extras', 'Horas extras'], ['permisos', 'Permisos'],
        ['vacaciones', 'Vacaciones'], ['ausencias', 'Descansos médicos y ausencias'], ['asistencia', 'Asistencia'], ['linea', 'Línea de tiempo']];

    const F = { tl: { escala: 'anual', ref: null }, cal: null, orden: 'fecha', fil: { anio: '', mes: '', desde: '', hasta: '' }, fechaH: '', pop: [] };
    function reset() {
        const h = C.hoy(), o = C.ymd(h);
        F.tl = { escala: 'anual', ref: h }; F.cal = { y: o.y, m: o.m }; F.orden = 'fecha'; F.fil = { anio: '', mes: '', desde: '', hasta: '' }; F.fechaH = C.iso(h); F.pop = [];
    }
    reset();

    const rec = () => window.InformesDatos.get().porCode[S.code];
    const acceso = k => window.InformesDatos.get().fuentes[k].acceso;
    const mut = t => `<span class="mut">${e(t || SI)}</span>`;
    const val = x => (x === null || x === undefined || x === '') ? mut() : e(x);
    function estadoClase(s) { return s === 'Activo' ? 'ok' : (s === 'Inactivo' ? 'neu' : (s === 'Sin contrato vigente' ? 'bad' : 'warn')); }
    function estBadge(s) { const c = { Vigente: 'ok', Programado: 'neu', 'Histórico': 'neu', Vencido: 'bad' }[s] || 'neu'; return `<span class="inf-estado ${c}">${e(s || SI)}</span>`; }
    function tabla(cols, filas, vacio) {
        if (!filas.length) return `<div class="inf-vacio">${e(vacio || SI)}</div>`;
        return `<div class="inf-tbl-wrap"><table class="inf-tbl"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr>${f.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }

    // ---------- filtro de fechas de la ficha ----------
    function rango() {
        const f = F.fil; let a = C.parse(f.desde), b = C.parse(f.hasta);
        if (a === null && b === null && f.anio) {
            const y = +f.anio;
            if (f.mes) { a = C.mk(y, +f.mes, 1); b = C.mk(y, +f.mes + 1, 1) - 1; } else { a = C.mk(y, 1, 1); b = C.mk(y, 12, 31); }
        }
        return [a, b];
    }
    function enRango(ini, fin) { const [a, b] = rango(); fin = fin ?? ini; return (a === null || fin >= a) && (b === null || ini <= b); }
    const hayFiltro = () => rango().some(x => x !== null);

    // ---------- eventos (línea de tiempo y exportación) ----------
    function eventos(r) {
        const t = C.hoy(), ev = [], I = C.indicadores(r, t);
        I.tr.segmentos.forEach(s => {
            const ab = s.hasta === null;
            const k = s.tipo, c = s.c;
            ev.push({ lane: 'contratos', kind: k, ini: s.desde, fin: s.hasta, abierto: ab,
                label: k === 'contrato' ? s.titulo : (k === 'sin' ? 'SIN CONTRATO' : 'Previo sin detalle'),
                color: k === 'contrato' ? COL.contrato : (k === 'sin' ? COL.sin : COL.previo),
                titulo: k === 'contrato' ? 'CONTRATO ' + String(c.n).padStart(2, '0') : (k === 'sin' ? 'PERIODO SIN CONTRATO' : 'PERIODO PREVIO SIN DETALLE'),
                lineas: k === 'contrato' ? [['Tipo', c.tipo || SI], ['Periodo', C.fmt(s.desde) + ' – ' + (ab ? 'ACTUAL (sin fecha de término)' : C.fmt(s.hasta))], ['Cargo', c.cargo || SI], ['Laboratorio', c.laboratorio || SI]]
                    : [['Periodo', C.fmt(s.desde) + ' – ' + C.fmt(s.hasta)], ['Duración', C.durTexto(s.desde, s.hasta)], ...(k === 'previo' ? [['Nota', 'Existe antigüedad previa al contrato registrado, pero no hay detalle de contratos anteriores']] : [])] });
        });
        I.hs.forEach(h => ev.push({ lane: 'horarios', kind: 'horario', ini: h.ini, fin: h.fin, abierto: h.fin === null, color: COL.horario, label: h.g.ID_GRUPO,
            titulo: 'HORARIO ' + h.g.ID_GRUPO, lineas: [['Vigencia', C.fmt(h.ini) + ' – ' + (h.fin === null ? 'hasta nuevo aviso' : C.fmt(h.fin))], ['Horario', C.resumenHorario(h.g)], ['Jornada', h.g.HORAS_SEMANA ? parseFloat(h.g.HORAS_SEMANA) + ' h/sem' : SI]] }));
        I.va.tramos.forEach(v => ev.push({ lane: 'vac', kind: 'vac', ini: v.inicio, fin: v.fin, color: COL.vac, label: v.dias + ' d', titulo: 'VACACIONES',
            lineas: [['Fechas', C.fmt(v.inicio) + ' – ' + C.fmt(v.fin)], ['Días', v.dias], ['Periodo', v.periodo]] }));
        I.li.forEach(l => ev.push({ lane: 'lic', kind: 'lic', ini: l.inicio, fin: l.fin ?? l.inicio, color: COL.lic, label: 'Licencia', titulo: 'LICENCIA',
            lineas: [['Fechas', C.fmt(l.inicio) + ' – ' + C.fmt(l.fin ?? l.inicio)], ['Días', l.dias || SI], ['Tipo', l.tipo], ['Sustento', l.sustentado ? 'SUSTENTADO' : 'PENDIENTE DE SUSTENTO'], ['Motivo', l.motivo || SI]] }));
        I.pe.forEach(p => {
            if (p.medico) ev.push({ lane: 'med', kind: 'punto', ini: p.fecha, fin: p.fecha, color: COL.med, titulo: 'DESCANSO MÉDICO',
                lineas: [['Fecha', C.fmt(p.fecha)], ['Registro', 'Descanso médico registrado'], ['Sustento', SI]] });
            else ev.push({ lane: 'perm', kind: 'punto', ini: p.fecha, fin: p.fecha, color: COL.perm, titulo: 'PERMISO',
                lineas: [['Fecha', C.fmt(p.fecha)], ['Horario', p.ini && p.fin ? p.ini + ' – ' + p.fin : SI], ['Duración', C.fmtHoras(p.horas)], ['Clase', p.clase || SI], ['Motivo', p.motivo || SI]] });
        });
        I.ex.forEach(x => ev.push({ lane: 'extra', kind: 'punto', ini: x.fecha, fin: x.fecha, color: x.estado === 'Aprobado' ? COL.extra : COL.extraP, titulo: 'HORAS EXTRAS',
            lineas: [['Fecha', C.fmt(x.fecha)], ['Horario', x.ini && x.fin ? x.ini + ' – ' + x.fin : SI], ['Horas', C.fmtHoras(x.horas)], ['Estado', x.estado || SI], ['Motivo', x.motivo || SI]] }));
        return ev;
    }
    function reg(ev) { F.pop.push(ev); return F.pop.length - 1; }

    // ---------- cabecera ----------
    function cabecera(r, s) {
        const p = r.p, ini = (p.NOMBRES || p.APE_PATERNO || '?').charAt(0) + (p.APE_PATERNO || '').charAt(0);
        const c = s.contrato || (s.tr.contratos[s.tr.contratos.length - 1] || null);
        const hv = s.hv ? C.resumenHorario(s.hv.g) + ' (desde ' + C.fmt(s.hv.ini) + (s.hv.fin !== null ? ' hasta ' + C.fmt(s.hv.fin) : '') + ')' : '';
        const ctxt = c ? [c.tipo || 'Tipo no registrado', c.inicio !== null ? C.fmt(c.inicio) : '?', c.fin !== null ? C.fmt(c.fin) : 'ACTUAL'].join(' · ') + ' (' + c.estado + ')' : '';
        const D = (k, v) => `<div class="inf-dato"><div class="k">${k}</div><div class="v ${v ? '' : 'mut'}">${v ? e(v) : SI}</div></div>`;
        return `<div class="inf-card"><div class="inf-ficha-head">
            <div style="position:relative"><img class="inf-foto" src="img/fotos/${encodeURIComponent(p.ID_PERSONAL || '')}.jpg" alt="Foto" onerror="this.outerHTML='<div class=&quot;inf-foto&quot;>${e(ini)}</div>'"></div>
            <div class="inf-head-main"><h1>${e(C.nombreInv(p))}</h1>
                <span class="inf-estado ${estadoClase(s.estado)}">${e(s.estado)}</span>
                <div class="inf-datos">
                    ${D('Código', p.CODE)}${D('ID_PERSONAL', p.ID_PERSONAL)}${D('DNI', p.DNI)}${D('Cargo', p.CARGO)}
                    ${D('Área / programa', p.PROGRAMA)}${D('Laboratorio / lugar de trabajo', p.LUGAR_TRABAJO)}${D('Tipo de vinculación (contrato)', p.TIPO_CONTRATO)}
                    ${D('Fecha de vinculación', p.FECHA_VINCULACION ? C.fmt(C.parse(p.FECHA_VINCULACION)) : '')}
                    ${D('Horario vigente', hv)}${D('Contrato vigente', s.contrato ? ctxt : (c ? 'Sin contrato vigente · último: ' + ctxt : ''))}
                </div></div></div></div>`;
    }

    function kpis(r, I) {
        const a = k => acceso(k);
        const K = (l, v, tab, ok = true) => `<button class="inf-kpi" onclick="Informes.tab('${tab}')"><div class="l">${l}</div><div class="v ${ok && v !== '' ? '' : 'mut'}">${ok && v !== '' ? e(v) : SI}</div></button>`;
        const tr = I.tr, sinC = tr.contratos.length;
        return `<div class="inf-kpis">
            ${K('Contratos', sinC, 'contratos', sinC > 0)}
            ${K('Tiempo contratado', sinC ? C.durDias(tr.diasContratado) : '', 'contratos', sinC > 0)}
            ${K('Tiempo sin contrato', sinC ? C.durDias(tr.diasSinContrato) : '', 'contratos', sinC > 0)}
            ${K('Horas extras acumuladas', C.fmtHoras(I.te.historico), 'extras', a('sobretiempo'))}
            ${K('Permisos', I.tp.n, 'permisos', a('permisos'))}
            ${K('Horas de permisos', C.fmtHoras(I.tp.horas), 'permisos', a('permisos'))}
            ${K('Vacaciones utilizadas', I.va.periodos.length ? I.va.tomados + ' días' : '', 'vacaciones', a('vacaciones') && I.va.periodos.length > 0)}
            ${K('Vacaciones pendientes', I.va.periodos.length ? I.va.pendientes + ' días' : '', 'vacaciones', a('vacaciones') && I.va.periodos.length > 0)}
            ${K('Descansos médicos', I.medicos, 'ausencias', a('permisos'))}
            ${K('Incidencias de asistencia', '', 'asistencia', false)}
            ${K('Cambios de horario', I.cambiosHorario === null ? '' : I.cambiosHorario, 'horarios', a('horarios') && I.cambiosHorario !== null)}</div>`;
    }

    // ---------- barra de filtros ----------
    function filtros(r) {
        const ys = new Set();
        [].concat(C.extras(r).map(x => x.fecha), C.permisos(r).map(x => x.fecha), C.ausencias(r).map(x => x.inicio)).forEach(d => ys.add(C.ymd(d).y));
        const yy = [...ys].sort((a, b) => b - a);
        return `<div class="inf-card" style="padding:10px 14px"><div class="inf-filtros">
            <div><label>Año</label><select onchange="Informes.fil('anio',this.value)"><option value="">Todos</option>${yy.map(y => `<option ${String(y) === F.fil.anio ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
            <div><label>Mes</label><select onchange="Informes.fil('mes',this.value)"><option value="">Todos</option>${C.MESES.map((m, i) => `<option value="${i + 1}" ${String(i + 1) === F.fil.mes ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
            <div><label>Fecha inicial</label><input type="date" value="${e(F.fil.desde)}" onchange="Informes.fil('desde',this.value)"></div>
            <div><label>Fecha final</label><input type="date" value="${e(F.fil.hasta)}" onchange="Informes.fil('hasta',this.value)"></div>
            <div style="display:flex;align-items:flex-end;gap:6px"><button class="btn btn-secondary" onclick="Informes.fil('limpiar')"><i class="fas fa-eraser"></i> Limpiar</button></div>
            </div>${hayFiltro() ? `<p class="inf-sub" style="margin:6px 0 0"><i class="fas fa-filter"></i> Las tablas muestran solo el periodo filtrado; las tarjetas superiores y los totales «históricos» no cambian.</p>` : ''}</div>`;
    }

    // ---------- consultas de gestión / resumen ----------
    function qa(r, I, s) {
        const t = C.hoy(), tr = I.tr, ac = k => acceso(k);
        const g = (titulo, items) => `<div class="inf-qa-g"><h3>${titulo}</h3><dl>${items.map(([q, a]) => `<dt>${q}</dt><dd class="${a === SI || a === '' || a === null ? 'mut' : ''}">${a === '' || a === null || a === undefined ? SI : e(a)}</dd>`).join('')}</dl></div>`;
        const c1 = tr.primero, cv = tr.vigente;
        const ult = tr.contratos[tr.contratos.length - 1];
        const hsList = I.hs.map(h => C.fmt(h.ini) + (h.fin === null ? ' en adelante' : ' – ' + C.fmt(h.fin))).join(' | ');
        const hvT = C.horarioEn(r, C.parse(F.fechaH) ?? t);
        const accT = (k, v) => ac(k) ? v : SI;
        const au = C.ausencias(r).filter(a => a.estado !== 'Programado'), sum = tp => au.filter(a => a.tipo === tp); // lo programado a futuro aún no es tiempo no laborado
        const dias = tp => sum(tp).reduce((x, a) => x + (a.dias || 0), 0), hrs = tp => sum(tp).reduce((x, a) => x + (a.horas || 0), 0);
        return `<div class="inf-qa">
            ${g('Contratos', [['¿Cuántos contratos ha tenido?', tr.nContratos ? tr.nContratos : ''], ['¿Cuál fue su primer contrato?', c1 ? (c1.tipo || 'Tipo no registrado') + ' · ' + (c1.inicio !== null ? C.fmt(c1.inicio) : '?') + ' – ' + (c1.fin !== null ? C.fmt(c1.fin) : 'actual') : ''],
                ['¿Cuál es su contrato actual?', cv ? (cv.tipo || 'Tipo no registrado') + ' · desde ' + C.fmt(cv.inicio) + (cv.fin !== null ? ' hasta ' + C.fmt(cv.fin) : '') : (ult ? 'Sin contrato vigente' : '')],
                ['¿Cuánto tiempo ha estado contratado?', tr.nContratos ? C.durDias(tr.diasContratado) : ''], ['¿Cuánto tiempo estuvo sin contrato?', tr.nContratos ? C.durDias(tr.diasSinContrato) : ''],
                ['¿Cuántas interrupciones contractuales tuvo?', tr.nContratos ? tr.interrupciones : '']])}
            ${g('Horarios', [['¿Cuál es su horario actual?', s.hv ? C.resumenHorario(s.hv.g) : ''], ['¿Qué horarios tuvo anteriormente?', accT('horarios', hsList)], ['¿Cuántas veces cambió de horario?', accT('horarios', I.cambiosHorario === null ? '' : I.cambiosHorario)],
                [`¿Cuál era su horario al <input type="date" class="inf-in" style="width:auto;display:inline;padding:2px 4px" value="${e(F.fechaH)}" onchange="Informes.fechaH(this.value)">?`, hvT ? C.resumenHorario(hvT.g) + ' (' + hvT.g.ID_GRUPO + ')' : (ac('horarios') ? 'Sin horario registrado en esa fecha' : SI)]])}
            ${g('Horas extras', [['¿Cuántas horas extras tiene?', accT('sobretiempo', C.fmtHoras(I.te.historico) + ' aprobadas')], ['¿Cuántas realizó este mes?', accT('sobretiempo', C.fmtHoras(I.te.mes))], ['¿Cuántas realizó este año?', accT('sobretiempo', C.fmtHoras(I.te.anio))],
                ['Pendientes / rechazadas', accT('sobretiempo', I.te.pendientes + ' pendiente(s) · ' + I.te.rechazados + ' rechazada(s)')]])}
            ${g('Permisos', [['¿Cuántos permisos tuvo?', accT('permisos', I.tp.n)], ['¿Cuántas horas acumuló?', accT('permisos', C.fmtHoras(I.tp.horas))], ['¿Cuál fue el motivo de cada permiso?', ac('permisos') ? 'Ver detalle en la pestaña Permisos' : SI]])}
            ${g('Vacaciones', [['¿Cuántos días utilizó?', I.va.periodos.length ? I.va.tomados + ' días' : ''], ['¿Cuántos tiene pendientes?', I.va.periodos.length ? I.va.pendientes + ' días' : ''], ['¿Cuándo fueron sus vacaciones?', I.va.tramos.length ? I.va.tramos.slice(0, 4).map(v => C.fmt(v.inicio) + '–' + C.fmt(v.fin)).join(' · ') + (I.va.tramos.length > 4 ? ' …' : '') : '']])}
            ${g('Ausencias', [['¿Cuántos descansos médicos tiene registrados?', accT('permisos', I.medicos)], ['¿Cuántos días estuvo ausente? (licencias + vacaciones)', au.length ? (dias('Licencia') + dias('Vacaciones')) + ' días' : ''],
                ['¿Cuánto tiempo no laboró por cada concepto?', au.length ? 'Vacaciones ' + dias('Vacaciones') + ' d · Licencias ' + dias('Licencia') + ' d · Permisos ' + C.fmtHoras(hrs('Permiso')) + ' · Desc. médicos ' + C.fmtHoras(hrs('Descanso médico')) : '']])}
            ${g('Asistencia', [['¿Cuántas incidencias tiene?', ''], ['¿Cuántas omisiones de marcación?', ''], ['¿Cuántas tardanzas?', ''], ['¿Cuántas salidas anticipadas?', ''], ['¿Cuántas jornadas incompletas?', '']])}
            ${g('Otros indicadores', [['Antigüedad', I.antiguedad], ['Renovaciones', tr.nContratos > 1 ? tr.nContratos - 1 : ''], ['Cambios de cargo', ''], ['Cambios de laboratorio', '']])}
        </div>`;
    }

    // ---------- trayectoria contractual ----------
    function tabContratos(r, I) {
        const tr = I.tr, t = C.hoy();
        const total = Math.max(1, ...[tr.segmentos.reduce((x, s) => x + C.diasInc(s.desde, s.hasta === null ? t : s.hasta), 0)]);
        const lineas = tr.segmentos.map(s => {
            const fin = s.hasta === null ? t : s.hasta, w = Math.max(6, Math.round(C.diasInc(s.desde, fin) / total * 100));
            const ev = eventos(r).find(x => x.lane === 'contratos' && x.ini === s.desde && x.kind === s.tipo);
            const i = reg(ev);
            return `<div style="margin-bottom:10px;cursor:pointer" onclick="Informes.pop(${i})"><div style="font-weight:700;font-size:12px">${e(ev.titulo)}</div>
                <div class="inf-sub">${C.fmt(s.desde)} ${s.tipo === 'sin' ? '─────' : '━━━━━'} ${s.hasta === null ? 'ACTUAL' : C.fmt(s.hasta)} · ${C.durTexto(s.desde, fin)}</div>
                <div style="height:10px;width:${w}%;min-width:40px;border-radius:3px;background:${ev.color};${s.tipo !== 'contrato' ? 'opacity:.6' : ''}"></div></div>`;
        }).join('');
        const cards = `<div class="inf-kpis" style="margin-bottom:10px">
            <div class="inf-kpi" style="cursor:default"><div class="l">Total de contratos</div><div class="v">${tr.nContratos || 0}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Tiempo contratado</div><div class="v">${C.durDias(tr.diasContratado)}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Tiempo sin contrato</div><div class="v">${C.durDias(tr.diasSinContrato)}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Interrupciones</div><div class="v">${tr.interrupciones}</div></div></div>`;
        const filas = tr.contratos.map(c => [e(c.n), val(c.tipo), c.inicio !== null ? C.fmt(c.inicio) : mut(C.INCOMPLETA), c.fin !== null ? C.fmt(c.fin) : 'ACTUAL (sin fecha de término)',
            c.inicio !== null ? C.durTexto(c.inicio, c.fin === null ? t : Math.min(c.fin, t)) : mut(C.INCOMPLETA), val(c.cargo), val(c.area), val(c.laboratorio), val(c.jornada), estBadge(c.estado)]);
        return `<div class="inf-card"><h2>Trayectoria contractual</h2>
            ${tr.nContratos ? cards : ''}
            <div class="inf-info" style="margin-bottom:10px"><i class="fas fa-circle-info"></i> ${(rec().contratos || []).length
                ? `Historial tomado de los contratos registrados (<b>${rec().contratos.length}</b>). Cada renovación es un registro propio.`
                : 'Este trabajador aún no tiene historial de contratos registrado: se muestra el único contrato de la ficha. Registre o migre su historial desde Personal.'}
            ${tr.diasPrevioSinDetalle ? ` Hay ${C.durDias(tr.diasPrevioSinDetalle)} de antigüedad previa al primer contrato registrado (marcado «${C.INCOMPLETA}»).` : ''}</div>
            ${tr.sinContratoActual ? `<div class="inf-aviso" style="margin-bottom:10px">🟠 El último contrato registrado terminó el ${C.fmt(tr.contratos[tr.contratos.length - 1].fin)} y no hay uno posterior: ${C.durDias(tr.diasSinContrato)} sin contrato a hoy.</div>` : ''}
            ${tr.segmentos.length ? `<h2>Línea de tiempo contractual</h2>${lineas}` : `<div class="inf-vacio">${SI}</div>`}
            <h2 style="margin-top:14px">Contratos</h2>
            ${tabla(['N°', 'Tipo de contrato', 'Inicio', 'Término', 'Duración', 'Cargo', 'Área', 'Laboratorio', 'Jornada', 'Estado'], filas)}</div>`;
    }

    // ---------- horarios ----------
    function hvTexto(r, dia) {
        const h = C.horarioEn(r, dia);
        return h ? `<b>${e(C.resumenHorario(h.g))}</b> <span class="inf-sub">(${e(h.g.ID_GRUPO)} · vigencia ${C.fmt(h.ini)} – ${h.fin === null ? 'hasta nuevo aviso' : C.fmt(h.fin)})</span>` : `<span class="mut">Sin horario registrado para esa fecha</span>`;
    }
    function tabHorarios(r, I) {
        if (!acceso('horarios')) return `<div class="inf-card"><div class="inf-vacio">${SI} (sin permiso para ver Horarios)</div></div>`;
        const filas = [...I.hs].reverse().map(h => {
            const obs = [...new Set((h.g.DIAS || []).map(d => d.obs).filter(Boolean))].join(' / ');
            const est = h.g.ESTADO || '';
            return [e(h.g.ID_GRUPO), C.fmt(h.ini), h.fin === null ? 'Hasta nuevo aviso' : C.fmt(h.fin), e(C.resumenHorario(h.g)), val(C.turnoDe(h.g)), h.g.HORAS_SEMANA ? e(parseFloat(h.g.HORAS_SEMANA) + ' h/sem') : mut(),
                mut(), obs ? e(obs) : mut(), estBadge(est)];
        });
        return `<div class="inf-card"><h2>Horario vigente en una fecha</h2>
            <div class="inf-btn-row"><label class="inf-sub">Horario vigente al</label><input type="date" class="inf-in" style="width:auto" value="${e(F.fechaH)}" onchange="Informes.fechaH(this.value)"></div>
            <p id="infHVRes" style="margin:8px 0 0">${hvTexto(r, C.parse(F.fechaH) ?? C.hoy())}</p></div>
            <div class="inf-card"><h2>Horario y ausencias</h2>${calendario(r)}</div>
            <div class="inf-card"><h2>Historial de horarios (${I.hs.length})</h2>
            <p class="inf-sub" style="margin-top:0">Cambios de horario: <b>${I.cambiosHorario === null ? SI : I.cambiosHorario}</b>. Turno: calculado desde la hora de ingreso/salida. Laboratorio y motivo del cambio no se guardan por horario.</p>
            ${tabla(['Horario', 'Inicio', 'Término', 'Horario semanal', 'Turno', 'Jornada', 'Laboratorio', 'Motivo / observación', 'Estado'], filas)}</div>`;
    }

    function calendario(r) {
        const { y, m } = F.cal, n = C.ymd(C.mk(y, m + 1, 1) - 1).d, t = C.hoy();
        const ini = C.mk(y, m, 1), fin = C.mk(y, m, n);
        const evs = eventos(r).filter(x => ['vac', 'lic', 'perm', 'med'].includes(x.lane));
        const L = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
        let h1 = '', h2 = '', h3 = '';
        for (let d = ini; d <= fin; d++) {
            const w = C.dow(d), fin_sem = w === 0 || w === 6, hv = C.horarioEn(r, d), dia = C.diaDeHorario(hv, d);
            h1 += `<th class="${fin_sem ? 'w' : ''} ${d === t ? 'hoy' : ''}">${L[w]}<br>${C.ymd(d).d}</th>`;
            if (!hv) h2 += `<td class="nohor" title="Sin horario registrado">—</td>`;
            else if (!dia) h2 += `<td class="w" title="Día no laborable según horario">—</td>`;
            else h2 += `<td class="lab" title="${e(hv.g.ID_GRUPO)}">${e(dia.ingreso)}<br>${e(dia.salida)}</td>`;
            const hoyEv = evs.filter(x => x.ini <= d && (x.fin ?? x.ini) >= d);
            h3 += `<td class="aus ${fin_sem ? 'w' : ''}">${hoyEv.map(x => `<button class="inf-tri" style="color:${x.color}" title="${e(x.titulo)}" onclick="Informes.pop(${reg(x)})">▲</button>`).join('')}</td>`;
        }
        return `<div class="inf-tl-nav"><button class="inf-chip" onclick="Informes.cal(-1)"><i class="fas fa-chevron-left"></i></button><b>${C.MESES[m - 1]} ${y}</b>
            <button class="inf-chip" onclick="Informes.cal(1)"><i class="fas fa-chevron-right"></i></button><button class="inf-chip" onclick="Informes.cal(0)">Hoy</button></div>
            <div class="inf-cal"><table style="--n:${n}"><tr><td class="rowh">Día</td>${h1}</tr><tr><td class="rowh">Horario</td>${h2}</tr><tr><td class="rowh">Ausencias</td>${h3}</tr></table></div>
            <div class="inf-leyenda"><span><i style="background:${COL.perm}"></i>▲ Permiso</span><span><i style="background:${COL.med}"></i>▲ Descanso médico</span><span><i style="background:${COL.vac}"></i>▲ Vacaciones</span><span><i style="background:${COL.lic}"></i>▲ Licencia</span><span>Clic en ▲ para ver el detalle</span></div>`;
    }

    // ---------- horas extras ----------
    function tabExtras(r, I) {
        if (!acceso('sobretiempo')) return `<div class="inf-card"><div class="inf-vacio">${SI} (sin permiso para ver Sobretiempo)</div></div>`;
        let f = I.ex.filter(x => enRango(x.fecha));
        if (F.orden === 'mayor') f = [...f].sort((a, b) => b.horas - a.horas); else if (F.orden === 'menor') f = [...f].sort((a, b) => a.horas - b.horas);
        const por = {};
        f.filter(x => x.estado === 'Aprobado').forEach(x => { const o = C.ymd(x.fecha), k = o.y * 100 + o.m; por[k] = (por[k] || 0) + x.horas; });
        const ks = Object.keys(por).sort(), mx = Math.max(1, ...ks.map(k => por[k]));
        const chart = ks.length ? `<div class="inf-chart">${ks.map(k => `<div class="b" style="height:${Math.max(3, por[k] / mx * 110)}px" title="${String(k).slice(4)}/${String(k).slice(0, 4)}: ${C.fmtHoras(por[k])}"></div>`).join('')}</div>
            <div class="inf-chart-x">${ks.map(k => `<span>${String(k).slice(4)}/${String(k).slice(2, 4)}</span>`).join('')}</div>` : '';
        const filas = f.map(x => [C.fmt(x.fecha), val(x.ini), val(x.fin), e(C.fmtHoras(x.horas)), val(x.motivo), `<span class="inf-estado ${x.estado === 'Aprobado' ? 'ok' : x.estado === 'Rechazado' ? 'bad' : 'warn'}">${e(x.estado || SI)}</span>`]);
        return `<div class="inf-card"><h2>Horas extras</h2><div class="inf-kpis" style="margin-bottom:10px">
            <div class="inf-kpi" style="cursor:default"><div class="l">Total histórico (aprobadas)</div><div class="v">${C.fmtHoras(I.te.historico)}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Total del año</div><div class="v">${C.fmtHoras(I.te.anio)}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Total del mes</div><div class="v">${C.fmtHoras(I.te.mes)}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Registros</div><div class="v">${I.te.registros}</div></div></div>
            ${chart ? `<h2>Histórico de horas extras aprobadas por mes</h2>${chart}` : ''}
            <div class="inf-btn-row" style="margin:10px 0"><label class="inf-sub">Ordenar por</label>
                <select class="inf-in" style="width:auto" onchange="Informes.orden(this.value)"><option value="fecha" ${F.orden === 'fecha' ? 'selected' : ''}>Fecha (más reciente)</option><option value="mayor" ${F.orden === 'mayor' ? 'selected' : ''}>Mayor cantidad</option><option value="menor" ${F.orden === 'menor' ? 'selected' : ''}>Menor cantidad</option></select></div>
            ${tabla(['Fecha', 'Hora inicial', 'Hora final', 'Total de horas', 'Motivo', 'Estado'], filas)}</div>`;
    }

    // ---------- permisos ----------
    function tabPermisos(r, I) {
        if (!acceso('permisos')) return `<div class="inf-card"><div class="inf-vacio">${SI} (sin permiso para ver Permisos)</div></div>`;
        const f = I.pe.filter(x => enRango(x.fecha));
        const filas = f.map(x => [C.fmt(x.fecha), val(x.ini), val(x.fin), e(C.fmtHoras(x.horas)), x.medico ? 'Descanso médico registrado' : val((x.clase ? x.clase + (x.otra ? ' – ' + x.otra : '') + ': ' : '') + (x.motivo || '')), mut(), estBadge(x.estado)]);
        return `<div class="inf-card"><h2>Permisos</h2><div class="inf-kpis" style="margin-bottom:10px">
            <div class="inf-kpi" style="cursor:default"><div class="l">Total de permisos</div><div class="v">${I.tp.n}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Total de horas</div><div class="v">${C.fmtHoras(I.tp.horas)}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Días con permiso</div><div class="v">${I.tp.dias}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Del año</div><div class="v">${I.tp.anio}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Del mes</div><div class="v">${I.tp.mes}</div></div></div>
            <p class="inf-sub" style="margin-top:0">La boleta de permiso no guarda documento de sustento, por eso esa columna indica «${SI}». Los permisos de clase Enfermedad se muestran solo como «Descanso médico registrado».</p>
            ${tabla(['Fecha', 'Hora inicial', 'Hora final', 'Duración', 'Motivo', 'Sustento', 'Estado'], filas)}</div>`;
    }

    // ---------- vacaciones ----------
    function tabVacaciones(r, I) {
        if (!acceso('vacaciones')) return `<div class="inf-card"><div class="inf-vacio">${SI} (sin permiso para ver Vacaciones)</div></div>`;
        const t = C.hoy(), va = I.va;
        const act = va.tramos.find(v => v.inicio <= t && v.fin >= t), prox = va.tramos.filter(v => v.inicio > t).sort((a, b) => a.inicio - b.inicio)[0];
        const tr = va.tramos.filter(v => enRango(v.inicio, v.fin));
        return `<div class="inf-card"><h2>Vacaciones</h2><div class="inf-kpis" style="margin-bottom:10px">
            <div class="inf-kpi" style="cursor:default"><div class="l">Días utilizados</div><div class="v ${va.periodos.length ? '' : 'mut'}">${va.periodos.length ? va.tomados : SI}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Días pendientes</div><div class="v ${va.periodos.length ? '' : 'mut'}">${va.periodos.length ? va.pendientes : SI}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Vacaciones actuales</div><div class="v ${act ? '' : 'mut'}" style="${act ? 'font-size:14px' : ''}">${act ? C.fmt(act.inicio) + ' – ' + C.fmt(act.fin) : 'No está de vacaciones'}</div></div>
            <div class="inf-kpi" style="cursor:default"><div class="l">Próximo periodo vacacional</div><div class="v ${prox ? '' : 'mut'}" style="${prox ? 'font-size:14px' : ''}">${prox ? C.fmt(prox.inicio) + ' – ' + C.fmt(prox.fin) : SI}</div></div></div>
            <h2>Línea de tiempo de vacaciones</h2>${tlHTML(r, { lanes: ['vac'], fijo: 'historico', id: 'vac' })}
            <h2 style="margin-top:14px">Periodos vacacionales</h2>
            ${tabla(['Periodo', 'Asignados', 'Tomados', 'Pendientes', 'Fecha límite', 'Estado'], va.periodos.map(p => [e(p.periodo), p.asignados, p.tomados, p.pendientes, p.limite !== null ? C.fmt(p.limite) : mut(), e(p.estado)]))}
            <h2 style="margin-top:14px">Historial de goce</h2>
            ${tabla(['Inicio', 'Fin', 'Días', 'Periodo', 'Estado'], tr.map(v => [C.fmt(v.inicio), C.fmt(v.fin), v.dias, e(v.periodo), estBadge(v.inicio > t ? 'Programado' : (v.fin < t ? 'Histórico' : 'Vigente'))]))}</div>`;
    }

    // ---------- ausencias ----------
    function tabAusencias(r, I) {
        const au = C.ausencias(r), f = au.filter(a => enRango(a.inicio, a.fin));
        const tipos = ['Descanso médico', 'Permiso', 'Licencia', 'Vacaciones', 'Descanso compensatorio'];
        const resumen = tipos.map(tp => { const x = au.filter(a => a.tipo === tp && a.estado !== 'Programado'); return [tp, x.length, x.reduce((s, a) => s + (a.dias || 0), 0), C.fmtHoras(x.reduce((s, a) => s + (a.horas || 0), 0))]; });
        const sust = s => s === 'SUSTENTADO' ? `<span class="inf-estado ok">SUSTENTADO</span>` : (s === 'PENDIENTE DE SUSTENTO' ? `<span class="inf-estado warn">PENDIENTE DE SUSTENTO</span>` : mut(s));
        const filas = f.map(a => [e(a.tipo), C.fmt(a.inicio), C.fmt(a.fin), a.dias ? a.dias : (a.horas ? e(C.fmtHoras(a.horas)) : '—'), estBadge(a.estado), sust(a.sustento), a.medico ? 'Descanso médico registrado' : val(a.obs)]);
        return `<div class="inf-card"><h2>Descansos médicos y ausencias</h2>
            <div class="inf-info" style="margin-bottom:10px"><i class="fas fa-circle-info"></i> El sistema aún no tiene un registro propio de descansos médicos: se toman de los permisos de clase <b>Enfermedad</b> (solo se muestra «Descanso médico registrado», sin detalle médico). El sustento solo existe en Licencias (campo de anexos).</div>
            <p class="inf-sub" style="margin:0 0 6px">Resumen de lo ya ocurrido o en curso (no incluye ausencias programadas a futuro).</p>${tabla(['Tipo de ausencia', 'Registros', 'Días', 'Horas'], resumen.map(x => x.map(e)))}
            <h2 style="margin-top:14px">Detalle</h2>
            ${tabla(['Tipo', 'Fecha inicio', 'Fecha final', 'Días / horas', 'Estado', 'Sustento', 'Observaciones administrativas'], filas)}</div>`;
    }

    function tabAsistencia() {
        return `<div class="inf-card"><h2>Asistencia</h2><div class="inf-info"><i class="fas fa-circle-info"></i> El sistema no almacena marcaciones de asistencia. Cuando exista esa fuente de datos, aquí se contarán incidencias, omisiones de marcación, tardanzas, salidas anticipadas y jornadas incompletas.</div>
            ${tabla(['Concepto', 'Cantidad'], ['Incidencias', 'Omisiones de marcación', 'Tardanzas', 'Salidas anticipadas', 'Jornadas incompletas'].map(x => [x, mut()]))}</div>`;
    }

    // ---------- línea de tiempo ----------
    function ventana(esc, ref, items) {
        const o = C.ymd(ref);
        if (esc === 'mensual') return [C.mk(o.y, o.m, 1), C.mk(o.y, o.m + 1, 1) - 1];
        if (esc === 'trimestral') { const q = Math.floor((o.m - 1) / 3) * 3 + 1; return [C.mk(o.y, q, 1), C.mk(o.y, q + 3, 1) - 1]; }
        if (esc === 'semestral') { const q = o.m <= 6 ? 1 : 7; return [C.mk(o.y, q, 1), C.mk(o.y, q + 6, 1) - 1]; }
        if (esc === 'anual') return [C.mk(o.y, 1, 1), C.mk(o.y, 12, 31)];
        const t = C.hoy();
        if (!items.length) return [t - 30, t];
        return [Math.min(...items.map(x => x.ini)), Math.max(t, ...items.map(x => x.fin ?? x.ini))];
    }
    function tlHTML(r, opt) {
        opt = opt || {};
        const esc = opt.fijo || F.tl.escala, t = C.hoy();
        const lanes = LANES.filter(l => !opt.lanes || opt.lanes.includes(l[0]));
        const items = eventos(r).filter(x => lanes.some(l => l[0] === x.lane));
        const [w0, w1] = ventana(esc, F.tl.ref, items), span = w1 - w0 + 1;
        const pct = d => (d - w0) / span * 100;
        // marcas del eje
        let ticks = '';
        if (span <= 45) for (let d = w0; d <= w1; d += 5) ticks += `<div class="inf-tl-tick" style="left:${pct(d)}%">${C.ymd(d).d}</div>`;
        else if (span <= 800) { let o = C.ymd(w0), d = C.mk(o.y, o.m, 1); if (d < w0) d = C.mk(o.y, o.m + 1, 1); const sw = span > 400 ? 3 : 1; let k = 0; for (; d <= w1; d = C.mk(C.ymd(d).y, C.ymd(d).m + 1, 1), k++) if (k % sw === 0) ticks += `<div class="inf-tl-tick" style="left:${pct(d)}%">${C.MESES[C.ymd(d).m - 1].slice(0, 3)} ${String(C.ymd(d).y).slice(2)}</div>`; }
        else { for (let y = C.ymd(w0).y + 1; C.mk(y, 1, 1) <= w1; y++) ticks += `<div class="inf-tl-tick" style="left:${pct(C.mk(y, 1, 1))}%">${y}</div>`; ticks += `<div class="inf-tl-tick" style="left:0">${C.ymd(w0).y}</div>`; }
        const filas = lanes.map(([id, nm]) => {
            const cont = items.filter(x => x.lane === id).map(x => {
                const a = x.ini, b = x.abierto ? Math.max(w1, t) : (x.fin ?? x.ini);
                if (b < w0 || a > w1) return '';
                if (x.kind === 'punto') return `<button class="inf-pt" style="left:${pct(a)}%;color:${x.color}" title="${e(x.titulo)} ${C.fmt(a)}" onclick="Informes.pop(${reg(x)})">▲</button>`;
                const l = Math.max(a, w0), rr = Math.min(b, w1);
                return `<button class="inf-bar ${x.kind === 'sin' ? 'sin' : (x.kind === 'previo' ? 'previo' : '')}" style="left:${pct(l)}%;width:${(rr - l + 1) / span * 100}%;background:${x.color}" title="${e(x.titulo)}" onclick="Informes.pop(${reg(x)})">${e(x.label || '')}</button>`;
            }).join('');
            return `<div class="inf-tl-lane"><div class="nm">${nm}</div>${cont}</div>`;
        }).join('');
        const hoyX = t >= w0 && t <= w1 ? `<div class="inf-hoy" style="left:calc(120px + (100% - 120px) * ${pct(t) / 100})" title="Hoy"></div>` : '';
        const titulo = esc === 'historico' ? 'Histórico completo (' + C.fmt(w0) + ' – ' + C.fmt(w1) + ')' : (esc === 'mensual' ? C.MESES[C.ymd(w0).m - 1] + ' ' + C.ymd(w0).y : C.fmt(w0) + ' – ' + C.fmt(w1));
        const nav = opt.fijo ? '' : `<div class="inf-tl-nav"><div class="inf-seg">${['mensual', 'trimestral', 'semestral', 'anual', 'historico'].map(k => `<button class="${k === esc ? 'act' : ''}" onclick="Informes.tl('${k}')">${{ mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', historico: 'Histórico completo' }[k]}</button>`).join('')}</div>
            ${esc !== 'historico' ? `<button class="inf-chip" onclick="Informes.tlNav(-1)"><i class="fas fa-chevron-left"></i></button><button class="inf-chip" onclick="Informes.tlNav(0)">Hoy</button><button class="inf-chip" onclick="Informes.tlNav(1)"><i class="fas fa-chevron-right"></i></button>` : ''}<b>${e(titulo)}</b></div>`;
        const vacio = !items.length ? `<div class="inf-vacio">${SI}</div>` : '';
        return `${nav}<div class="inf-tl"><div class="inf-tl-in" style="position:relative"><div class="inf-tl-axis">${ticks}</div>${filas}${hoyX}</div></div>${vacio}
            ${opt.lanes ? '' : `<div class="inf-leyenda"><span><i style="background:${COL.contrato}"></i>Contrato</span><span><i style="background:${COL.sin}"></i>Sin contrato</span><span><i style="background:${COL.horario}"></i>Horario (cada barra = un cambio)</span><span><i style="background:${COL.vac}"></i>Vacaciones</span><span><i style="background:${COL.lic}"></i>Licencia</span><span>▲ Permiso / Descanso médico / Horas extras</span><span style="color:var(--sap-negative)">| Hoy</span></div>
            <p class="inf-sub">Cambios de cargo, cambios de laboratorio e incidencias de asistencia: ${SI} (el sistema no guarda su historial).</p>`}`;
    }
    function tabLinea(r) { return `<div class="inf-card"><h2>Línea de tiempo integral</h2>${tlHTML(r)}</div>`; }

    // ---------- popup ----------
    function pop(i) {
        const x = F.pop[i]; if (!x) return;
        const bg = document.createElement('div'); bg.className = 'inf-pop-bg'; bg.id = 'infPop';
        bg.onclick = ev => { if (ev.target === bg) bg.remove(); };
        bg.innerHTML = `<div class="inf-pop"><h3 style="background:${x.color}">${e(x.titulo)}</h3><div class="bd">${x.lineas.map(([k, v]) => `<p><b>${e(k)}:</b> ${e(v === '' || v === null || v === undefined ? SI : v)}</p>`).join('')}</div>
            <div class="ft"><button class="btn btn-secondary" onclick="document.getElementById('infPop').remove()">Cerrar</button></div></div>`;
        document.body.appendChild(bg);
    }

    // ---------- pintar ----------
    function pintar() {
        const main = document.getElementById('mainContent'), d = window.InformesDatos.get(), R = rec();
        if (!R) { main.innerHTML = `<div class="inf-wrap">${window.InformesCabecera('Informes y Consultas', '')}<div class="inf-vacio">Trabajador no encontrado.</div></div>`; return; }
        F.pop = [];
        const s = C.situacion(R), I = C.indicadores(R);
        const alertas = s.alertas.length ? `<div class="inf-alertas">${s.alertas.map(a => `<span class="inf-alerta ${a.nivel}">${a.icono} ${e(a.texto)}</span>`).join('')}</div>` : `<span class="inf-sub">Sin alertas a la fecha (${C.fmt(C.hoy())}).</span>`;
        const cuerpo = { resumen: () => `<div class="inf-card"><h2>Consultas de gestión e indicadores</h2>${qa(R, I, s)}</div>`, contratos: () => tabContratos(R, I), horarios: () => tabHorarios(R, I),
            extras: () => tabExtras(R, I), permisos: () => tabPermisos(R, I), vacaciones: () => tabVacaciones(R, I), ausencias: () => tabAusencias(R, I), asistencia: tabAsistencia, linea: () => tabLinea(R) }[S.tab]();
        main.innerHTML = `<div class="inf-wrap">${window.InformesCabecera('Ficha integral del personal', 'Situación laboral e histórica al ' + C.fmt(C.hoy()))}
            ${cabecera(R, s)}
            <div class="inf-card"><h2>Alertas</h2>${alertas}</div>
            ${kpis(R, I)}
            <div class="inf-btn-row"><button class="btn btn-primary" onclick="Informes.exp('pdf')"><i class="fas fa-file-pdf"></i> Ficha consolidada (PDF)</button>
                <button class="btn btn-secondary" onclick="Informes.exp('xlsx')"><i class="fas fa-file-excel"></i> Excel</button><button class="btn btn-secondary" onclick="Informes.exp('csv')"><i class="fas fa-file-csv"></i> CSV</button></div>
            ${['extras', 'permisos', 'vacaciones', 'ausencias'].includes(S.tab) ? filtros(R) : ''}
            <div class="inf-tabs">${TABS.map(([k, l]) => `<button class="inf-tab ${k === S.tab ? 'act' : ''}" onclick="Informes.tab('${k}')">${l}</button>`).join('')}</div>
            ${cuerpo}</div>`;
    }

    // ---------- acciones ----------
    Object.assign(window.Informes, {
        tab(k) { S.tab = k; pintar(); },
        pop,
        fil(k, v) { if (k === 'limpiar') F.fil = { anio: '', mes: '', desde: '', hasta: '' }; else { F.fil[k] = v; if (k === 'desde' || k === 'hasta') { F.fil.anio = ''; F.fil.mes = ''; } } pintar(); },
        orden(v) { F.orden = v; pintar(); },
        fechaH(v) { F.fechaH = v; const el = document.getElementById('infHVRes'); if (el && S.tab === 'horarios') el.innerHTML = hvTexto(rec(), C.parse(v) ?? C.hoy()); else pintar(); },
        tl(k) { F.tl.escala = k; pintar(); },
        tlNav(dir) { const mm = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 }[F.tl.escala]; if (dir === 0) F.tl.ref = C.hoy(); else { const o = C.ymd(F.tl.ref); F.tl.ref = C.mk(o.y, o.m + dir * mm, 1); } pintar(); },
        cal(dir) { if (dir === 0) { const o = C.ymd(C.hoy()); F.cal = { y: o.y, m: o.m }; } else { const d = C.mk(F.cal.y, F.cal.m + dir, 1), o = C.ymd(d); F.cal = { y: o.y, m: o.m }; } pintar(); },
        exp(fmt) { window.InformesExport.ficha(rec(), fmt); }
    });
    window.InformesFicha = { pintar, reset, eventos, rango, enRango };
})();

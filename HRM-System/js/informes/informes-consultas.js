// ============================================================
// INFORMES-CONSULTAS.JS — Pantalla principal: buscador, consultas
// rápidas y filtros. La ficha integral vive en informes-ficha.js.
// ============================================================
(function () {
    const C = window.InformesCalc;
    const e = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

    const S = window.InformesEstado = {
        vista: 'inicio', consulta: null, code: null, tab: 'resumen',
        filtros: { lab: '', area: '', cargo: '', contrato: '', turno: '', estado: '', desde: '', hasta: '' },
        sug: [], sugIdx: -1, memo: {}, memoTs: 0
    };
    window.InformesUtil = { e };

    // ---------- memo de situación por persona ----------
    function sit(rec) {
        const d = window.InformesDatos.get();
        if (S.memoTs !== d.ts) { S.memo = {}; S.memoTs = d.ts; }
        const k = String(rec.p.CODE);
        return S.memo[k] || (S.memo[k] = C.situacion(rec));
    }
    window.InformesSit = sit;

    // ---------- consultas rápidas ----------
    function rangoExtras(rec) {
        const a = C.parse(S.filtros.desde), b = C.parse(S.filtros.hasta);
        return C.extras(rec).filter(f => (a === null || f.fecha >= a) && (b === null || f.fecha <= b));
    }
    const CONSULTAS = [
        { id: 'activo', t: 'Personal activo', i: 'fa-user-check', c: '#107E3E', todos: true,
          fn: (r, s) => s.activo ? s.estado : null },
        { id: 'porVencer', t: 'Contrato próximo a vencer', i: 'fa-file-circle-exclamation', c: '#BB0000',
          fn: (r, s) => s.porVencer === null ? null : 'Vence el ' + C.fmt(s.contrato.fin) + (s.porVencer === 0 ? ' (hoy)' : ' (en ' + s.porVencer + ' días)') },
        { id: 'vacaciones', t: 'Actualmente de vacaciones', i: 'fa-umbrella-beach', c: '#107E3E',
          fn: (r, s) => s.vacHoy ? C.fmt(s.vacHoy.inicio) + ' – ' + C.fmt(s.vacHoy.fin) : null },
        { id: 'permiso', t: 'Permiso vigente', i: 'fa-door-open', c: '#0A6ED1',
          fn: (r, s) => s.permHoy ? 'Hoy' + (s.permHoy.horario ? ' ' + s.permHoy.horario : '') : null },
        { id: 'medico', t: 'Descanso médico vigente', i: 'fa-notes-medical', c: '#7B3FA0',
          fn: (r, s) => s.medHoy ? 'Descanso médico registrado' : null },
        { id: 'noLabora', t: 'Actualmente no está laborando', i: 'fa-user-clock', c: '#E9730C',
          fn: (r, s) => s.noLabora ? s.estado + (s.retorno ? ' · retorno ' + C.fmt(s.retorno) : '') : null },
        { id: 'extras', t: 'Personal con horas extras', i: 'fa-business-time', c: '#E9730C',
          fn: r => { const x = rangoExtras(r).filter(f => f.estado === 'Aprobado'); const h = x.reduce((a, f) => a + f.horas, 0); return x.length ? C.fmtHoras(h) + ' en ' + x.length + ' registro(s)' : null; } },
        { id: 'incidencias', t: 'Personal con incidencias', i: 'fa-triangle-exclamation', c: '#6A6D70', sinDatos: true,
          fn: () => null },
        { id: 'cambioHorario', t: 'Cambios recientes de horario', i: 'fa-clock-rotate-left', c: '#354A5F',
          fn: (r, s) => s.cambioReciente ? 'Nuevo horario desde ' + C.fmt(s.cambioReciente.ini) : null },
        { id: 'pendientes', t: 'Registros pendientes', i: 'fa-hourglass-half', c: '#A65000',
          fn: (r, s) => { const p = []; if (s.pendAprob.length) p.push(s.pendAprob.length + ' hora(s) extra por aprobar'); if (s.pendSust.length) p.push(s.pendSust.length + ' licencia(s) sin sustento'); return p.length ? p.join(' · ') : null; } },
        { id: 'reincorporado', t: 'Reincorporado recientemente', i: 'fa-person-walking-arrow-right', c: '#0854A0',
          fn: (r, s) => s.reciente ? 'Retornó el ' + C.fmt(s.reciente.fin + 1) + ' (' + s.reciente.tipo.toLowerCase() + ')' : null }
    ];

    // ---------- población con filtros ----------
    function labs(p) { return String(p.LUGAR_TRABAJO || '').split(',').map(x => x.trim()).filter(Boolean); }
    function poblacion() {
        const d = window.InformesDatos.get(), f = S.filtros;
        return d.personal.map(p => d.porCode[String(p.CODE)]).filter(rec => {
            const p = rec.p, s = sit(rec);
            if (f.lab && !labs(p).includes(f.lab)) return false;
            if (f.area && (p.PROGRAMA || '') !== f.area) return false;
            if (f.cargo && (p.CARGO || '') !== f.cargo) return false;
            if (f.contrato && (p.TIPO_CONTRATO || '') !== f.contrato) return false;
            if (f.estado && s.estado !== f.estado) return false;
            if (f.turno && (s.hv ? C.turnoDe(s.hv.g) : '') !== f.turno) return false;
            return true;
        });
    }
    function ejecutar(q) {
        const out = [];
        poblacion().forEach(rec => {
            const s = sit(rec);
            if (!q.todos && !s.activo) return;
            const det = q.fn(rec, s);
            if (det) out.push({ rec, det });
        });
        out.sort((a, b) => C.nombreInv(a.rec.p).localeCompare(C.nombreInv(b.rec.p), 'es'));
        return out;
    }
    window.InformesConsulta = { ejecutar, CONSULTAS, poblacion };

    function opciones(campo, fnVals) {
        const set = new Set();
        window.InformesDatos.get().personal.forEach(p => (fnVals ? fnVals(p) : [p[campo]]).forEach(v => { if (v) set.add(String(v).trim()); }));
        return [...set].sort((a, b) => a.localeCompare(b, 'es'));
    }
    const sel = (id, lbl, vals, cur) => `<div><label>${lbl}</label><select id="${id}" onchange="Informes.setFiltro('${id.replace('f_', '')}',this.value)">
        <option value="">Todos</option>${vals.map(v => `<option value="${e(v)}" ${v === cur ? 'selected' : ''}>${e(v)}</option>`).join('')}</select></div>`;

    // ---------- pantallas ----------
    function cabecera(titulo, sub) {
        return `<div class="inf-top"><h1>${titulo}<small>${sub || ''}</small></h1>
            <div class="inf-search"><i class="fas fa-search"></i>
                <input id="infBuscar" type="text" autocomplete="off" placeholder="Buscar trabajador: nombre, apellidos, DNI, código o ID_PERSONAL…"
                    oninput="Informes.buscar(this.value)" onkeydown="Informes.tecla(event)" onblur="setTimeout(()=>Informes.cerrarSug(),180)">
                <div id="infSug" class="inf-sug" style="display:none"></div></div>
            <div class="inf-btn-row">
                ${S.vista !== 'inicio' ? `<button class="btn btn-secondary" onclick="Informes.inicio()"><i class="fas fa-house"></i> Consultas rápidas</button>` : ''}
                <button class="btn btn-secondary" onclick="Informes.refrescar()" title="Volver a leer los datos del servidor"><i class="fas fa-sync-alt"></i></button></div></div>`;
    }
    window.InformesCabecera = cabecera;

    function avisosAcceso() {
        const f = window.InformesDatos.get().fuentes, nombres = { horarios: 'Horarios', permisos: 'Permisos', vacaciones: 'Vacaciones', licencias: 'Licencias', descansosMedicos: 'Descanso médico', sobretiempo: 'Sobretiempo', descansos: 'Descansos compensatorios' };
        const sin = Object.keys(f).filter(k => !f[k].acceso).map(k => nombres[k]);
        const err = Object.keys(f).filter(k => f[k].acceso && !f[k].ok).map(k => nombres[k] + ' (' + (f[k].error || 'error') + ')');
        let h = '';
        if (sin.length) h += `<div class="inf-aviso"><i class="fas fa-lock"></i> Sin permiso para ver: ${sin.join(', ')}. Esas secciones se mostrarán como «Sin información registrada».</div>`;
        if (err.length) h += `<div class="inf-aviso"><i class="fas fa-triangle-exclamation"></i> No se pudo leer: ${err.join(', ')}.</div>`;
        return h;
    }

    function pintarInicio() {
        const main = document.getElementById('mainContent'), d = window.InformesDatos.get(), f = S.filtros;
        const pob = poblacion();
        const tiles = CONSULTAS.map(q => {
            const n = q.sinDatos ? '—' : pob.filter(rec => { const s = sit(rec); return (q.todos || s.activo) && q.fn(rec, s); }).length;
            return `<button class="inf-tile ${q.sinDatos ? 'off' : ''}" style="--t:${q.c}" onclick="Informes.consulta('${q.id}')">
                <i class="fas ${q.i}"></i><span class="l">${q.t}</span><span class="n">${n}</span></button>`;
        }).join('');
        const turnos = ['Mañana', 'Tarde', 'Jornada completa'];
        const estados = ['Activo', 'De vacaciones', 'Con licencia', 'Sin contrato vigente', 'Contrato por iniciar', 'Inactivo'];
        main.innerHTML = `<div class="inf-wrap">
            ${cabecera('Informes y Consultas Consolidadas de Personal', 'Seleccione un trabajador o use una consulta rápida')}
            ${avisosAcceso()}
            <div class="inf-card"><h2>Consultas rápidas</h2><div class="inf-tiles">${tiles}</div>
                <p class="inf-sub" style="margin:8px 0 0">Se calculan con los registros reales a hoy (${C.fmt(C.hoy())}). Contrato próximo a vencer = dentro de ${C.DIAS_POR_VENCER} días · recientes = últimos ${C.DIAS_RECIENTE} días.
                ${pob.length !== d.personal.length ? ` Filtros activos: ${pob.length} de ${d.personal.length} trabajadores.` : ''}</p></div>
            <div class="inf-card"><h2>Filtros</h2><div class="inf-filtros">
                ${sel('f_lab', 'Laboratorio', opciones('', p => labs(p)), f.lab)}
                ${sel('f_area', 'Área / programa', opciones('PROGRAMA'), f.area)}
                ${sel('f_cargo', 'Cargo', opciones('CARGO'), f.cargo)}
                ${sel('f_contrato', 'Tipo de contrato / vinculación', opciones('TIPO_CONTRATO'), f.contrato)}
                ${sel('f_turno', 'Turno (según horario vigente)', turnos, f.turno)}
                ${sel('f_estado', 'Estado actual', estados, f.estado)}
                <div><label>Horas extras desde</label><input type="date" value="${e(f.desde)}" onchange="Informes.setFiltro('desde',this.value)"></div>
                <div><label>Horas extras hasta</label><input type="date" value="${e(f.hasta)}" onchange="Informes.setFiltro('hasta',this.value)"></div>
                <div style="display:flex;align-items:flex-end"><button class="btn btn-secondary" onclick="Informes.limpiarFiltros()"><i class="fas fa-eraser"></i> Limpiar</button></div>
            </div></div></div>`;
    }

    function pintarConsulta() {
        const main = document.getElementById('mainContent'), q = CONSULTAS.find(x => x.id === S.consulta);
        const res = q.sinDatos ? [] : ejecutar(q);
        const filas = res.map(r => {
            const p = r.rec.p, s = sit(r.rec);
            return `<tr class="clic" onclick="Informes.abrir('${e(p.CODE)}')"><td>${e(C.nombreInv(p))}</td><td>${e(p.CODE)}</td><td>${e(p.DNI || '—')}</td>
                <td>${e(p.CARGO || '—')}</td><td>${e(p.LUGAR_TRABAJO || '—')}</td><td>${e(s.estado)}</td><td>${e(r.det)}</td></tr>`;
        }).join('');
        main.innerHTML = `<div class="inf-wrap">${cabecera(`<i class="fas ${q.i}" style="color:${q.c}"></i> ${q.t}`, res.length + ' trabajador(es) · ' + C.fmt(C.hoy()))}
            ${avisosAcceso()}
            ${q.sinDatos ? `<div class="inf-info"><i class="fas fa-circle-info"></i> El sistema no almacena marcaciones de asistencia (tardanzas, omisiones, salidas anticipadas o jornadas incompletas), por lo que no hay registros para esta consulta. Se mostrará automáticamente cuando exista esa fuente de datos.</div>` : ''}
            <div class="inf-card"><div class="inf-btn-row" style="margin-bottom:8px">
                <button class="btn btn-secondary" onclick="Informes.exportarConsulta('xlsx')" ${res.length ? '' : 'disabled'}><i class="fas fa-file-excel"></i> Excel</button>
                <button class="btn btn-secondary" onclick="Informes.exportarConsulta('csv')" ${res.length ? '' : 'disabled'}><i class="fas fa-file-csv"></i> CSV</button>
                <span class="inf-sub">Clic en una fila para abrir la ficha integral.</span></div>
            <div class="inf-tbl-wrap">${res.length ? `<table class="inf-tbl"><thead><tr><th>Trabajador</th><th>Código</th><th>DNI</th><th>Cargo</th><th>Laboratorio</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>${filas}</tbody></table>`
                : `<div class="inf-vacio">${q.sinDatos ? 'Sin información registrada' : 'Ningún trabajador cumple esta consulta con los filtros actuales.'}</div>`}</div></div></div>`;
    }

    // ---------- API pública ----------
    async function render() {
        const main = document.getElementById('mainContent');
        if (!main) return;
        if (!window.InformesDatos.get()) {
            main.innerHTML = `<div class="loading"><div class="spinner"></div><p>Consolidando información del personal…</p></div>`;
            await window.InformesDatos.cargar(false);
        }
        if (window.Router.getVistaActual() !== 'informes') return; // el usuario ya cambió de vista
        if (S.vista === 'ficha') window.InformesFicha.pintar();
        else if (S.vista === 'consulta') pintarConsulta();
        else pintarInicio();
    }

    window.Informes = {
        render,
        inicio() { S.vista = 'inicio'; S.consulta = null; S.code = null; render(); },
        consulta(id) { S.vista = 'consulta'; S.consulta = id; render(); },
        abrir(code, tab) { S.vista = 'ficha'; S.code = String(code); S.tab = tab || 'resumen'; window.InformesFicha.reset(); render(); window.scrollTo(0, 0); },
        setFiltro(k, v) { S.filtros[k] = v; render(); },
        limpiarFiltros() { Object.keys(S.filtros).forEach(k => S.filtros[k] = ''); render(); },
        async refrescar() { window.InformesDatos.invalidar(); S.memo = {}; window.toast('🔄 Actualizando…', 'success'); const m = document.getElementById('mainContent'); m.innerHTML = '<div class="loading"><div class="spinner"></div><p>Actualizando datos…</p></div>'; await window.InformesDatos.cargar(true); render(); },
        // --- buscador con autocompletado ---
        buscar(txt) {
            const d = window.InformesDatos.get(); if (!d) return;
            const toks = C.norm(txt).split(/\s+/).filter(Boolean);
            if (!toks.length) { S.sug = []; return Informes.cerrarSug(); }
            S.sug = d.personal.filter(p => {
                const hay = C.norm([C.nombre(p), C.nombreInv(p), p.DNI, p.CODE, p.ID_PERSONAL].join(' '));
                return toks.every(t => hay.includes(t));
            }).slice(0, 12);
            S.sugIdx = S.sug.length ? 0 : -1;
            pintarSug();
        },
        cerrarSug() { const b = document.getElementById('infSug'); if (b) b.style.display = 'none'; },
        tecla(ev) {
            if (ev.key === 'ArrowDown') { ev.preventDefault(); S.sugIdx = Math.min(S.sugIdx + 1, S.sug.length - 1); pintarSug(); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); S.sugIdx = Math.max(S.sugIdx - 1, 0); pintarSug(); }
            else if (ev.key === 'Enter' && S.sug[S.sugIdx]) { ev.preventDefault(); Informes.abrir(S.sug[S.sugIdx].CODE); }
            else if (ev.key === 'Escape') Informes.cerrarSug();
        },
        exportarConsulta(fmt) { window.InformesExport.consulta(fmt); }
    };

    function pintarSug() {
        const b = document.getElementById('infSug'); if (!b) return;
        const inp = document.getElementById('infBuscar');
        b.style.display = 'block';
        b.innerHTML = S.sug.length ? S.sug.map((p, i) => `<div class="inf-sug-item ${i === S.sugIdx ? 'sel' : ''}" onmousedown="Informes.abrir('${e(p.CODE)}')">
            <div><b>${e(C.nombreInv(p))}</b><br><span>Cód. ${e(p.CODE)} · DNI ${e(p.DNI || '—')} · ${e(p.CARGO || 'Sin cargo registrado')}</span></div></div>`).join('')
            : `<div class="inf-sug-empty">Sin resultados para «${e(inp ? inp.value : '')}»</div>`;
    }

    window.renderInformes = function () { return Informes.render(); };
})();

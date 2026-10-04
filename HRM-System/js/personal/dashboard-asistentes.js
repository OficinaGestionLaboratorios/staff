// ============================================================
// DASHBOARD-ASISTENTES.JS — Línea de tiempo de asistentes por día
// ============================================================
// Reemplaza la lista simple de "Asisten" por un gráfico de barras
// (una fila por persona, eje horario 06:45–21:45) que responde:
//   • ¿Cuántos/quiénes están a una hora exacta? (ej. 15:15, 21:00)
//   • ¿Quiénes están en un rango? (ej. 06:45 a 10:00)
//       - "En algún momento": tocan el rango aunque sea un rato.
//       - "Todo el rango": están presentes de principio a fin.
// Fuente de datos: BD_HORARIOS vía HorarioAPI.listar() (igual que
// antes). Para cada persona se usa SOLO su horario más reciente
// vigente en la fecha elegida, y solo si ese horario trabaja ese día.
// ============================================================

(function () {
    const AXIS_MIN_DEF = 6 * 60 + 45;   // 06:45
    const AXIS_MAX_DEF = 21 * 60 + 45;  // 21:45
    const PASO = 15;                    // snap de clic en el gráfico (min)
    const DIAS_JS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const TABS = [
        { dia: 'Lunes', corto: 'Lun' }, { dia: 'Martes', corto: 'Mar' },
        { dia: 'Miércoles', corto: 'Mié' }, { dia: 'Jueves', corto: 'Jue' },
        { dia: 'Viernes', corto: 'Vie' }, { dia: 'Sábado', corto: 'Sáb' }
    ];

    // Estado de la consulta (se conserva mientras se cambia de día).
    const S = window._asist = window._asist || {
        modo: 'hora',          // 'hora' | 'rango'
        hora: null,            // minutos
        desde: AXIS_MIN_DEF,
        hasta: 10 * 60,
        tipo: 'algun',         // 'algun' | 'todo'
        excluirRef: false,
        buscar: '',            // texto del buscador por personal
        personas: [],          // [{nombre, ini, fin, ref, segs}]
        axisMin: AXIS_MIN_DEF,
        axisMax: AXIS_MAX_DEF,
        listo: false
    };

    const toMin = h => window.HorarioModel.horaAMinutos(h);
    const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const $ = id => document.getElementById(id);

    // Normaliza (minúsculas, sin tildes) para buscar sin importar acentos.
    const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    // Cada palabra escrita debe aparecer en: ID, ape. paterno, ape. materno o nombres.
    function pasaBusqueda(p) {
        const q = norm(S.buscar);
        if (!q) return true;
        return q.split(/\s+/).every(w => p.busq.includes(w));
    }
    const visibles = () => S.personas.filter(pasaBusqueda);

    // ---------- Cálculo de presencia ----------
    function presenteEn(p, t) { return p.segs.some(([a, b]) => a <= t && t < b); }
    function tocaRango(p, a, b) { return p.segs.some(([s, e]) => s < b && e > a); }
    function cubreRango(p, a, b) { return p.segs.some(([s, e]) => s <= a && e >= b); }

    function coincidentes() {
        if (S.modo === 'hora') return visibles().filter(p => presenteEn(p, S.hora));
        const a = Math.min(S.desde, S.hasta), b = Math.max(S.desde, S.hasta);
        return visibles().filter(p => S.tipo === 'todo' ? cubreRango(p, a, b) : tocaRango(p, a, b));
    }

    function armarSegmentos(p) {
        if (S.excluirRef && p.ref) {
            return [[p.ini, p.ref[0]], [p.ref[1], p.fin]].filter(([a, b]) => b > a);
        }
        return [[p.ini, p.fin]];
    }

    // ---------- Carga de datos del día ----------
    async function cargarPersonas() {
        const fechaISO = $('asistenFechaSel').value;
        const [y, m, d] = fechaISO.split('-').map(Number);
        const diaSel = DIAS_JS[new Date(y, (m || 1) - 1, d || 1).getDay()];
        const activos = window._dashPersonalActivo || [];
        const codes = new Set(activos.map(p => p.CODE));
        const porCode = {};
        activos.forEach(p => { porCode[p.CODE] = p; });

        const result = await window.HorarioAPI.listar();
        const grupos = (result && result.success && Array.isArray(result.data)) ? result.data : [];

        // Vigentes por rango de fechas; luego el más reciente por persona;
        // recién entonces se mira si trabaja ese día (ver comentario original).
        const porEmp = {};
        grupos.forEach(g => {
            if (g.CODE && !codes.has(g.CODE)) return;
            const ini = String(g.FECHA_INICIO || '').slice(0, 10);
            const fin = String(g.FECHA_FIN || '').slice(0, 10);
            if (!ini || ini > fechaISO) return;
            if (fin && fin < fechaISO) return;
            const k = g.CODE || g.ID_PERSONAL || g.EMPLEADO;
            if (!k) return;
            (porEmp[k] = porEmp[k] || []).push(g);
        });

        const lista = [];
        Object.entries(porEmp).forEach(([k, gs]) => {
            const g = window.HorarioModel.ordenarGruposPorFechaInicio(gs, 'desc')[0];
            const de = (g.DIAS || []).find(x => x.dia === diaSel);
            if (!de) return;
            const ini = toMin(de.ingreso), fin = toMin(de.salida);
            if (ini === null || fin === null || fin <= ini) return;
            const ri = toMin(de.inicioRef), rf = toMin(de.finRef);
            const per = porCode[g.CODE] || {};
            const idp = per.ID_PERSONAL || g.ID_PERSONAL || '';
            lista.push({
                nombre: g.EMPLEADO || k,
                busq: norm([idp, per.APE_PATERNO, per.APE_MATERNO, per.NOMBRES, g.EMPLEADO].filter(Boolean).join(' ')),
                ingreso: de.ingreso, salida: de.salida,
                ini, fin,
                ref: (ri !== null && rf !== null && rf > ri) ? [ri, rf] : null
            });
        });
        lista.sort((a, b) => a.ini - b.ini || a.nombre.localeCompare(b.nombre));
        return { lista, diaSel };
    }

    // ---------- Render ----------
    function rangoEje() {
        let mn = AXIS_MIN_DEF, mx = AXIS_MAX_DEF;
        S.personas.forEach(p => {
            mn = Math.min(mn, Math.floor(p.ini / PASO) * PASO);
            mx = Math.max(mx, Math.ceil(p.fin / PASO) * PASO);
        });
        S.axisMin = mn; S.axisMax = mx;
    }
    const pct = m => ((m - S.axisMin) / (S.axisMax - S.axisMin)) * 100;

    function render() {
        const cont = $('asistTimeline');
        if (!cont) return;
        S.personas.forEach(p => { p.segs = armarSegmentos(p); });
        const hits = new Set(coincidentes().map(p => p));

        // Marcas horarias
        let marcas = '';
        const primera = Math.ceil(S.axisMin / 60) * 60;
        for (let t = primera; t <= S.axisMax; t += 60) {
            marcas += `<div class="asist-tick" style="left:${pct(t)}%"><span>${String(t / 60).padStart(2, '0')}:00</span></div>`;
        }
        const lineasGrid = marcas.replace(/<span>.*?<\/span>/g, '');

        // Cursor / banda de consulta
        let cursor = '';
        if (S.modo === 'hora') {
            cursor = `<div class="asist-cursor" style="left:${pct(S.hora)}%"><b>${hhmm(S.hora)}</b></div>`;
        } else {
            const a = Math.min(S.desde, S.hasta), b = Math.max(S.desde, S.hasta);
            cursor = `<div class="asist-banda" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%"><b>${hhmm(a)}–${hhmm(b)}</b></div>`;
        }

        // Filas
        const filas = visibles().map(p => {
            const on = hits.has(p);
            const clase = p.ini < 14 * 60 ? 'manana' : 'tarde';
            let barra = `<div class="asist-barra ${clase}" style="left:${pct(p.ini)}%;width:${pct(p.fin) - pct(p.ini)}%" title="${window.esc(p.nombre)}: ${p.ingreso} – ${p.salida}${p.ref ? ' (refrigerio ' + hhmm(p.ref[0]) + '–' + hhmm(p.ref[1]) + ')' : ''}"><span>${p.ingreso} – ${p.salida}</span></div>`;
            if (p.ref) {
                barra += `<div class="asist-ref" style="left:${pct(p.ref[0])}%;width:${pct(p.ref[1]) - pct(p.ref[0])}%" title="Refrigerio ${hhmm(p.ref[0])}–${hhmm(p.ref[1])}"></div>`;
            }
            return `<div class="asist-fila${on ? ' on' : ' off'}"><div class="asist-nombre" title="${window.esc(p.nombre)}">${window.esc(p.nombre)}</div><div class="asist-track">${barra}</div></div>`;
        }).join('');

        cont.innerHTML = `
          <div class="asist-scroll"><div class="asist-inner">
            <div class="asist-head asist-axis-row">
              <div class="asist-nombre"></div>
              <div class="asist-track asist-axis">${marcas}</div>
            </div>
            <div class="asist-body">
              <div class="asist-overlay"><div class="asist-nombre"></div><div class="asist-track" id="asistOverlayTrack">${lineasGrid}${cursor}</div></div>
              ${filas || (S.buscar.trim() ? '<div class="asist-vacio">Ninguna persona coincide con la búsqueda.</div>' : '<div class="asist-vacio">Nadie tiene horario registrado para este día.</div>')}
            </div>
          </div></div>`;

        // Clic en el gráfico → fija la hora (modo hora) o mueve el extremo cercano (modo rango)
        cont.querySelectorAll('.asist-axis, .asist-body .asist-track, #asistOverlayTrack').forEach(tr => {
            tr.addEventListener('click', ev => {
                const r = tr.getBoundingClientRect();
                const frac = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
                let t = Math.round((S.axisMin + frac * (S.axisMax - S.axisMin)) / PASO) * PASO;
                t = Math.min(S.axisMax, Math.max(S.axisMin, t));
                if (S.modo === 'hora') S.hora = t;
                else {
                    const a = Math.min(S.desde, S.hasta), b = Math.max(S.desde, S.hasta);
                    if (Math.abs(t - a) <= Math.abs(t - b)) { S.desde = t; S.hasta = b; } else { S.desde = a; S.hasta = t; }
                }
                sincronizarInputs(); render();
            });
        });

        renderResultado(Array.from(hits));
    }

    function renderResultado(lista) {
        const num = $('asistenHoyCount'), txt = $('asistResumen');
        if (!num) return;
        num.textContent = lista.length;
        let frase;
        if (S.modo === 'hora') frase = `a las ${hhmm(S.hora)}`;
        else {
            const a = Math.min(S.desde, S.hasta), b = Math.max(S.desde, S.hasta);
            frase = S.tipo === 'todo' ? `durante todo el rango ${hhmm(a)} – ${hhmm(b)}` : `en algún momento entre las ${hhmm(a)} y las ${hhmm(b)}`;
        }
        txt.textContent = `${lista.length === 1 ? 'persona presente' : 'personas presentes'} ${frase}` + (S.excluirRef ? ' (sin contar refrigerio)' : '') + (S.buscar.trim() ? ` · filtrado: “${S.buscar.trim()}”` : '');
    }

    function sincronizarInputs() {
        const set = (id, v) => { const el = $(id); if (el) el.value = v; };
        set('asistHora', hhmm(S.hora)); set('asistDesde', hhmm(S.desde)); set('asistHasta', hhmm(S.hasta));
        $('asistModoHora')?.classList.toggle('on', S.modo === 'hora');
        $('asistModoRango')?.classList.toggle('on', S.modo === 'rango');
        $('asistPanelHora').style.display = S.modo === 'hora' ? '' : 'none';
        $('asistPanelRango').style.display = S.modo === 'rango' ? '' : 'none';
        $('asistTipoAlgun')?.classList.toggle('on', S.tipo === 'algun');
        $('asistTipoTodo')?.classList.toggle('on', S.tipo === 'todo');
        const fechaISO = $('asistenFechaSel').value;
        const [y, m, d] = fechaISO.split('-').map(Number);
        const dia = DIAS_JS[new Date(y, m - 1, d).getDay()];
        document.querySelectorAll('.asist-tab').forEach(b => b.classList.toggle('on', b.dataset.dia === dia));
    }

    // ---------- API pública (mismos nombres que usaba modal.js) ----------
    window.inicializarControlesAsistencia = function () {
        const f = $('asistenFechaSel');
        if (f && !f.value) f.value = iso(new Date());
        if (S.hora === null) {
            const ahora = new Date();
            const m = ahora.getHours() * 60 + ahora.getMinutes();
            S.hora = (m >= AXIS_MIN_DEF && m <= AXIS_MAX_DEF) ? Math.round(m / PASO) * PASO : 9 * 60;
        }
        const raiz = $('asistControlesNuevos');
        if (!raiz || raiz.dataset.listo) { sincronizarInputs(); return; }
        raiz.dataset.listo = '1';

        $('asistModoHora').onclick = () => { S.modo = 'hora'; sincronizarInputs(); render(); };
        $('asistModoRango').onclick = () => { S.modo = 'rango'; sincronizarInputs(); render(); };
        $('asistTipoAlgun').onclick = () => { S.tipo = 'algun'; sincronizarInputs(); render(); };
        $('asistTipoTodo').onclick = () => { S.tipo = 'todo'; sincronizarInputs(); render(); };
        const b = $('asistBuscar'), bx = $('asistBuscarLimpiar');
        const aplicarBusqueda = () => { S.buscar = b.value; bx.style.display = b.value ? '' : 'none'; render(); };
        b.addEventListener('input', aplicarBusqueda);
        bx.onclick = () => { b.value = ''; aplicarBusqueda(); b.focus(); };
        const leer = (id, key) => $(id).addEventListener('input', e => {
            const v = toMin(e.target.value);
            if (v !== null) { S[key] = v; render(); }
        });
        leer('asistHora', 'hora'); leer('asistDesde', 'desde'); leer('asistHasta', 'hasta');

        document.querySelectorAll('.asist-tab').forEach(btn => {
            btn.onclick = () => {
                const [y, m, d] = $('asistenFechaSel').value.split('-').map(Number);
                const base = new Date(y, m - 1, d);
                const objetivo = DIAS_JS.indexOf(btn.dataset.dia);
                const lunes = new Date(base); lunes.setDate(base.getDate() - ((base.getDay() + 6) % 7));
                lunes.setDate(lunes.getDate() + ((objetivo + 6) % 7));
                $('asistenFechaSel').value = iso(lunes);
                window.actualizarAsistenciaDia();
            };
        });
        const atajos = {
            asistAtajoManana: () => { S.modo = 'rango'; S.desde = AXIS_MIN_DEF; S.hasta = 14 * 60; },
            asistAtajoTarde: () => { S.modo = 'rango'; S.desde = 14 * 60; S.hasta = AXIS_MAX_DEF; }
        };
        Object.entries(atajos).forEach(([id, fn]) => { const el = $(id); if (el) el.onclick = () => { fn(); sincronizarInputs(); render(); }; });
        sincronizarInputs();
    };

    window.actualizarAsistenciaDia = async function () {
        const fechaEl = $('asistenHoyFecha');
        const cont = $('asistTimeline');
        if (!cont || !$('asistenFechaSel')) return;
        const fechaISO = $('asistenFechaSel').value || iso(new Date());
        const [y, m, d] = fechaISO.split('-').map(Number);
        const f = new Date(y, m - 1, d);
        const dia = DIAS_JS[f.getDay()];
        const etiqueta = `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
        fechaEl.textContent = fechaISO === iso(new Date()) ? `Hoy ${etiqueta}` : etiqueta;
        sincronizarInputs();
        cont.innerHTML = '<div class="asist-vacio">Cargando horarios...</div>';
        try {
            const { lista } = await cargarPersonas();
            S.personas = lista;
            rangoEje();
            render();
        } catch (e) {
            $('asistenHoyCount').textContent = '–';
            cont.innerHTML = '<div class="asist-vacio" style="color:#BB0000">No se pudo cargar la asistencia.</div>';
        }
    };

    // HTML de la tarjeta (lo usa renderDashboard en modal.js)
    window.asistentesCardHTML = function () {
        return `
        <div class="dash-card asist-card">
          <div class="card-header"><i class="fas fa-users" style="color:#107E3E;"></i><h3>👥 Asistentes · horario del día</h3></div>
          <div id="asistControlesNuevos" class="asist-controles">
            <div class="asist-fila-ctl">
              <input type="date" id="asistenFechaSel" onchange="window.actualizarAsistenciaDia()">
              <div class="asist-tabs">${TABS.map(t => `<button type="button" class="asist-tab" data-dia="${t.dia}">${t.corto}</button>`).join('')}</div>
            </div>
            <div class="asist-fila-ctl">
              <div class="asist-seg"><button type="button" id="asistModoHora" class="on">A una hora</button><button type="button" id="asistModoRango">En un rango</button></div>
              <div id="asistPanelHora" class="asist-panel"><label>A las <input type="time" id="asistHora" step="300"></label></div>
              <div id="asistPanelRango" class="asist-panel" style="display:none">
                <label>Desde <input type="time" id="asistDesde" step="300"></label>
                <label>Hasta <input type="time" id="asistHasta" step="300"></label>
                <div class="asist-seg"><button type="button" id="asistTipoAlgun" class="on">En algún momento</button><button type="button" id="asistTipoTodo">Todo el rango</button></div>
                <button type="button" class="asist-atajo" id="asistAtajoManana">🌅 Mañana</button>
                <button type="button" class="asist-atajo" id="asistAtajoTarde">🌆 Tarde</button>
              </div>
            </div>
          </div>
          <div class="asist-resultado">
            <div class="number" id="asistenHoyCount">0</div>
            <div><div class="asist-resumen" id="asistResumen"></div><div class="sub-info" id="asistenHoyFecha"></div></div>
            <div class="asist-buscador">
              <i class="fas fa-search"></i>
              <input type="text" id="asistBuscar" placeholder="Buscar por ID, apellidos o nombres..." autocomplete="off" aria-label="Buscar personal">
              <button type="button" id="asistBuscarLimpiar" title="Limpiar" style="display:none">&times;</button>
            </div>
          </div>
          <div class="asist-leyenda"><i class="manana"></i> Ingresa antes de las 14:00 <i class="tarde"></i> Ingresa desde las 14:00 <i class="ref"></i> Refrigerio · Clic en el gráfico para mover la hora</div>
          <div id="asistTimeline"></div>
        </div>`;
    };
})();

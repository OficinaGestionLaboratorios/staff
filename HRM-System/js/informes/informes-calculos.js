// ============================================================
// INFORMES-CALCULOS.JS — Cálculos puros (sin DOM) de la ficha
// ============================================================
// Todas las fechas se manejan como "número de día" UTC (días desde
// 1970-01-01) para que los límites de inicio/término sean inclusivos
// y no haya corrimientos por zona horaria.
// ============================================================
window.InformesCalc = (function () {
    const SIN_INFO = 'Sin información registrada';
    const INCOMPLETA = 'Información incompleta';
    const DIAS_POR_VENCER = 60;     // contrato próximo a vencer
    const DIAS_VAC_PROX = 30;       // vacaciones próximas
    const DIAS_REINC_PROX = 7;      // reincorporación próxima
    const DIAS_RECIENTE = 30;       // "recientemente" (reincorporado / cambio de horario)
    const DIA_NOMBRES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Setiembre','Octubre','Noviembre','Diciembre'];

    // ---------- fechas ----------
    function parse(v) {
        if (v === null || v === undefined || v === '') return null;
        if (v instanceof Date) return isNaN(v) ? null : Math.floor(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()) / 864e5);
        const s = String(v).trim();
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5);
        m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m) return Math.floor(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 864e5);
        const d = new Date(s);
        return isNaN(d) ? null : parse(d);
    }
    function hoy() { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
    function aDate(n) { return new Date(n * 864e5); }
    function ymd(n) { const d = aDate(n); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
    function fmt(n) { if (n === null || n === undefined) return ''; const o = ymd(n); return String(o.d).padStart(2, '0') + '/' + String(o.m).padStart(2, '0') + '/' + o.y; }
    function iso(n) { if (n === null || n === undefined) return ''; const o = ymd(n); return o.y + '-' + String(o.m).padStart(2, '0') + '-' + String(o.d).padStart(2, '0'); }
    function mk(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / 864e5); }
    function dow(n) { return aDate(n).getUTCDay(); }
    function diasInc(a, b) { return (a === null || b === null || b < a) ? 0 : b - a + 1; }
    function solapa(a1, b1, a2, b2) { return a1 <= b2 && b1 >= a2; }

    // Duración legible "X años, Y meses, Z días" entre dos días (ambos incluidos).
    function durTexto(a, b) {
        if (a === null || b === null || b < a) return SIN_INFO;
        const A = ymd(a), B = ymd(b + 1);
        let y = B.y - A.y, m = B.m - A.m, d = B.d - A.d;
        if (d < 0) { m--; d += new Date(Date.UTC(B.y, B.m - 1, 0)).getUTCDate(); }
        if (m < 0) { y--; m += 12; }
        const p = [];
        if (y) p.push(y + (y === 1 ? ' año' : ' años'));
        if (m) p.push(m + (m === 1 ? ' mes' : ' meses'));
        if (d || !p.length) p.push(d + (d === 1 ? ' día' : ' días'));
        return p.join(', ');
    }
    function durDias(n) { // texto desde un total de días (aprox. por calendario)
        if (!n) return '0 días';
        const a = mk(2000, 1, 1);
        return durTexto(a, a + n - 1);
    }

    // ---------- horas ----------
    function hh(v) { // "HH:MM" -> minutos
        if (!v) return null; const m = String(v).match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null;
    }
    function fmtHoras(h) {
        const n = parseFloat(h); if (isNaN(n)) return '0 h';
        const t = Math.round(n * 60), H = Math.floor(t / 60), M = t % 60;
        return M ? H + ' h ' + String(M).padStart(2, '0') + ' min' : H + ' h';
    }
    function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
    function nombre(p) { return [p.NOMBRES, p.APE_PATERNO, p.APE_MATERNO].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }
    function nombreInv(p) { return [p.APE_PATERNO, p.APE_MATERNO, p.NOMBRES].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }
    const esEnfermedad = r => norm(r.CLASE_PERMISO) === 'enfermedad';

    // ---------- horarios ----------
    function horariosOrdenados(rec) {
        return (rec.horarios || []).map(g => ({ g, ini: parse(g.FECHA_INICIO), fin: parse(g.FECHA_FIN) }))
            .sort((a, b) => (a.ini ?? 0) - (b.ini ?? 0));
    }
    function horarioEn(rec, dia) {
        let best = null;
        horariosOrdenados(rec).forEach(h => {
            if (h.ini === null || h.ini > dia) return;
            if (h.fin !== null && h.fin < dia) return;
            best = h; // el de inicio más reciente gana
        });
        return best;
    }
    function diaDeHorario(h, dia) {
        if (!h) return null;
        const nom = DIA_NOMBRES[dow(dia)];
        return (h.g.DIAS || []).find(d => norm(d.dia) === nom) || null;
    }
    function resumenHorario(g) {
        const dias = g.DIAS || [];
        if (!dias.length) return SIN_INFO;
        const corto = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom' };
        const grupos = {};
        dias.forEach(d => { const k = (d.ingreso || '?') + '–' + (d.salida || '?'); (grupos[k] = grupos[k] || []).push(corto[norm(d.dia)] || d.dia); });
        return Object.keys(grupos).map(k => grupos[k].join('/') + ' ' + k).join(' · ');
    }
    function turnoDe(g) {
        const dias = (g && g.DIAS) || [];
        const d = dias.find(x => hh(x.ingreso) !== null && hh(x.salida) !== null);
        if (!d) return '';
        const i = hh(d.ingreso), s = hh(d.salida);
        if (i >= 720) return 'Tarde';
        if (s <= 900) return 'Mañana';
        return 'Jornada completa';
    }

    // ---------- contratos ----------
    function contratos(rec, t) {
        t = t ?? hoy();
        const p = rec.p, lista = [];
        const hv = horarioEn(rec, t);
        const base = { cargo: p.CARGO || '', area: p.PROGRAMA || '', laboratorio: p.LUGAR_TRABAJO || '',
            jornada: hv && hv.g.HORAS_SEMANA ? (parseFloat(hv.g.HORAS_SEMANA) + ' h/sem') : '' };
        if ((rec.contratos || []).length) {
            // Historial real (BD_CONTRATOS): un registro por contrato.
            rec.contratos.forEach(k => {
                const ini = parse(k.INICIO_PERIODO), fin = k.CESE_PERIODO ? parse(k.CESE_PERIODO) : null;
                lista.push(Object.assign({ n: 1, tipo: k.TIPO_CONTRATO || p.TIPO_CONTRATO || '', inicio: ini, fin, incompleto: ini === null }, base));
            });
        } else {
            // Fichas sin historial migrado: se usa el único contrato guardado en la ficha.
            const ini = parse(p.INICIO_PERIODO), fin = parse(p.CESE_PERIODO);
            if (ini !== null || fin !== null || p.TIPO_CONTRATO) {
                lista.push(Object.assign({ n: 1, tipo: p.TIPO_CONTRATO || '', inicio: ini, fin, incompleto: ini === null }, base));
            }
        }
        lista.sort((a, b) => (a.inicio ?? 0) - (b.inicio ?? 0));
        lista.forEach((c, i) => {
            c.n = i + 1;
            if (c.inicio === null) c.estado = INCOMPLETA;
            else if (c.inicio > t) c.estado = 'Programado';
            else if (c.fin !== null && c.fin < t) c.estado = 'Vencido';
            else c.estado = 'Vigente';
        });
        return lista;
    }

    function trayectoria(rec, t) {
        t = t ?? hoy();
        const cs = contratos(rec, t), segs = [];
        const vinc = parse(rec.p.FECHA_VINCULACION);
        const primero = cs.find(c => c.inicio !== null);
        if (vinc !== null && primero && vinc < primero.inicio) {
            segs.push({ tipo: 'previo', desde: vinc, hasta: primero.inicio - 1, titulo: 'Periodo previo sin detalle contractual' });
        }
        cs.forEach((c, i) => {
            if (c.inicio !== null) segs.push({ tipo: 'contrato', desde: c.inicio, hasta: c.fin, c, titulo: 'CONTRATO ' + String(c.n).padStart(2, '0') });
            const sig = cs[i + 1];
            if (c.fin !== null && c.fin + 1 <= (sig && sig.inicio !== null ? sig.inicio - 1 : t)) {
                const hasta = sig && sig.inicio !== null ? sig.inicio - 1 : t;
                if (hasta >= c.fin + 1) segs.push({ tipo: 'sin', desde: c.fin + 1, hasta, abierto: !sig, titulo: 'SIN CONTRATO' });
            }
        });
        let contratado = 0, sin = 0, interrup = 0;
        segs.forEach(s => {
            if (s.tipo === 'contrato') contratado += diasInc(s.desde, s.hasta === null ? t : Math.min(s.hasta, t));
            if (s.tipo === 'sin') { sin += diasInc(s.desde, s.hasta); if (!s.abierto) interrup++; }
        });
        const previo = segs.find(s => s.tipo === 'previo');
        return {
            contratos: cs, segmentos: segs, nContratos: cs.length, diasContratado: contratado, diasSinContrato: sin,
            interrupciones: interrup, sinContratoActual: segs.some(s => s.tipo === 'sin' && s.abierto),
            diasPrevioSinDetalle: previo ? diasInc(previo.desde, previo.hasta) : 0,
            vigente: cs.find(c => c.estado === 'Vigente') || null,
            primero: cs[0] || null
        };
    }

    // ---------- horas extras (sobretiempo) ----------
    function extras(rec) {
        const filas = [];
        (rec.sobretiempo || []).forEach(s => {
            (s.FECHAS || []).forEach(f => {
                const d = parse(f.fecha); if (d === null) return;
                filas.push({
                    id: s.ID_SOLICITUD, fecha: d, ini: f.horaInicio || '', fin: f.horaFin || '',
                    horas: parseFloat(f.horas) || 0, motivo: s.JUSTIFICACION || s.TIPO_TRABAJO || '',
                    estado: s.ESTADO_AUTORIZACION || '', tipo: s.TIPO_TRABAJO || ''
                });
            });
        });
        filas.sort((a, b) => b.fecha - a.fecha);
        return filas;
    }
    function totalesExtras(filas, t) {
        t = t ?? hoy(); const o = ymd(t);
        const ap = filas.filter(f => f.estado === 'Aprobado');
        const suma = a => a.reduce((x, f) => x + f.horas, 0);
        return {
            registros: filas.length,
            historico: suma(ap),
            anio: suma(ap.filter(f => ymd(f.fecha).y === o.y)),
            mes: suma(ap.filter(f => ymd(f.fecha).y === o.y && ymd(f.fecha).m === o.m)),
            pendientes: filas.filter(f => /pendiente/i.test(f.estado)).length,
            rechazados: filas.filter(f => f.estado === 'Rechazado').length
        };
    }

    // ---------- permisos ----------
    function permisos(rec) {
        return (rec.permisos || []).map(r => ({
            id: r.ID_PERMISO, fecha: parse(r.FECHA_PERMISO), ini: r.HORA_SALIDA || '', fin: r.HORA_RETORNO || '',
            horas: parseFloat(r.DURACION_TOTAL) || 0, motivo: r.MOTIVO_SALIDA || '', clase: r.CLASE_PERMISO || '',
            otra: r.OTRA_ESPECIFICAR || '', estado: r.ESTADO || '', medico: esEnfermedad(r), destino: r.LUGAR_DESTINO || ''
        })).filter(r => r.fecha !== null).sort((a, b) => b.fecha - a.fecha);
    }
    function totalesPermisos(ps, t) {
        t = t ?? hoy(); const o = ymd(t);
        const dias = new Set(ps.map(p => p.fecha));
        return {
            n: ps.length, horas: ps.reduce((x, p) => x + p.horas, 0), dias: dias.size,
            anio: ps.filter(p => ymd(p.fecha).y === o.y).length,
            mes: ps.filter(p => ymd(p.fecha).y === o.y && ymd(p.fecha).m === o.m).length
        };
    }

    // ---------- vacaciones ----------
    function vacaciones(rec) {
        const periodos = (rec.vacaciones || []).map(v => ({
            id: v.ID_VACACION, periodo: v.PERIODO_VACACIONAL, asignados: +v.DIAS_ASIGNADOS || 0, tomados: +v.DIAS_TOMADOS || 0,
            pendientes: +v.DIAS_PENDIENTES || 0, limite: parse(v.FECHA_LIMITE), estado: v.ESTADO || '', obs: v.OBSERVACION || ''
        }));
        const tramos = [];
        (rec.vacaciones || []).forEach(v => (v.GOCES || []).forEach(g => {
            const a = parse(g.fechaInicio), b = parse(g.fechaFin);
            if (a !== null) tramos.push({ periodo: v.PERIODO_VACACIONAL, inicio: a, fin: b ?? a, dias: +g.dias || diasInc(a, b ?? a), obs: g.observacion || '' });
        }));
        tramos.sort((a, b) => b.inicio - a.inicio);
        return { periodos, tramos, tomados: periodos.reduce((x, p) => x + p.tomados, 0), pendientes: periodos.reduce((x, p) => x + p.pendientes, 0) };
    }

    // ---------- licencias ----------
    function licencias(rec) {
        return (rec.licencias || []).map(l => ({
            id: l.ID_LICENCIA, tipo: l.TIPO_LICENCIA || 'Licencia', inicio: parse(l.FECHA_INICIO), fin: parse(l.FECHA_FIN),
            dias: +l.DIAS || 0, motivo: l.MOTIVO || '', anexos: l.ANEXOS || '', sustentado: !!String(l.ANEXOS || '').trim()
        })).filter(l => l.inicio !== null).sort((a, b) => b.inicio - a.inicio);
    }

    // ---------- descansos médicos (registro propio) ----------
    function descansosMedicos(rec) {
        return (rec.descansosMedicos || []).map(d => ({
            id: d.ID_DESCANSO, inicio: parse(d.FECHA_INICIO), fin: parse(d.FECHA_FIN), dias: +d.DIAS || 0,
            otorgamiento: parse(d.FECHA_OTORGAMIENTO), conFoto: String(d.CON_FOTO || '').toUpperCase() === 'SI', obs: d.OBSERVACION || ''
        })).filter(d => d.inicio !== null).map(d => ({ ...d, fin: d.fin ?? d.inicio })).sort((a, b) => b.inicio - a.inicio);
    }
    // Días acumulados. Los descansos que se tocan o se solapan (el siguiente empieza
    // a más tardar el día posterior al fin del anterior) forman un bloque continuo.
    //  · consecutivos    = días del bloque continuo más largo
    //  · noConsecutivos  = el resto de días acumulados (fuera de ese bloque)
    // Con anio se recorta cada descanso a ese año calendario.
    function acumuladosMedicos(lista, anio) {
        let rangos = lista.map(d => [d.inicio, d.fin]);
        if (anio) {
            const a = mk(anio, 1, 1), b = mk(anio, 12, 31);
            rangos = rangos.map(([i, f]) => [Math.max(i, a), Math.min(f, b)]).filter(([i, f]) => f >= i);
        }
        rangos.sort((x, y) => x[0] - y[0]);
        const bloques = [];
        rangos.forEach(([i, f]) => {
            const u = bloques[bloques.length - 1];
            if (u && i <= u[1] + 1) u[1] = Math.max(u[1], f); else bloques.push([i, f]);
        });
        const largos = bloques.map(([i, f]) => f - i + 1), total = largos.reduce((s, x) => s + x, 0), max = largos.length ? Math.max(...largos) : 0;
        return { total, consecutivos: max, noConsecutivos: total - max, bloques: bloques.length, registros: rangos.length };
    }

    // ---------- ausencias unificadas ----------
    function estadoRango(ini, fin, t) { return t < ini ? 'Programado' : (t > fin ? 'Histórico' : 'Vigente'); }
    function ausencias(rec, t) {
        t = t ?? hoy(); const out = [];
        permisos(rec).forEach(p => out.push({
            tipo: p.medico ? 'Descanso médico' : 'Permiso', inicio: p.fecha, fin: p.fecha, dias: 0, horas: p.horas,
            horario: p.ini && p.fin ? p.ini + ' – ' + p.fin : '', estado: estadoRango(p.fecha, p.fecha, t),
            sustento: SIN_INFO, // el sistema no guarda documento de sustento en permisos
            obs: p.medico ? 'Descanso médico registrado' : (p.clase + (p.otra ? ' – ' + p.otra : '') + (p.motivo ? ': ' + p.motivo : '')),
            motivo: p.medico ? '' : p.motivo, clase: p.clase, medico: p.medico
        }));
        descansosMedicos(rec).forEach(d => out.push({
            tipo: 'Descanso médico', inicio: d.inicio, fin: d.fin, dias: d.dias || diasInc(d.inicio, d.fin), horas: 0, horario: '',
            estado: estadoRango(d.inicio, d.fin, t), sustento: d.conFoto ? 'SUSTENTADO' : 'SIN ADJUNTO',
            obs: 'Descanso médico' + (d.otorgamiento !== null ? ' (otorgado el ' + fmt(d.otorgamiento) + ')' : '') + (d.obs ? ': ' + d.obs : ''), motivo: d.obs, medico: false
        }));
        licencias(rec).forEach(l => out.push({
            tipo: 'Licencia', inicio: l.inicio, fin: l.fin ?? l.inicio, dias: l.dias || diasInc(l.inicio, l.fin ?? l.inicio), horas: 0, horario: '',
            estado: estadoRango(l.inicio, l.fin ?? l.inicio, t), sustento: l.sustentado ? 'SUSTENTADO' : 'PENDIENTE DE SUSTENTO',
            obs: l.tipo + (l.motivo ? ': ' + l.motivo : ''), motivo: l.motivo
        }));
        vacaciones(rec).tramos.forEach(v => out.push({
            tipo: 'Vacaciones', inicio: v.inicio, fin: v.fin, dias: v.dias, horas: 0, horario: '', estado: estadoRango(v.inicio, v.fin, t),
            sustento: SIN_INFO, obs: 'Periodo ' + v.periodo + (v.obs ? ' – ' + v.obs : ''), motivo: ''
        }));
        (rec.descansos || []).forEach(d => (d.FECHAS_DESCANSO || []).forEach(f => {
            const a = parse(f.fecha); if (a === null) return;
            out.push({
                tipo: 'Descanso compensatorio', inicio: a, fin: a, dias: 0, horas: parseFloat(f.horas) || 0,
                horario: f.horaInicio && f.horaFin ? f.horaInicio + ' – ' + f.horaFin : '', estado: estadoRango(a, a, t), sustento: SIN_INFO,
                obs: 'Solicitud ' + d.ID_SOLICITUD_DESCANSO + (d.ESTADO ? ' (' + d.ESTADO + ')' : ''), motivo: ''
            });
        }));
        return out.sort((a, b) => b.inicio - a.inicio);
    }

    // ---------- situación actual / alertas ----------
    function situacion(rec, t) {
        t = t ?? hoy();
        const tr = trayectoria(rec, t), au = ausencias(rec, t);
        const activo = window.esPersonalActivo ? window.esPersonalActivo(rec.p) : true;
        const vig = tipo => au.filter(a => a.tipo === tipo && a.inicio <= t && a.fin >= t);
        const vacHoy = vig('Vacaciones')[0] || null, licHoy = vig('Licencia')[0] || null;
        const permHoy = vig('Permiso')[0] || null, medHoy = vig('Descanso médico')[0] || null;
        const hv = horarioEn(rec, t);
        const c = tr.vigente;
        const porVencer = c && c.fin !== null && c.fin - t <= DIAS_POR_VENCER ? c.fin - t : null;
        const vacProx = au.filter(a => a.tipo === 'Vacaciones' && a.inicio > t && a.inicio - t <= DIAS_VAC_PROX).sort((a, b) => a.inicio - b.inicio)[0] || null;
        const enAusencia = [vacHoy, licHoy].filter(Boolean);
        const retorno = enAusencia.length ? Math.max(...enAusencia.map(a => a.fin)) + 1 : null;
        const reincProx = retorno !== null && retorno - t <= DIAS_REINC_PROX ? retorno : null;
        const reciente = au.filter(a => (a.tipo === 'Vacaciones' || a.tipo === 'Licencia') && a.fin < t && t - a.fin <= DIAS_RECIENTE && !enAusencia.length)
            .sort((a, b) => b.fin - a.fin)[0] || null;
        const pendSust = au.filter(a => a.sustento === 'PENDIENTE DE SUSTENTO');
        const hs = horariosOrdenados(rec);
        const cambioReciente = hs.length > 1 ? hs.slice(1).filter(h => h.ini !== null && h.ini <= t && t - h.ini <= DIAS_RECIENTE).pop() || null : null;
        const ex = extras(rec);
        const pendAprob = ex.filter(e => /pendiente/i.test(e.estado));

        let estado = 'Activo';
        if (!activo) estado = 'Inactivo';
        else if (vacHoy) estado = 'De vacaciones';
        else if (licHoy) estado = 'Con licencia';
        else if (tr.sinContratoActual) estado = 'Sin contrato vigente';
        else if (tr.contratos.length && !c && tr.contratos[0].estado === 'Programado') estado = 'Contrato por iniciar';
        const noLabora = estado !== 'Activo';

        const alertas = [];
        if (porVencer !== null) alertas.push({ nivel: 'rojo', icono: '🔴', texto: 'Contrato próximo a vencer' + (porVencer === 0 ? ' (vence hoy)' : ' (en ' + porVencer + ' días, ' + fmt(c.fin) + ')') });
        if (tr.sinContratoActual) alertas.push({ nivel: 'naranja', icono: '🟠', texto: 'Periodo sin contrato desde ' + fmt(tr.contratos[tr.contratos.length - 1].fin + 1) });
        if (vacProx) alertas.push({ nivel: 'amarillo', icono: '🟡', texto: 'Vacaciones próximas: ' + fmt(vacProx.inicio) + ' – ' + fmt(vacProx.fin) });
        if (permHoy) alertas.push({ nivel: 'azul', icono: '🔵', texto: 'Permiso vigente hoy' + (permHoy.horario ? ' (' + permHoy.horario + ')' : '') });
        if (medHoy) alertas.push({ nivel: 'morado', icono: '🟣', texto: 'Descanso médico registrado (vigente hoy)' });
        if (reincProx !== null) alertas.push({ nivel: 'verde', icono: '🟢', texto: 'Reincorporación próxima: ' + fmt(retorno) });
        if (pendSust.length) alertas.push({ nivel: 'aviso', icono: '⚠️', texto: 'Falta de sustento en ' + pendSust.length + ' licencia(s)' });
        if (activo && !hv && !noLabora) alertas.push({ nivel: 'aviso', icono: '⚠️', texto: 'Horario no definido a la fecha' });
        if (pendAprob.length) alertas.push({ nivel: 'aviso', icono: '⚠️', texto: pendAprob.length + ' registro(s) de horas extras pendiente(s) de aprobación' });

        return { t, activo, estado, noLabora, vacHoy, licHoy, permHoy, medHoy, hv, contrato: c, porVencer, vacProx, retorno, reincProx, reciente, pendSust, pendAprob, cambioReciente, alertas, tr };
    }

    // ---------- indicadores individuales ----------
    function indicadores(rec, t) {
        t = t ?? hoy();
        const tr = trayectoria(rec, t), ex = extras(rec), pe = permisos(rec), va = vacaciones(rec), li = licencias(rec);
        const hs = horariosOrdenados(rec), te = totalesExtras(ex, t), tp = totalesPermisos(pe, t);
        const vinc = parse(rec.p.FECHA_VINCULACION) ?? (tr.primero ? tr.primero.inicio : null);
        const fin = tr.vigente || !tr.contratos.length ? t : (tr.contratos[tr.contratos.length - 1].fin ?? t);
        const med = pe.filter(p => p.medico);
        const dm = descansosMedicos(rec), acumDM = acumuladosMedicos(dm), acumDMAnio = acumuladosMedicos(dm, ymd(t).y);
        return {
            tr, ex, pe, va, li, te, tp, hs, vinc, dm, acumDM, acumDMAnio,
            antiguedad: vinc !== null && vinc <= fin ? durTexto(vinc, fin) : SIN_INFO,
            cambiosHorario: hs.length ? hs.length - 1 : null, nHorarios: hs.length,
            medicos: med.length, medicosHoras: med.reduce((x, p) => x + p.horas, 0),
            incidencias: null // el sistema no registra marcaciones de asistencia
        };
    }

    return { SIN_INFO, INCOMPLETA, DIAS_POR_VENCER, DIAS_VAC_PROX, DIAS_REINC_PROX, DIAS_RECIENTE, MESES, DIA_NOMBRES,
        parse, hoy, fmt, iso, mk, ymd, dow, aDate, diasInc, solapa, durTexto, durDias, hh, fmtHoras, norm, nombre, nombreInv, esEnfermedad,
        horariosOrdenados, horarioEn, diaDeHorario, resumenHorario, turnoDe,
        contratos, trayectoria, extras, totalesExtras, permisos, totalesPermisos, vacaciones, licencias, descansosMedicos, acumuladosMedicos, ausencias, situacion, indicadores };
})();

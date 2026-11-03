// ============================================================
// CONTRATOS-CALCULOS.JS — Cálculos puros del historial contractual
// ============================================================
// Sin DOM ni red: recibe la lista de contratos de UN trabajador
// ({INICIO_PERIODO, CESE_PERIODO} en "YYYY-MM-DD"; CESE vacío = sin
// fecha de término) y devuelve el resumen de continuidad.
//
// Regla de continuidad: dos contratos son CONSECUTIVOS cuando el
// siguiente inicia el día posterior al cese del anterior. Si entre
// ambos pasa al menos un día, hay una INTERRUPCIÓN de
// (inicio - cese - 1) días y la racha de continuidad se reinicia.
// ============================================================
(function (root) {
    const MS = 86400000;

    function num(s) {
        if (!s) return null;
        const p = String(s).slice(0, 10).split('-');
        if (p.length !== 3) return null;
        const t = Date.UTC(+p[0], +p[1] - 1, +p[2]);
        return isNaN(t) ? null : Math.round(t / MS);
    }
    function iso(n) {
        const d = new Date(n * MS);
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    }
    function hoyNum() {
        const d = new Date();
        return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS);
    }
    const diasInc = (a, b) => b - a + 1;

    // "1 año, 2 meses, 5 días" (aproximado: año=365, mes=30)
    function durTexto(dias) {
        if (dias === null || dias === undefined) return '';
        if (dias <= 0) return '0 días';
        const a = Math.floor(dias / 365), m = Math.floor((dias % 365) / 30), d = (dias % 365) % 30;
        const p = [];
        if (a) p.push(a + (a === 1 ? ' año' : ' años'));
        if (m) p.push(m + (m === 1 ? ' mes' : ' meses'));
        if (d || !p.length) p.push(d + (d === 1 ? ' día' : ' días'));
        return p.join(', ');
    }

    // Fecha por defecto de cese de una renovación trimestral: inicio + 3 meses - 1 día.
    function ceseTrimestral(inicioISO) {
        const n = num(inicioISO);
        if (n === null) return '';
        const d = new Date(n * MS);
        const y = d.getUTCFullYear(), m = d.getUTCMonth() + 3, dia = d.getUTCDate();
        let t = Date.UTC(y, m, dia);
        const f = new Date(t);
        // si el día no existe en el mes destino (31 → 30/28), JS se desborda al mes siguiente: retroceder al último día
        if (f.getUTCDate() !== dia) t = Date.UTC(y, m + 1, 0) + MS;
        return iso(Math.round(t / MS) - 1);
    }

    function resumen(contratos, hoy) {
        hoy = hoy ?? hoyNum();
        const cs = (contratos || [])
            .map(c => ({ c, ini: num(c.INICIO_PERIODO), fin: c.CESE_PERIODO ? num(c.CESE_PERIODO) : null }))
            .filter(x => x.ini !== null)
            .sort((a, b) => a.ini - b.ini);

        const tramos = [], interrupciones = [];
        let diasContratado = 0, diasSinContrato = 0;
        cs.forEach((x, i) => {
            const finEf = x.fin === null ? Math.max(hoy, x.ini) : x.fin;
            const prev = cs[i - 1];
            let intervalo = null, continuo = null;
            if (prev) {
                const prevFin = prev.fin === null ? null : prev.fin;
                // un contrato anterior sin cese no tiene "intervalo" definido
                if (prevFin !== null) {
                    intervalo = x.ini - prevFin - 1;
                    continuo = intervalo === 0;
                    if (intervalo > 0) {
                        interrupciones.push({ desde: prevFin + 1, hasta: x.ini - 1, dias: intervalo });
                        diasSinContrato += intervalo;
                    }
                }
            }
            const dias = diasInc(x.ini, finEf); // duración total del contrato (abierto: hasta hoy)
            let estado;
            if (x.ini > hoy) estado = 'Programado';
            else if (x.fin !== null && x.fin < hoy) estado = 'Vencido';
            else estado = 'Vigente';
            // días efectivamente contratados hasta hoy (los programados aún no cuentan)
            if (x.ini <= hoy) diasContratado += diasInc(x.ini, x.fin === null ? hoy : Math.min(x.fin, hoy));
            tramos.push({
                n: i + 1, inicio: x.ini, cese: x.fin, inicioISO: iso(x.ini), ceseISO: x.fin === null ? '' : iso(x.fin),
                duracion: dias, estado, intervalo, continuo, contrato: x.c
            });
        });

        // Racha actual: contratos consecutivos terminando en el último contrato.
        let rachaDesde = tramos.length - 1;
        while (rachaDesde > 0 && tramos[rachaDesde].continuo === true) rachaDesde--;
        let racha = null;
        if (tramos.length) {
            const u = tramos[tramos.length - 1], r0 = tramos[rachaDesde];
            // Tiempo de continuidad ya transcurrido: hasta el cese o hasta hoy, lo que ocurra primero.
            const fin = Math.min(u.cese === null ? hoy : u.cese, hoy);
            racha = { periodos: tramos.length - rachaDesde, desde: r0.inicio, hasta: u.cese, dias: Math.max(0, fin >= r0.inicio ? diasInc(r0.inicio, fin) : 0) };
        }

        const vigente = tramos.find(t => t.estado === 'Vigente') || null;
        const ultimo = tramos[tramos.length - 1] || null;
        return {
            total: tramos.length,
            tramos,
            interrupciones,
            diasContratado,
            diasSinContrato,
            racha,
            vigente,
            ultimo,
            sinContratoActual: !!ultimo && !vigente && ultimo.estado === 'Vencido',
            diasSinContratoActual: ultimo && ultimo.estado === 'Vencido' ? hoy - ultimo.cese : 0,
            diasParaVencer: vigente && vigente.cese !== null ? vigente.cese - hoy : null
        };
    }

    const api = { num, iso, hoyNum, durTexto, ceseTrimestral, resumen };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.ContratosCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);

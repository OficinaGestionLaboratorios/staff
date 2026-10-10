// ============================================================
// INFORMES-DATOS.JS — Carga y relación de datos por trabajador
// ============================================================
// Solo LEE lo que ya existe (mismas acciones list* de cada módulo).
// No guarda nada ni inventa registros. La clave de relación es
// CODE (la misma que usan todas las hojas BD_*); ID_PERSONAL se usa
// como respaldo cuando un registro viejo no trae CODE.
// ============================================================
window.InformesDatos = (function () {
    const TTL = 5 * 60 * 1000;
    let cache = null; // { ts, personal, fuentes, porCode }

    // Fuentes: módulo del permiso "ver" + función que lista TODO.
    const FUENTES = [
        { k: 'contratos',   mod: 'personal',    f: () => window.ContratosAPI.listar() },
        { k: 'horarios',    mod: 'horarios',    f: () => window.HorarioAPI.listar() },
        { k: 'permisos',    mod: 'permisos',    f: () => window.PermisosAPI.listar() },
        { k: 'vacaciones',  mod: 'vacaciones',  f: () => window.VacacionesAPI.listar() },
        { k: 'licencias',   mod: 'licencias',   f: () => window.LicenciasAPI.listar() },
        { k: 'descansosMedicos', mod: 'descansoMedico', f: () => window.DescansoMedicoAPI.listar() },
        { k: 'sobretiempo', mod: 'sobretiempo', f: () => window.SobretiempoAPI.listar() },
        { k: 'descansos',   mod: 'sobretiempo', f: () => window.SobretiempoAPI.listarSolicitudesBanco() }
    ];

    async function pedir(def) {
        if (!window.AUTH.tienePermiso(def.mod, 'ver')) return { ok: false, acceso: false, data: [] };
        try {
            const r = await def.f();
            if (r && r.success) return { ok: true, acceso: true, data: Array.isArray(r.data) ? r.data : [] };
            return { ok: false, acceso: true, error: (r && r.message) || 'Error', data: [] };
        } catch (e) { return { ok: false, acceso: true, error: e.message, data: [] }; }
    }

    function clave(r, idACode) {
        if (r.CODE) return String(r.CODE);
        if (r.ID_PERSONAL && idACode[String(r.ID_PERSONAL)]) return idACode[String(r.ID_PERSONAL)];
        return '';
    }

    async function cargar(force) {
        if (!force && cache && Date.now() - cache.ts < TTL) return cache;
        const personal = (await window.API.list(!!force)) || [];
        const res = await Promise.all(FUENTES.map(pedir));
        const fuentes = {};
        FUENTES.forEach((d, i) => { fuentes[d.k] = res[i]; });

        const idACode = {};
        personal.forEach(p => { if (p.ID_PERSONAL) idACode[String(p.ID_PERSONAL)] = String(p.CODE); });

        const porCode = {};
        personal.forEach(p => {
            porCode[String(p.CODE)] = { p, contratos: [], horarios: [], permisos: [], vacaciones: [], licencias: [], descansosMedicos: [], sobretiempo: [], descansos: [] };
        });
        FUENTES.forEach(d => {
            fuentes[d.k].data.forEach(r => {
                const c = clave(r, idACode);
                if (c && porCode[c]) porCode[c][d.k].push(r);
            });
        });
        cache = { ts: Date.now(), personal, fuentes, porCode };
        return cache;
    }

    function invalidar() { cache = null; }
    function get() { return cache; }

    return { cargar, invalidar, get };
})();

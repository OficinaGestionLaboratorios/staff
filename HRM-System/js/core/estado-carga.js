// ============================================================
// ESTADO-CARGA.JS — Aviso de consulta a la base de datos
// ============================================================
// Al entrar a un módulo (Horarios, Sobretiempo, Vacaciones, Permisos,
// Licencias, Descansos médicos) los registros del trabajador tardan
// 1–3 s en llegar. Mientras tanto no se veía nada, y si no había
// registros tampoco: parecía una falla. Este componente deja siempre
// un mensaje visible sobre la lista:
//
//   EstadoCarga.iniciar(clave)                 → "Consultando <Módulo>…" (oculta la lista anterior)
//   EstadoCarga.finalizar(clave, cantidad, ok) → vacío: "No se encontraron registros de <Módulo>
//                                                en la base de datos."; con registros: se oculta;
//                                                ok === false: "No se pudo consultar…"
//
// La lista real sigue pintándola cada módulo; esto solo gestiona el aviso.
// ============================================================
window.EstadoCarga = (function () {
    const MODULOS = {
        horarios:       { wrap: 'horarioGruposExistentesWrap', titulo: 'Horarios' },
        sobretiempo:    { wrap: 'sobretiempoListaWrap',        titulo: 'Sobretiempo' },
        vacaciones:     { wrap: 'vacacionesListaWrap',         titulo: 'Vacaciones' },
        permisos:       { wrap: 'permisosListaWrap',           titulo: 'Permisos' },
        licencias:      { wrap: 'licenciasListaWrap',          titulo: 'Licencias' },
        descansoMedico: { wrap: 'dmListaWrap',                 titulo: 'Descansos médicos' }
    };

    function caja(clave) {
        const m = MODULOS[clave];
        if (!m) return null;
        const wrap = document.getElementById(m.wrap);
        if (!wrap || !wrap.parentNode) return null;
        const id = 'estadoCarga_' + clave;
        let box = document.getElementById(id);
        if (!box) {
            box = document.createElement('div');
            box.id = id;
            box.className = 'estado-carga';
            box.setAttribute('role', 'status');
            box.setAttribute('aria-live', 'polite');
            box.style.display = 'none';
            wrap.parentNode.insertBefore(box, wrap);
        }
        return { box, wrap, titulo: m.titulo };
    }

    function pintar(c, tipo, icono, texto) {
        c.box.className = 'estado-carga estado-carga--' + tipo;
        c.box.innerHTML = '<i class="fas ' + icono + '"></i><span></span>';
        c.box.lastChild.textContent = texto;
        c.box.style.display = 'flex';
    }

    function iniciar(clave) {
        const c = caja(clave);
        if (!c) return;
        // Se oculta la lista del trabajador anterior mientras llega la del actual.
        c.wrap.style.display = 'none';
        pintar(c, 'cargando', 'fa-spinner fa-spin', 'Consultando ' + c.titulo + ' en la base de datos…');
    }

    function finalizar(clave, cantidad, ok) {
        const c = caja(clave);
        if (!c) return;
        if (ok === false) {
            pintar(c, 'error', 'fa-exclamation-triangle',
                'No se pudo consultar ' + c.titulo + '. Revisa tu conexión e inténtalo nuevamente.');
        } else if (!cantidad) {
            pintar(c, 'vacio', 'fa-info-circle',
                'No se encontraron registros de ' + c.titulo + ' en la base de datos.');
        } else {
            c.box.style.display = 'none';
            c.box.innerHTML = '';
        }
    }

    return { iniciar, finalizar };
})();

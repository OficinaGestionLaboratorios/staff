// ============================================================
// AUDITORIA.JS — Panel "Actividad" (historial de create/update/delete)
// ============================================================
// Antes, cada alta/edición/baja de Personal u Horarios solo quedaba
// registrada como el cambio en sí dentro de la hoja de cálculo, sin
// ningún historial visible desde la interfaz. El backend
// (Codigo_corregido.gs) ahora escribe cada una de esas operaciones,
// más los inicios/cierres de sesión, en la hoja BD_AUDITORIA. Este
// módulo solo la lee (acción "listAuditoria") y la pinta.
// ============================================================

window.AuditoriaAPI = (function() {
    async function listar(filtros = {}) {
        let url = window.API_URL + '?action=listAuditoria';
        Object.entries(filtros).forEach(([k, v]) => {
            if (v) url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
        });
        return window.AUTH.request(url);
    }
    return { listar };
})();

const ACCION_INFO = {
    'CREAR': { icono: 'fa-plus-circle', clase: 'accion-crear' },
    'ACTUALIZAR': { icono: 'fa-pen', clase: 'accion-actualizar' },
    'ELIMINAR': { icono: 'fa-trash', clase: 'accion-eliminar' },
    'LOGIN': { icono: 'fa-right-to-bracket', clase: 'accion-login' },
    'LOGIN_FALLIDO': { icono: 'fa-triangle-exclamation', clase: 'accion-fallo' },
    'LOGOUT': { icono: 'fa-right-from-bracket', clase: 'accion-login' },
    'CAMBIO_PASSWORD': { icono: 'fa-key', clase: 'accion-login' }
};

function formatearFechaHora(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
}

window.abrirModalActividad = async function() {
    const modal = document.getElementById('modalActividad');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    await window.cargarActividad();
};

window.cerrarModalActividad = function() {
    const modal = document.getElementById('modalActividad');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
};

window.cargarActividad = async function() {
    const cont = document.getElementById('actividadTbody');
    const contador = document.getElementById('actividadContador');
    if (!cont) return;

    cont.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:24px;"><i class="fas fa-spinner fa-spin"></i> Cargando actividad...</td></tr>`;

    const modulo = document.getElementById('actividadFiltroModulo')?.value || '';
    const q = document.getElementById('actividadFiltroBuscar')?.value.trim() || '';

    const result = await window.AuditoriaAPI.listar({ modulo, q, limit: 300 });

    if (!result.success) {
        cont.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:24px;">❌ ${window.esc(result.message || 'No se pudo cargar la actividad')}</td></tr>`;
        return;
    }

    const registros = result.data || [];
    if (contador) contador.textContent = `${registros.length} registro${registros.length === 1 ? '' : 's'}`;

    if (registros.length === 0) {
        cont.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:24px;">Sin actividad registrada todavía</td></tr>`;
        return;
    }

    cont.innerHTML = registros.map(r => {
        const info = ACCION_INFO[r.ACCION] || { icono: 'fa-circle-info', clase: 'accion-otro' };
        return `
            <tr>
                <td style="white-space:nowrap;">${window.esc(formatearFechaHora(r.FECHA))}</td>
                <td><span class="badge-actividad ${info.clase}"><i class="fas ${info.icono}"></i> ${window.esc(r.ACCION)}</span> <span class="text-muted" style="font-size:12px;">${window.esc(r.MODULO)}</span></td>
                <td>${window.esc(r.USUARIO)}</td>
                <td>${window.esc(r.DETALLE)}</td>
            </tr>
        `;
    }).join('');
};

window.actividadFiltrar = window.debounce ? window.debounce(() => window.cargarActividad(), 300) : () => window.cargarActividad();

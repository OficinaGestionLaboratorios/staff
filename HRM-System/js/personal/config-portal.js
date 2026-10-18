// ============================================================
// CONFIGURACIÓN DEL PORTAL DE ACTUALIZACIÓN DE DATOS
// ============================================================
// Módulo NUEVO e independiente (no toca personal.js / listado.js /
// modal.js) para el ícono de ajustes ⚙️ de "Gestión Personal": abre
// un modal con la tabla de 21 campos y permite marcar, por campo,
// si el trabajador lo puede Editar y si lo puede Ver desde su propio
// portal de autoactualización (portal-personal.html).
//
// Habla con el backend por las mismas acciones que el resto del
// panel (getConfigCamposPortal / setConfigCamposPortal, ver
// Codigo_PortalPersonal.gs) usando window.AUTH.request(), igual que
// api.js — así el token de sesión admin viaja siempre y una sesión
// vencida muestra el login automáticamente.
// ============================================================

let configPortalCache = [];

window.abrirModalConfigPortal = async function() {
    const modal = document.getElementById('modalConfigPortal');
    const body = document.getElementById('configPortalBody');
    if (!modal || !body) return;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    body.innerHTML = '<div class="loading"><div class="spinner"></div><p>Cargando configuración...</p></div>';

    const result = await window.AUTH.request(window.API_URL + '?action=getConfigCamposPortal');

    if (!result.success) {
        body.innerHTML = `<p class="text-center text-muted" style="padding:24px;">${window.esc(result.message || 'No se pudo cargar la configuración.')}</p>`;
        return;
    }

    configPortalCache = result.data || [];
    renderTablaConfigPortal();
};

window.cerrarModalConfigPortal = function() {
    const modal = document.getElementById('modalConfigPortal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
};

function renderTablaConfigPortal() {
    const body = document.getElementById('configPortalBody');
    if (!body) return;

    const filas = configPortalCache.map(c => `
        <tr>
            <td class="config-portal-item">${c.item}</td>
            <td>${window.esc(c.campo)}</td>
            <td>${window.esc(c.etiqueta)}</td>
            <td class="text-center">
                <input type="checkbox" class="config-portal-chk" data-campo="${window.esc(c.campo)}" data-tipo="editable"
                    ${c.editable ? 'checked' : ''} ${c.bloqueado ? 'disabled title="No editable: es un identificador"' : ''}>
            </td>
            <td class="text-center">
                <input type="checkbox" class="config-portal-chk" data-campo="${window.esc(c.campo)}" data-tipo="visible"
                    ${c.visible ? 'checked' : ''}>
            </td>
        </tr>
    `).join('');

    body.innerHTML = `
        <div class="table-container config-portal-table-wrap">
            <table class="config-portal-table">
                <thead>
                    <tr>
                        <th>N°</th>
                        <th>Campo</th>
                        <th>Característica</th>
                        <th class="text-center">Editar</th>
                        <th class="text-center">Visible</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        </div>
    `;
}

window.guardarConfigCamposPortal = async function() {
    const btn = document.getElementById('btnGuardarConfigPortal');
    const checks = document.querySelectorAll('#configPortalBody .config-portal-chk');

    // Se parte de la caché (mantiene item/etiqueta/bloqueado) y solo
    // se pisan los valores editable/visible con lo que el admin marcó
    // en pantalla.
    const porCampo = {};
    configPortalCache.forEach(c => { porCampo[c.campo] = { CAMPO: c.campo, EDITABLE: c.editable, VISIBLE: c.visible }; });
    checks.forEach(chk => {
        const campo = chk.dataset.campo;
        const tipo = chk.dataset.tipo; // 'editable' | 'visible'
        if (!porCampo[campo]) return;
        porCampo[campo][tipo.toUpperCase()] = chk.checked;
    });

    const payload = Object.values(porCampo);

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

    const url = window.API_URL + '?action=setConfigCamposPortal'
        + '&key=' + encodeURIComponent(window.API_KEY)
        + '&config=' + encodeURIComponent(JSON.stringify(payload));

    const result = await window.AUTH.request(url);

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar cambios'; }

    if (!result.success) {
        window.toast?.('❌ ' + (result.message || 'No se pudo guardar la configuración.'), 'error');
        return;
    }

    configPortalCache = result.data || payload;
    renderTablaConfigPortal();
    window.toast?.('✅ Configuración del portal actualizada', 'success');
};

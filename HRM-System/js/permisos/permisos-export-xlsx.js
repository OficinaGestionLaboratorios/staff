// ============================================================
// PERMISOS-EXPORT-XLSX.JS — Descarga la "BOLETA DE PERMISO PARA
// SALIR DEL CENTRO DE TRABAJO" ya generada por el backend a partir
// de la plantilla real guardada en Drive (boleta_de_permiso.xlsx).
// ============================================================
// El backend (generarPermisoXLSX en Codigo_Permisos.gs) copia la
// plantilla, llena AMBAS copias de la boleta (la hoja trae la misma
// boleta repetida dos veces) y exporta esa copia a Excel.
// ============================================================

window.PermisosExportXLSX = (function() {

    async function generar(registro) {
        if (!registro || !registro.ID_PERMISO) {
            window.toast('⚠️ No se encontró la boleta a exportar', 'warning');
            return false;
        }

        window.toast('⏳ Generando boleta desde la plantilla...', 'info');

        const url = window.API_URL
            + '?action=generarPermisoXLSX'
            + '&idPermiso=' + encodeURIComponent(registro.ID_PERMISO);

        const result = await window.AUTH.request(url);

        if (!result.success) {
            window.toast('⚠️ ' + (result.message || 'No se pudo generar la boleta'), 'warning');
            return false;
        }

        const { filename, mimeType, base64 } = result.data;
        window.descargarArchivoBinario(filename, base64, mimeType);

        window.toast('📥 Boleta generada (2 copias) — falta la firma física del trabajador, el jefe y RRHH', 'success');
        return true;
    }

    return { generar };
})();

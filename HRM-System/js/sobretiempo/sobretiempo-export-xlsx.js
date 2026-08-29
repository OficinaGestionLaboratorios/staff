// ============================================================
// SOBRETIEMPO-EXPORT-XLSX.JS — Descarga el "FORMATO DE SOLICITUD DE
// AUTORIZACIÓN DE TRABAJO EN SOBRETIEMPO, FERIADO Y DESCANSO SEMANAL
// OBLIGATORIO" (código INS-DRH-F-30.01, Anexo 01 del procedimiento
// INS-DRH-P-30) ya generado por el backend a partir de la plantilla
// real guardada en Drive.
// ============================================================
// Antes este archivo reconstruía el formato celda por celda en el
// navegador (con la librería xlsx-js-style). Ahora el backend
// (generarSobretiempoXLSX en Codigo_Sobretiempo.gs) copia la
// plantilla oficial de Drive, llena solo los datos y exporta esa
// copia a Excel — así el resultado es el documento oficial mismo
// (con su logo, bordes y estilos reales), no una reconstrucción.
//
// Sigue el mismo patrón que solicitud-horario.js: pide el archivo al
// backend como base64 (por ser binario) y lo descarga con
// window.descargarArchivoBinario, que ya está definido en ese mismo
// archivo (se carga antes que este en index.html).
// ============================================================

window.SobretiempoExportXLSX = (function() {

    async function generar(registro) {
        if (!registro || !registro.ID_SOLICITUD) {
            window.toast('⚠️ No se encontró la solicitud a exportar', 'warning');
            return false;
        }

        window.toast('⏳ Generando formato desde la plantilla...', 'info');

        const url = window.API_URL
            + '?action=generarSobretiempoXLSX'
            + '&idSolicitud=' + encodeURIComponent(registro.ID_SOLICITUD);

        const result = await window.AUTH.request(url);

        if (!result.success) {
            window.toast('⚠️ ' + (result.message || 'No se pudo generar el formato'), 'warning');
            return false;
        }

        const { filename, mimeType, base64 } = result.data;
        window.descargarArchivoBinario(filename, base64, mimeType);

        window.toast(
            registro.ESTADO === 'Completo'
                ? '📥 Formato generado con las Secciones I, II y III completas — falta la firma física en cada una'
                : '📥 Formato generado — listo para trámite de firmas (Secciones I y II). La Sección III se llena solo si es necesario, al registrar el descanso',
            'success'
        );
        return true;
    }

    return { generar };
})();

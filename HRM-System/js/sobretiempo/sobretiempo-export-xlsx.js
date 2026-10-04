// ============================================================
// SOBRETIEMPO-EXPORT-XLSX.JS — Descarga el "FORMATO DE SOLICITUD DE
// AUTORIZACIÓN DE TRABAJO EN SOBRETIEMPO, FERIADO Y DESCANSO SEMANAL
// OBLIGATORIO" (código INS-DRH-F-30.01, Anexo 01 del procedimiento
// INS-DRH-P-30) ya generado por el backend a partir de la plantilla
// real guardada en Drive.
// ============================================================
// El backend (generarSobretiempoXLSX en Codigo_Sobretiempo.gs) copia
// la plantilla oficial de Drive, llena los datos —incluyendo TODOS
// los descansos registrados hasta el momento, aunque la solicitud
// siga "Descanso parcial"— y exporta esa copia a Excel.
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

        let mensaje;
        if (registro.ESTADO === 'Completo') {
            mensaje = '📥 Formato generado con las Secciones I, II y III completas — falta la firma física en cada una';
        } else if (registro.ESTADO === 'Descanso parcial') {
            mensaje = `📥 Formato generado — descanso parcial registrado (quedan ${registro.HORAS_PENDIENTES} h pendientes). La Sección III refleja lo registrado hasta ahora`;
        } else {
            mensaje = '📥 Formato generado — listo para trámite de firmas (Secciones I y II). La Sección III se completa a medida que se registre el descanso';
        }
        window.toast(mensaje, 'success');
        return true;
    }

    return { generar };
})();

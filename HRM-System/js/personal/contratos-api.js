// ============================================================
// CONTRATOS-API.JS — Comunicación con BD_CONTRATOS (historial)
// ============================================================
window.ContratosAPI = (function () {
    const llamar = url => window.AUTH.request(url);
    function query(payload) {
        return Object.entries(payload || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('');
    }
    const escribir = (accion, payload) =>
        llamar(window.API_URL + `?action=${accion}&key=${encodeURIComponent(window.API_KEY)}` + query(payload));

    return {
        listar: code => llamar(window.API_URL + '?action=listContratos' + (code ? `&code=${encodeURIComponent(code)}` : '')),
        crear: p => escribir('createContrato', p),                 // renovación (nuevo registro)
        corregir: p => escribir('updateContrato', p),              // exige MOTIVO_CORRECCION
        eliminar: p => escribir('deleteContrato', p),              // exige MOTIVO_CORRECCION
        corregirVinculacion: p => escribir('corregirVinculacion', p), // exige MOTIVO_CORRECCION
        migrar: simular => escribir('migrarContratos', { simular: simular ? '1' : '' }) // solo admin
    };
})();

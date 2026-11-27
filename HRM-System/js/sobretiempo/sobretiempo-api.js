// ============================================================
// SOBRETIEMPO-API.JS — Comunicación con BD_SOBRETIEMPO (backend)
// ============================================================
// Mismo patrón que horario-api.js: reutiliza window.API_URL /
// window.API_KEY / window.AUTH.request ya expuestos por js/api.js.
// ============================================================

window.SobretiempoAPI = (function() {

    async function llamar(url) {
        return window.AUTH.request(url);
    }

    function construirQuery(payload) {
        let qs = '';
        Object.entries(payload).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') {
                qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
            }
        });
        return qs;
    }

    // Lista las solicitudes, opcionalmente filtradas por CODE de empleado.
    // v138: las solicitudes ANULADAS no se cargan (ni en la lista ni en informes); su constancia queda en la base de datos.
    async function listar(code) {
        const url = window.API_URL + '?action=listSobretiempo' + (code ? '&code=' + encodeURIComponent(code) : '');
        const res = await llamar(url);
        if (res && res.success && Array.isArray(res.data)) {
            res.data = res.data.filter(r => String(r.ESTADO_AUTORIZACION || '').trim() !== 'Anulado');
        }
        return res;
    }

    async function obtener(idSolicitud) {
        const url = window.API_URL + '?action=getSobretiempo&idSolicitud=' + encodeURIComponent(idSolicitud);
        return llamar(url);
    }

    // Fase 1: crear la solicitud (generación de horas).
    async function crear(payload) {
        const url = window.API_URL + '?action=createSobretiempo&key=' + encodeURIComponent(window.API_KEY) + construirQuery(payload);
        return llamar(url);
    }

    // Editar los datos de Fase 1 (solo posible mientras NO tenga
    // ningún descanso registrado: el backend rechaza la edición
    // apenas exista al menos un descanso, aunque sea parcial).
    async function actualizar(idSolicitud, payload) {
        const url = window.API_URL + '?action=updateSobretiempo&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_SOLICITUD=' + encodeURIComponent(idSolicitud) + construirQuery(payload);
        return llamar(url);
    }

    // Fase 2: AGREGA un nuevo descanso compensatorio (no reemplaza
    // los anteriores). Se puede llamar varias veces hasta cubrir el
    // total de horas generadas.
    async function registrarDescanso(payload) {
        const url = window.API_URL + '?action=registrarDescansoSobretiempo&key=' + encodeURIComponent(window.API_KEY) + construirQuery(payload);
        return llamar(url);
    }

    // Quita un descanso ya registrado (por su índice dentro del
    // arreglo). Sus horas vuelven a quedar pendientes.
    async function eliminarDescanso(idSolicitud, indice) {
        const url = window.API_URL + '?action=eliminarDescansoSobretiempo&key=' + encodeURIComponent(window.API_KEY)
            + '&idSolicitud=' + encodeURIComponent(idSolicitud) + '&indice=' + encodeURIComponent(indice);
        return llamar(url);
    }

    async function eliminar(idSolicitud) {
        const url = window.API_URL + '?action=deleteSobretiempo&key=' + encodeURIComponent(window.API_KEY) + '&idSolicitud=' + encodeURIComponent(idSolicitud);
        return llamar(url);
    }

    async function obtenerBanco(code) {
        const url = window.API_URL + '?action=obtenerBancoHoras&code=' + encodeURIComponent(code || '');
        return llamar(url);
    }

    async function crearSolicitudBanco(payload) {
        const url = window.API_URL + '?action=crearSolicitudDescansoBanco&key=' + encodeURIComponent(window.API_KEY) + construirQuery(payload);
        return llamar(url);
    }

    // v139: los descansos ANULADA (consecuencia de anular su solicitud de origen) tampoco se cargan.
    async function listarSolicitudesBanco(code) {
        const url = window.API_URL + '?action=listarSolicitudesDescansoBanco' + (code ? '&code=' + encodeURIComponent(code) : '');
        const res = await llamar(url);
        if (res && res.success && Array.isArray(res.data)) {
            res.data = res.data.filter(x => String(x.ESTADO || '').trim().toUpperCase() !== 'ANULADA');
        }
        return res;
    }

    // Control de Asistencia confirma que el descanso DC-xxxxxx ya se
    // tomó: pasa su ESTADO a COMPLETADO y libera las horas del banco
    // (de COMPROMETIDO a UTILIZADO).
    async function completarSolicitudBanco(idSolicitudDescanso) {
        const url = window.API_URL + '?action=completarDescansoBanco&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_SOLICITUD_DESCANSO=' + encodeURIComponent(idSolicitudDescanso);
        return llamar(url);
    }

    // v84: editar (fechas, observaciones, destinatario) y eliminar una solicitud de descanso PENDIENTE.
    async function actualizarSolicitudBanco(id, payload) {
        const url = window.API_URL + '?action=updateSolicitudDescansoBanco&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_SOLICITUD_DESCANSO=' + encodeURIComponent(id) + construirQuery(payload);
        return llamar(url);
    }
    async function eliminarSolicitudBanco(id) {
        const url = window.API_URL + '?action=deleteSolicitudDescansoBanco&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_SOLICITUD_DESCANSO=' + encodeURIComponent(id);
        return llamar(url);
    }

    // Cambia el estado de aprobación (Pendiente de aprobación → Aprobado,
    // o Rechazado). Solo las solicitudes
    // Autorizadas suman horas al banco.
    async function cambiarAutorizacion(idSolicitud, estado, nota) {
        const url = window.API_URL + '?action=cambiarAutorizacionSobretiempo&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_SOLICITUD=' + encodeURIComponent(idSolicitud)
            + '&ESTADO_AUTORIZACION=' + encodeURIComponent(estado)
            + (nota ? '&NOTA=' + encodeURIComponent(nota) : '');
        return llamar(url);
    }

    // v125 — Sección III del formato: Control de Asistencia verifica la ejecución
    // (horas efectivas) e identifica si corresponde compensación o pago.
    async function registrarVerificacion(idSolicitud, horasEfectivas, destino, observaciones) {
        const url = window.API_URL + '?action=registrarVerificacionSobretiempo&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_SOLICITUD=' + encodeURIComponent(idSolicitud)
            + '&HORAS_EFECTIVAS=' + encodeURIComponent(horasEfectivas)
            + '&DESTINO=' + encodeURIComponent(destino)
            + (observaciones ? '&OBSERVACIONES=' + encodeURIComponent(observaciones) : '');
        return llamar(url);
    }

    // v126 — anular una solicitud con motivo (libera sus horas del banco y deja constancia).
    async function anular(idSolicitud, motivo) {
        const url = window.API_URL + '?action=anularSolicitudSobretiempo&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_SOLICITUD=' + encodeURIComponent(idSolicitud)
            + '&MOTIVO=' + encodeURIComponent(motivo);
        return llamar(url);
    }

    // v128 — pasos previos a SRYBS: 'CONFORMIDAD' (firma y huella del trabajador) y 'REMISION' (correo o físico).
    async function registrarPaso(idSolicitud, paso, medio) {
        const url = window.API_URL + '?action=registrarPasoSobretiempo&key=' + encodeURIComponent(window.API_KEY)
            + '&ID_SOLICITUD=' + encodeURIComponent(idSolicitud)
            + '&PASO=' + encodeURIComponent(paso)
            + (medio ? '&MEDIO=' + encodeURIComponent(medio) : '');
        return llamar(url);
    }

    return { registrarPaso, anular, registrarVerificacion, listar, obtener, crear, actualizar, registrarDescanso, eliminarDescanso, eliminar, obtenerBanco, crearSolicitudBanco, listarSolicitudesBanco, completarSolicitudBanco, actualizarSolicitudBanco, eliminarSolicitudBanco, cambiarAutorizacion };
})();

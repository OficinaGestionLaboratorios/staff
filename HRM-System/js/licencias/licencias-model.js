// ============================================================
// LICENCIAS-MODEL.JS — Modelo del módulo Licencias
// ============================================================
window.LicenciasModel = (function () {
    const TIPOS = [
        { value: 'Licencia sin goce de haber por motivos personales', label: 'Sin goce de haber – motivos personales', icono: 'fa-user-clock' }
    ];

    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','setiembre','octubre','noviembre','diciembre'];

    function nombreCompleto(personal) {
        if (!personal) return '';
        return [personal.NOMBRES, personal.APE_PATERNO, personal.APE_MATERNO].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    }

    function fechaTexto(fechaISO) {
        if (!fechaISO) return '';
        const p = String(fechaISO).slice(0, 10).split('-');
        if (p.length !== 3) return String(fechaISO);
        return `${parseInt(p[2], 10)} de ${MESES[parseInt(p[1], 10)-1] || ''} del ${p[0]}`;
    }

    function construirPayload({ personal, area, fechaSolicitud, tipoLicencia, fechaInicio, fechaFin, motivo, anexos }) {
        return {
            CODE: personal?.CODE || '',
            ID_PERSONAL: personal?.ID_PERSONAL || '',
            EMPLEADO: nombreCompleto(personal),
            DNI: personal?.DNI || '',
            DIRECCION: personal?.DIRECCION || '',
            EMAIL: personal?.EMAIL_INSTITUCIONAL || '',
            TELEFONO: personal?.TELEFONO || '',
            CARGO: personal?.CARGO || '',
            AREA: (area || '').trim(),
            FECHA_SOLICITUD: fechaSolicitud || '',
            TIPO_LICENCIA: tipoLicencia || TIPOS[0].value,
            FECHA_INICIO: fechaInicio || '',
            FECHA_FIN: fechaFin || '',
            MOTIVO: (motivo || '').trim(),
            ANEXOS: (anexos || '').trim()
        };
    }

    function calcularDias(inicio, fin) {
        if (!inicio || !fin) return 0;
        const a = new Date(`${inicio}T00:00:00`);
        const b = new Date(`${fin}T00:00:00`);
        const d = Math.round((b - a) / 86400000);
        return d >= 0 ? d + 1 : 0;
    }

    return { TIPOS, MESES, nombreCompleto, fechaTexto, construirPayload, calcularDias };
})();

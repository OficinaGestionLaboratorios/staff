// ============================================================
// LICENCIAS-VALIDACION.JS
// ============================================================
window.LicenciasValidacion = (function () {
    function validar(datos) {
        const errores = [];
        if (!datos.personal?.CODE) errores.push('empleado');
        if (!datos.fechaSolicitud) errores.push('fecha de solicitud');
        if (!datos.fechaInicio) errores.push('fecha de inicio');
        if (!datos.fechaFin) errores.push('fecha de fin');
        if (datos.fechaInicio && datos.fechaFin && datos.fechaFin < datos.fechaInicio) errores.push('la fecha de fin no puede ser anterior a la fecha de inicio');
        if (!datos.area?.trim()) errores.push('área / programa');
        if (!datos.motivo?.trim()) errores.push('motivo');
        if (!datos.personal?.DNI) errores.push('DNI del trabajador');
        return errores;
    }
    return { validar };
})();

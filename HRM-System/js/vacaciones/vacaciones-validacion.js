// ============================================================
// VACACIONES-VALIDACION.JS — Reglas de negocio del formulario
// ============================================================
// Valida en el navegador ANTES de llamar al backend (que igual debe
// volver a validar), solo para dar feedback inmediato al usuario.
// ============================================================

window.VacacionesValidacion = (function() {

    function validarFase1({ personal, periodoVacacional, diasAsignados, fechaLimite }) {
        const errores = [];
        if (!personal) errores.push('selecciona un empleado');
        if (!periodoVacacional || !periodoVacacional.trim()) errores.push('período vacacional (ej. "2024-2025")');
        const dias = parseInt(diasAsignados, 10);
        if (!dias || dias <= 0) errores.push('días asignados (debe ser mayor a 0)');
        if (dias > 30) errores.push('días asignados no puede superar 30');
        if (!fechaLimite) errores.push('fecha límite de goce');
        return errores;
    }

    function validarFase2({ fechaInicio, fechaFin, diasTomados, diasPendientes }) {
        const errores = [];
        if (!fechaInicio) errores.push('fecha de inicio del goce');
        if (!fechaFin) errores.push('fecha de fin del goce');
        if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
            errores.push('la fecha de fin no puede ser anterior a la fecha de inicio');
        }
        const dias = parseInt(diasTomados, 10);
        if (!dias || dias <= 0) errores.push('cantidad de días del tramo');
        if (typeof diasPendientes === 'number' && dias > diasPendientes) {
            errores.push(`solo quedan ${diasPendientes} día(s) pendientes en este período`);
        }
        return errores;
    }

    return { validarFase1, validarFase2 };
})();

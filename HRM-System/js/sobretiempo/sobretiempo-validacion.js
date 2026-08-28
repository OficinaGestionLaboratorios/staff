// ============================================================
// SOBRETIEMPO-VALIDACION.JS — Reglas de negocio del formulario
// ============================================================
// Valida en el navegador ANTES de llamar al backend (que igual
// vuelve a validar, ver Codigo_Sobretiempo.gs), solo para dar
// feedback inmediato al usuario. Refleja las condiciones básicas
// del procedimiento INS-DRH-P-30 (punto 6).
// ============================================================

window.SobretiempoValidacion = (function() {

    function validarFase1({ personal, tipoTrabajo, fechaEjecucion, horaInicio, horaFin, actividades, justificacion }) {
        const errores = [];
        if (!personal) errores.push('selecciona un empleado');
        if (!tipoTrabajo) errores.push('tipo de trabajo');
        if (!fechaEjecucion) errores.push('fecha de ejecución de labores');
        if (!horaInicio) errores.push('hora de inicio');
        if (!horaFin) errores.push('hora de fin');
        if (horaInicio && horaFin && horaInicio === horaFin) errores.push('la hora de inicio y fin no pueden ser iguales');
        if (!actividades || !actividades.trim()) errores.push('actividades a realizar');
        if (!justificacion || !justificacion.trim()) errores.push('justificación de la necesidad');
        return errores;
    }

    function validarFase2({ fechaDescanso, fechaEjecucion, totalHorasEfectivas }) {
        const errores = [];
        if (!fechaDescanso) errores.push('fecha de descanso compensatorio');
        // 6.1.1 / 6.2.2: el descanso compensatorio es posterior (o el
        // mismo día, en casos límite) a la fecha en que se generó el
        // sobretiempo — nunca anterior.
        if (fechaDescanso && fechaEjecucion && fechaDescanso < fechaEjecucion) {
            errores.push('la fecha de descanso no puede ser anterior a la fecha en que se generaron las horas');
        }
        if (!totalHorasEfectivas || parseFloat(totalHorasEfectivas) <= 0) errores.push('total de horas efectivas');
        return errores;
    }

    return { validarFase1, validarFase2 };
})();

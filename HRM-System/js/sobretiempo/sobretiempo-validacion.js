// ============================================================
// SOBRETIEMPO-VALIDACION.JS — Reglas de negocio del formulario
// ============================================================
// Valida en el navegador ANTES de llamar al backend (que igual
// vuelve a validar, ver Codigo_Sobretiempo.gs), solo para dar
// feedback inmediato al usuario. Refleja las condiciones básicas
// del procedimiento INS-DRH-P-30 (punto 6).
// ============================================================

window.SobretiempoValidacion = (function() {

    // El refrigerio es opcional, pero si se indica una hora debe
    // indicarse también la otra (no tiene sentido un refrigerio a medias).
    function validarParRefrigerio(refrigerioInicio, refrigerioFin, etiqueta) {
        if ((refrigerioInicio && !refrigerioFin) || (!refrigerioInicio && refrigerioFin)) {
            return `debe completar el inicio y la salida ${etiqueta}, o dejar ambos vacíos`;
        }
        return null;
    }

    function validarFase1({ personal, tipoTrabajo, fechaEjecucion, horaInicio, horaFin, refrigerioInicio, refrigerioFin, actividades, justificacion }) {
        const errores = [];
        if (!personal) errores.push('selecciona un empleado');
        if (!tipoTrabajo) errores.push('tipo de trabajo');
        if (!fechaEjecucion) errores.push('fecha de ejecución de labores');
        if (!horaInicio) errores.push('hora de inicio');
        if (!horaFin) errores.push('hora de fin');
        if (horaInicio && horaFin && horaInicio === horaFin) errores.push('la hora de inicio y fin no pueden ser iguales');

        const errorRefrigerio = validarParRefrigerio(refrigerioInicio, refrigerioFin, 'del refrigerio');
        if (errorRefrigerio) errores.push(errorRefrigerio);

        // El refrigerio descontado no puede "comerse" toda la jornada
        // (o más): eso dejaría 0 horas efectivas generadas.
        if (horaInicio && horaFin && horaInicio !== horaFin && refrigerioInicio && refrigerioFin) {
            const total = parseFloat(window.SobretiempoModel.calcularTotalHoras(horaInicio, horaFin, refrigerioInicio, refrigerioFin));
            if (!(total > 0)) errores.push('el refrigerio no puede ser igual o mayor a la jornada trabajada');
        }

        if (!actividades || !actividades.trim()) errores.push('actividades a realizar');
        if (!justificacion || !justificacion.trim()) errores.push('justificación de la necesidad');
        return errores;
    }

    function validarFase2({ fechaDescanso, fechaEjecucion, horaInicioDescanso, horaFinDescanso, refrigerioDescansoInicio, refrigerioDescansoFin }) {
        const errores = [];
        if (!fechaDescanso) errores.push('fecha de descanso compensatorio');
        // 6.1.1 / 6.2.2: el descanso compensatorio es posterior (o el
        // mismo día, en casos límite) a la fecha en que se generó el
        // sobretiempo — nunca anterior.
        if (fechaDescanso && fechaEjecucion && fechaDescanso < fechaEjecucion) {
            errores.push('la fecha de descanso no puede ser anterior a la fecha en que se generaron las horas');
        }

        if (!horaInicioDescanso) errores.push('hora de inicio del descanso');
        if (!horaFinDescanso) errores.push('hora de fin del descanso');
        if (horaInicioDescanso && horaFinDescanso && horaInicioDescanso === horaFinDescanso) {
            errores.push('la hora de inicio y fin del descanso no pueden ser iguales');
        }

        const errorRefrigerio = validarParRefrigerio(refrigerioDescansoInicio, refrigerioDescansoFin, 'del refrigerio del descanso');
        if (errorRefrigerio) errores.push(errorRefrigerio);

        if (horaInicioDescanso && horaFinDescanso && horaInicioDescanso !== horaFinDescanso) {
            const total = parseFloat(window.SobretiempoModel.calcularTotalHoras(horaInicioDescanso, horaFinDescanso, refrigerioDescansoInicio, refrigerioDescansoFin));
            if (!(total > 0)) errores.push('el total de horas efectivas de descanso debe ser mayor a cero (revisa el refrigerio)');
        }

        return errores;
    }

    return { validarFase1, validarFase2 };
})();

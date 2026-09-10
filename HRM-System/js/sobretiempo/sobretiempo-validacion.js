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

    // "fechas" es el arreglo que lee la tabla (hasta MAX_FECHAS filas):
    // cada una con fecha, horaInicio, horaFin, refrigerioInicio,
    // refrigerioFin.
    function validarFase1({ personal, tipoTrabajo, fechas, actividades, justificacion }) {
        const errores = [];
        if (!personal) errores.push('selecciona un empleado');
        if (!tipoTrabajo) errores.push('tipo de trabajo');

        const lista = fechas || [];
        const M = window.SobretiempoModel;

        if (lista.length === 0) {
            errores.push('debe indicar al menos una fecha de ejecución');
        } else {
            if (lista.length > M.MAX_FECHAS) {
                errores.push(`no se pueden registrar más de ${M.MAX_FECHAS} fechas por solicitud`);
            }

            const vistas = new Set();
            lista.forEach((f, i) => {
                const n = i + 1;
                if (!f.fecha) errores.push(`fecha #${n}: falta la fecha`);
                if (!f.horaInicio) errores.push(`fecha #${n}: falta la hora de inicio`);
                if (!f.horaFin) errores.push(`fecha #${n}: falta la hora de fin`);
                if (f.horaInicio && f.horaFin && f.horaInicio === f.horaFin) {
                    errores.push(`fecha #${n}: la hora de inicio y fin no pueden ser iguales`);
                }

                const errorRefrigerio = validarParRefrigerio(f.refrigerioInicio, f.refrigerioFin, `del refrigerio de la fecha #${n}`);
                if (errorRefrigerio) errores.push(errorRefrigerio);

                if (f.horaInicio && f.horaFin && f.horaInicio !== f.horaFin && f.refrigerioInicio && f.refrigerioFin) {
                    const total = parseFloat(M.calcularTotalHoras(f.horaInicio, f.horaFin, f.refrigerioInicio, f.refrigerioFin));
                    if (!(total > 0)) errores.push(`fecha #${n}: el refrigerio no puede ser igual o mayor a la jornada trabajada`);
                }

                if (f.fecha) {
                    if (vistas.has(f.fecha)) errores.push(`la fecha ${f.fecha} está repetida (fecha #${n})`);
                    vistas.add(f.fecha);
                }
            });
        }

        if (!actividades || !actividades.trim()) errores.push('actividades a realizar');
        if (!justificacion || !justificacion.trim()) errores.push('justificación de la necesidad');
        return errores;
    }

    // Sigue comparando contra UNA sola fecha de referencia
    // (fechaEjecucion = la más reciente de las fechas de la Fase 1,
    // ver armarObjetoSobretiempo_ en el backend): el descanso
    // compensatorio nunca puede ser anterior a NINGUNA fecha trabajada.
    function validarFase2({ fechaDescanso, fechaEjecucion, horaInicioDescanso, horaFinDescanso, refrigerioDescansoInicio, refrigerioDescansoFin }) {
        const errores = [];
        if (!fechaDescanso) errores.push('fecha de descanso compensatorio');
        if (fechaDescanso && fechaEjecucion && fechaDescanso < fechaEjecucion) {
            errores.push('la fecha de descanso no puede ser anterior a la última fecha en que se generaron horas');
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

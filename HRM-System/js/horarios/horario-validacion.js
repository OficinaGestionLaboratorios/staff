// ============================================================
// HORARIO-VALIDACION.JS — Reglas de validación del módulo Horarios
// ============================================================
// Funciones puras que devuelven mensajes de error (strings). No
// tocan el DOM ni el API; solo reciben datos y responden si son
// válidos o no. Así horario-ui.js puede mostrarlos donde convenga.
// ============================================================

window.HorarioValidacion = (function() {

    // Valida un solo día. `dia` = { dia, activo, ingreso, inicioRef, finRef, salida }.
    // Devuelve un mensaje de error o null si está OK. Si el día no
    // está activo, no se valida (se ignora).
    function validarDia(dia) {
        if (!dia.activo) return null;

        if (!dia.ingreso || !dia.salida) {
            return `${dia.dia}: falta ingreso o salida`;
        }
        if ((dia.inicioRef && !dia.finRef) || (!dia.inicioRef && dia.finRef)) {
            return `${dia.dia}: falta inicio o fin de refrigerio (ambos o ninguno)`;
        }

        const minutos = window.HorarioModel.calcularMinutosDia(dia);
        if (minutos <= 0) {
            return `${dia.dia}: el refrigerio no puede ser mayor o igual a la jornada`;
        }

        return null;
    }

    // Valida el grupo completo antes de guardar.
    // `grupo` = { fechaInicio, fechaFin, dias: [...] }
    // Devuelve un array de mensajes de error (vacío si todo está bien).
    function validarGrupo(grupo) {
        const errores = [];

        if (!grupo.fechaInicio) {
            errores.push('la fecha de inicio de vigencia');
        }
        if (grupo.fechaFin && grupo.fechaInicio && grupo.fechaFin < grupo.fechaInicio) {
            errores.push('la fecha de fin no puede ser anterior a la fecha de inicio');
        }

        const diasActivos = grupo.dias.filter(d => d.activo);
        if (diasActivos.length === 0) {
            errores.push('al menos un día activo con horario');
        }

        diasActivos.forEach(dia => {
            const error = validarDia(dia);
            if (error) errores.push(error);
        });

        return errores;
    }

    return { validarDia, validarGrupo };
})();

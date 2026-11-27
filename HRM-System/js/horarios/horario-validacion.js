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

        const M = window.HorarioModel;
        if (!grupo.tipo) errores.push('el tipo de horario (pestaña Permanente o Temporal)');
        if (!grupo.solicitadoPor) errores.push('el motivo del cambio (social o técnico)');
        if (!grupo.fechaSolicitud) errores.push('la fecha de la solicitud a la DRH');
        if (!grupo.representante) errores.push('el representante que firma la modificación del horario');
        // 5.2 Horario temporal = "con cierto periodo de vigencia": el rango es obligatorio.
        if (grupo.tipo === 'Temporal' && !grupo.fechaFin) {
            errores.push('la fecha de fin (obligatoria en horario temporal)');
        }
        if (!(grupo.sustentos || []).length && !String(grupo.detalle || '').trim()) {
            errores.push('el sustento: marque al menos un motivo de la solicitud o escriba el detalle');
        }
        // (v133) El máximo de 6 días corridos del temporal ya no bloquea: se avisa en advertenciasProcedimiento.
        // Coherencia fechas ↔ días: en un temporal los días marcados deben ocurrir dentro del rango
        // (si el rango es un solo martes, el horario solo puede ser martes).
        if (grupo.tipo === 'Temporal' && grupo.fechaInicio && grupo.fechaFin && grupo.fechaFin >= grupo.fechaInicio) {
            const permitidos = M.diasEnRango(grupo.fechaInicio, grupo.fechaFin);
            const fuera = grupo.dias.filter(d => d.activo && permitidos && !permitidos.has(d.dia)).map(d => d.dia);
            if (fuera.length) errores.push(`los días ${fuera.join(', ')} no ocurren dentro del rango de fechas (el rango solo incluye: ${Array.from(permitidos).join(', ')})`);
        }
        // (v144) La anticipación mínima (6.2 / 6.3) ya NO bloquea: se avisa en avisoAnticipacion()
        // y el usuario decide si registra de todos modos.

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

    // 6.6 El horario propuesto debe respetar el refrigerio mínimo y la jornada máxima semanal.
    // Devuelve advertencias (strings) — el usuario decide si continúa.
    function advertenciasProcedimiento(dias, ctx) {
        const M = window.HorarioModel, R = M.REGLAS, avisos = [];
        // Temporal de más de 6 días corridos (inicio y fin incluidos): solo alerta, no impide registrar.
        if (ctx && ctx.tipo === 'Temporal' && ctx.fechaInicio && ctx.fechaFin && ctx.fechaFin >= ctx.fechaInicio) {
            const corridos = M.diasEntreISO(ctx.fechaInicio, ctx.fechaFin) + 1;
            if (corridos > R.MAX_DIAS_TEMPORAL) avisos.push(`el horario temporal tiene ${corridos} días corridos (máximo recomendado ${R.MAX_DIAS_TEMPORAL}); si necesita más tiempo, considere registrar un horario permanente`);
        }
        // Coherencia vigente ↔ propuesto (temporal): cada día propuesto debe tener su par en el vigente.
        if (ctx && ctx.tipo === 'Temporal' && ctx.vigente) {
            const vig = new Set((ctx.vigente.DIAS || []).map(d => d.dia));
            dias.filter(d => d.activo && !vig.has(d.dia)).forEach(d => avisos.push(`${d.dia}: el horario vigente no tiene ese día (en la solicitud figurará "sin horario")`));
        }
        dias.filter(d => d.activo).forEach(d => {
            const ref = (d.inicioRef && d.finRef) ? M.diferenciaMinutos(d.inicioRef, d.finRef) : 0;
            if (ref < R.MIN_REFRIGERIO_MIN) avisos.push(`${d.dia}: refrigerio de ${ref} min (mínimo ${R.MIN_REFRIGERIO_MIN} min)`);
        });
        const { totalMin } = M.calcularResumenSemana(dias);
        if (totalMin / 60 > R.MAX_HORAS_SEMANA) avisos.push(`jornada semanal de ${M.minutosATexto(totalMin)} h (máximo ${R.MAX_HORAS_SEMANA} h)`);
        return avisos;
    }

    // (v144) 6.2 / 6.3 Anticipación mínima. Solo al registrar un cambio NUEVO. NO bloquea: devuelve el texto
    // del aviso (o '' si cumple) para pedir confirmación y continuar el proceso.
    function avisoAnticipacion(grupo) {
        const M = window.HorarioModel;
        if (!(grupo && grupo.esNuevo && grupo.tipo && grupo.solicitadoPor && grupo.fechaSolicitud && grupo.fechaInicio)) return '';
        const req = M.anticipacionRequerida(grupo);
        const dias = M.diasEntreISO(grupo.fechaSolicitud, grupo.fechaInicio);
        if (dias === null || dias >= req.dias) return '';
        return `No cumple la anticipación del procedimiento: el inicio debe ser al menos ${req.dias} día(s) calendario después de la solicitud (hay ${Math.max(dias, 0)}). ${req.regla}.`;
    }

    return { validarDia, validarGrupo, advertenciasProcedimiento, avisoAnticipacion };
})();

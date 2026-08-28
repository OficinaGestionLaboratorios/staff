// ============================================================
// SOBRETIEMPO-MODEL.JS — Datos y cálculos puros del módulo Sobretiempo
// ============================================================
// Mismo criterio que horario-model.js: nada aquí toca el DOM, solo
// estructuras de datos y cálculos, para que sobretiempo-ui.js y
// sobretiempo.js los reutilicen sin duplicar lógica.
//
// El flujo tiene DOS fases (ver INS-DRH-P-30, Sección I y III del
// formato INS-DRH-F-30.01):
//   Fase 1 "Generación de horas" → registra el jefe inmediato cuando
//   se autoriza/ejecuta el sobretiempo, feriado o DSO.
//   Fase 2 "Registro del descanso" → registra Control de Asistencia
//   cuando el trabajador efectivamente toma su descanso compensatorio.
//   Solo entonces la solicitud queda "Completa" y exportable.
// ============================================================

window.SobretiempoModel = (function() {

    const TIPOS = [
        { value: 'Sobretiempo',                     label: 'Trabajo en sobretiempo' },
        { value: 'Feriado',                          label: 'Trabajo en día feriado' },
        { value: 'Descanso Semanal Obligatorio',     label: 'Trabajo en día de descanso semanal obligatorio' }
    ];

    // Mismos badges de estado que ya existen en css/styles.css
    // (.badge-estado.estado-programado / .estado-vigente), reutilizados
    // tal cual para no duplicar CSS: "Pendiente" se ve como Programado
    // (azul, "en trámite") y "Completo" como Vigente (verde, "listo").
    const ESTADO_INFO = {
        'Pendiente de descanso': { clase: 'estado-programado', icono: 'fa-hourglass-half' },
        'Completo':              { clase: 'estado-vigente',    icono: 'fa-check-circle' }
    };

    function horaAMinutos(hhmm) {
        if (!hhmm) return null;
        const [h, m] = hhmm.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return null;
        return h * 60 + m;
    }

    // Igual que HorarioModel.diferenciaMinutos: si la hora fin es <=
    // que la de inicio, se asume que el turno cruza la medianoche.
    function calcularTotalHoras(horaInicio, horaFin) {
        const ini = horaAMinutos(horaInicio);
        const fin = horaAMinutos(horaFin);
        if (ini === null || fin === null) return '0.00';
        let diff = fin - ini;
        if (diff <= 0) diff += 24 * 60;
        return (diff / 60).toFixed(2);
    }

    function fechaATextoLegible(fechaISO) {
        if (!fechaISO) return '';
        const soloFecha = String(fechaISO).slice(0, 10);
        const [y, m, d] = soloFecha.split('-');
        if (!y || !m || !d) return fechaISO;
        return `${d}/${m}/${y}`;
    }

    // Arma el payload de Fase 1 (creación o edición de la solicitud).
    function construirPayloadFase1({ personal, dependencia, tipoTrabajo, fechaEjecucion, horaInicio, horaFin, actividades, justificacion, idSolicitud }) {
        const payload = {
            CODE: personal.CODE,
            ID_PERSONAL: personal.ID_PERSONAL,
            EMPLEADO: window.formatearPersonalSeleccionado(personal),
            DEPENDENCIA: (dependencia || '').trim(),
            TIPO_TRABAJO: tipoTrabajo,
            FECHA_EJECUCION: fechaEjecucion,
            HORA_INICIO: horaInicio,
            HORA_FIN: horaFin,
            TOTAL_HORAS: calcularTotalHoras(horaInicio, horaFin),
            ACTIVIDADES: (actividades || '').trim(),
            JUSTIFICACION: (justificacion || '').trim()
        };
        if (idSolicitud) payload.ID_SOLICITUD = idSolicitud;
        return payload;
    }

    // Arma el payload de Fase 2 (registrar el descanso compensatorio).
    function construirPayloadFase2({ idSolicitud, fechaDescanso, totalHorasEfectivas, observaciones }) {
        return {
            ID_SOLICITUD: idSolicitud,
            FECHA_DESCANSO: fechaDescanso,
            TOTAL_HORAS_EFECTIVAS: totalHorasEfectivas,
            OBSERVACIONES_DESCANSO: (observaciones || '').trim()
        };
    }

    return {
        TIPOS, ESTADO_INFO,
        horaAMinutos, calcularTotalHoras, fechaATextoLegible,
        construirPayloadFase1, construirPayloadFase2
    };
})();

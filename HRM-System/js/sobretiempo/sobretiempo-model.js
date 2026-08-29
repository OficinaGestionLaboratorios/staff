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
//   Solo entonces la solicitud queda "Completa" (el documento ya se
//   puede exportar desde la Fase 1, para el trámite de firmas; ver
//   sobretiempo-export-xlsx.js).
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
    function diferenciaMinutos(horaInicio, horaFin) {
        const ini = horaAMinutos(horaInicio);
        const fin = horaAMinutos(horaFin);
        if (ini === null || fin === null) return null;
        let diff = fin - ini;
        if (diff <= 0) diff += 24 * 60;
        return diff;
    }

    // Horas EFECTIVAS = jornada total (inicio→fin) menos el refrigerio
    // (inicio→salida de refrigerio), si se registró. El refrigerio es
    // opcional: si no se indican ambas horas, no se descuenta nada.
    // Se usa tanto para "horas efectivas generadas" (Fase 1) como para
    // "horas efectivas de descanso" (Fase 2) — mismo cálculo, distinto
    // par de horas.
    function calcularTotalHoras(horaInicio, horaFin, refrigerioInicio, refrigerioFin) {
        const diff = diferenciaMinutos(horaInicio, horaFin);
        if (diff === null) return '0.00';
        const refrigerio = diferenciaMinutos(refrigerioInicio, refrigerioFin) || 0;
        const efectivo = Math.max(diff - refrigerio, 0);
        return (efectivo / 60).toFixed(2);
    }

    // Duración del refrigerio en horas, para mostrarla aparte en el
    // formulario (ej. "0.50 h de refrigerio descontadas").
    function calcularDuracionRefrigerio(refrigerioInicio, refrigerioFin) {
        const diff = diferenciaMinutos(refrigerioInicio, refrigerioFin);
        return diff === null ? '0.00' : (diff / 60).toFixed(2);
    }

    function fechaATextoLegible(fechaISO) {
        if (!fechaISO) return '';
        const soloFecha = String(fechaISO).slice(0, 10);
        const [y, m, d] = soloFecha.split('-');
        if (!y || !m || !d) return fechaISO;
        return `${d}/${m}/${y}`;
    }

    // Arma el payload de Fase 1 (creación o edición de la solicitud).
    // TOTAL_HORAS ya sale como "horas efectivas generadas": la jornada
    // (horaInicio→horaFin) con el refrigerio descontado.
    function construirPayloadFase1({ personal, dependencia, tipoTrabajo, fechaEjecucion, horaInicio, horaFin, refrigerioInicio, refrigerioFin, actividades, justificacion, idSolicitud }) {
        const payload = {
            CODE: personal.CODE,
            ID_PERSONAL: personal.ID_PERSONAL,
            EMPLEADO: window.formatearPersonalSeleccionado(personal),
            DEPENDENCIA: (dependencia || '').trim(),
            TIPO_TRABAJO: tipoTrabajo,
            FECHA_EJECUCION: fechaEjecucion,
            HORA_INICIO: horaInicio,
            HORA_FIN: horaFin,
            REFRIGERIO_INICIO: refrigerioInicio || '',
            REFRIGERIO_FIN: refrigerioFin || '',
            TOTAL_HORAS: calcularTotalHoras(horaInicio, horaFin, refrigerioInicio, refrigerioFin),
            ACTIVIDADES: (actividades || '').trim(),
            JUSTIFICACION: (justificacion || '').trim()
        };
        if (idSolicitud) payload.ID_SOLICITUD = idSolicitud;
        return payload;
    }

    // Arma el payload de Fase 2 (registrar el descanso compensatorio).
    // TOTAL_HORAS_EFECTIVAS sale igual que en Fase 1: jornada de
    // descanso (horaInicioDescanso→horaFinDescanso) menos su propio
    // refrigerio, si Control de Asistencia registró uno.
    function construirPayloadFase2({ idSolicitud, fechaDescanso, horaInicioDescanso, horaFinDescanso, refrigerioDescansoInicio, refrigerioDescansoFin, observaciones }) {
        return {
            ID_SOLICITUD: idSolicitud,
            FECHA_DESCANSO: fechaDescanso,
            HORA_INICIO_DESCANSO: horaInicioDescanso || '',
            HORA_FIN_DESCANSO: horaFinDescanso || '',
            REFRIGERIO_DESCANSO_INICIO: refrigerioDescansoInicio || '',
            REFRIGERIO_DESCANSO_FIN: refrigerioDescansoFin || '',
            TOTAL_HORAS_EFECTIVAS: calcularTotalHoras(horaInicioDescanso, horaFinDescanso, refrigerioDescansoInicio, refrigerioDescansoFin),
            OBSERVACIONES_DESCANSO: (observaciones || '').trim()
        };
    }

    return {
        TIPOS, ESTADO_INFO,
        horaAMinutos, calcularTotalHoras, calcularDuracionRefrigerio, fechaATextoLegible,
        construirPayloadFase1, construirPayloadFase2
    };
})();

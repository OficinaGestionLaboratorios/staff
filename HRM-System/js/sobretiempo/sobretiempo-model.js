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
//   se autoriza/ejecuta el sobretiempo, feriado o DSO. Admite hasta
//   MAX_FECHAS fechas dentro de la misma solicitud (igual que el
//   formato oficial permite hasta 5 filas de fecha/hora).
//   Fase 2 "Registro del descanso" → registra Control de Asistencia
//   cada vez que el trabajador toma parte (o todo) de su descanso
//   compensatorio. Se puede registrar VARIAS veces para la misma
//   solicitud (ej. 21h generadas, 12h tomadas hoy, 9h pendientes
//   para otro día) — el ESTADO pasa de "Pendiente de descanso" a
//   "Descanso parcial" y recién a "Completo" cuando la suma de
//   todos los descansos cubre el total generado.
// ============================================================

window.SobretiempoModel = (function() {

    // Igual al límite de filas de fecha/hora que trae el formato
    // oficial (filas 13 a 17 de INS-DRH-F-30.01).
    const MAX_FECHAS = 5;

    const TIPOS = [
        { value: 'Sobretiempo',                     label: 'Trabajo en sobretiempo' },
        { value: 'Feriado',                          label: 'Trabajo en día feriado' },
        { value: 'Descanso Semanal Obligatorio',     label: 'Trabajo en día de descanso semanal obligatorio' }
    ];

    // "Descanso parcial" usa una clase de badge nueva (amber, ver
    // css/styles.css: .badge-estado.estado-parcial) para distinguirse
    // claramente de "Pendiente" (azul) y "Completo" (verde).
    const ESTADO_INFO = {
        'Pendiente de descanso': { clase: 'estado-programado', icono: 'fa-hourglass-half' },
        'Descanso parcial':      { clase: 'estado-parcial',    icono: 'fa-adjust' },
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
    // Se usa para las horas de CADA fecha (Fase 1) y para las horas
    // de CADA descanso registrado (Fase 2) — mismo cálculo, distinto
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

    // Suma las horas efectivas de un arreglo de fechas ya calculadas
    // (cada una con su campo "horas", string tipo "2.00"). Se usa
    // tanto para el total generado (Fase 1) como, en la UI, para
    // mostrar el acumulado de descansos ya registrados.
    function sumarHorasFechas(fechas) {
        const total = (fechas || []).reduce((acc, f) => acc + (parseFloat(f.horas) || 0), 0);
        return total.toFixed(2);
    }

    // Arma el payload de Fase 1 (creación o edición de la solicitud).
    function construirPayloadFase1({ personal, dependencia, tipoTrabajo, fechas, actividades, justificacion, idSolicitud }) {
        const fechasCalculadas = (fechas || []).map(f => ({
            fecha: f.fecha,
            horaInicio: f.horaInicio,
            horaFin: f.horaFin,
            refrigerioInicio: f.refrigerioInicio || '',
            refrigerioFin: f.refrigerioFin || '',
            horas: calcularTotalHoras(f.horaInicio, f.horaFin, f.refrigerioInicio, f.refrigerioFin)
        }));

        const payload = {
            CODE: personal.CODE,
            ID_PERSONAL: personal.ID_PERSONAL,
            EMPLEADO: window.formatearPersonalSeleccionado(personal),
            DEPENDENCIA: (dependencia || '').trim(),
            TIPO_TRABAJO: tipoTrabajo,
            FECHAS_JSON: JSON.stringify(fechasCalculadas),
            TOTAL_HORAS: sumarHorasFechas(fechasCalculadas),
            ACTIVIDADES: (actividades || '').trim(),
            JUSTIFICACION: (justificacion || '').trim()
        };
        if (idSolicitud) payload.ID_SOLICITUD = idSolicitud;
        return payload;
    }

    // Arma el payload de UN NUEVO descanso a agregar (Fase 2). Se
    // puede llamar varias veces para la misma solicitud: cada
    // llamada agrega un registro más al backend, no reemplaza al
    // anterior.
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
        MAX_FECHAS, TIPOS, ESTADO_INFO,
        horaAMinutos, calcularTotalHoras, calcularDuracionRefrigerio, fechaATextoLegible, sumarHorasFechas,
        construirPayloadFase1, construirPayloadFase2
    };
})();

// ============================================================
// VACACIONES-MODEL.JS — Datos y cálculos puros del módulo Vacaciones
// ============================================================
// Mismo criterio que sobretiempo-model.js: nada aquí toca el DOM.
//
// El flujo tiene DOS fases (igual patrón que Sobretiempo):
//   Fase 1 "Registrar período vacacional" → se ingresa el saldo del
//   trabajador para un período (ej. "2023-2024"): días asignados
//   (normalmente 30) y la fecha límite de goce. Esto reemplaza el
//   registro manual que antes se llevaba en el Excel
//   "OF DE GESTION DE LABORATORIOS".
//   Fase 2 "Registrar goce de vacaciones" → cada vez que el
//   trabajador SALE de vacaciones se agrega un tramo (fecha inicio /
//   fecha fin), y los días de ese tramo se van DESCONTANDO del saldo
//   pendiente. Se puede llamar varias veces para el mismo período
//   (ej. 30 días asignados, sale 15 en diciembre, quedan 15
//   pendientes, luego sale los otros 15) — el ESTADO pasa de
//   "Pendiente de goce" a "Goce parcial" y a "Agotado" cuando el
//   saldo pendiente llega a 0. Si se pasa la fecha límite con saldo
//   aún pendiente, el estado se muestra como "Vencido".
// ============================================================

window.VacacionesModel = (function() {

    const DIAS_ASIGNADOS_DEFECTO = 30;

    // "Goce parcial" reutiliza la misma clase amber que Sobretiempo
    // (.badge-estado.estado-parcial, ya definida en css/styles.css).
    // "Vencido" reutiliza el rojo de estado-danger si existiera, y si
    // no, cae en el mismo estilo que "Agotado" (gris) — ver
    // VacacionesUI.claseEstado().
    const ESTADO_INFO = {
        'Pendiente de goce': { clase: 'estado-programado', icono: 'fa-umbrella-beach' },
        'Goce parcial':      { clase: 'estado-parcial',    icono: 'fa-adjust' },
        'Agotado':           { clase: 'estado-historico',  icono: 'fa-check-circle' },
        'Vencido':           { clase: 'estado-vencido',    icono: 'fa-triangle-exclamation' }
    };

    function fechaATextoLegible(fechaISO) {
        if (!fechaISO) return '';
        const soloFecha = String(fechaISO).slice(0, 10);
        const [y, m, d] = soloFecha.split('-');
        if (!y || !m || !d) return fechaISO;
        return `${d}/${m}/${y}`;
    }

    // Días CALENDARIO entre fechaInicio y fechaFin, AMBAS incluidas
    // (ej. 10 al 24 de diciembre = 15 días) — mismo criterio que
    // usaban en el Excel original.
    function calcularDiasTramo(fechaInicio, fechaFin) {
        if (!fechaInicio || !fechaFin) return 0;
        const ini = new Date(fechaInicio + 'T00:00:00');
        const fin = new Date(fechaFin + 'T00:00:00');
        if (isNaN(ini) || isNaN(fin)) return 0;
        const diff = Math.round((fin - ini) / 86400000) + 1;
        return diff > 0 ? diff : 0;
    }

    // Suma los días ya tomados en todos los tramos (GOCES) de un
    // registro. Se usa tanto en el propio modelo como en la UI para
    // mostrar el acumulado.
    function sumarDiasGoces(goces) {
        return (goces || []).reduce((acc, g) => acc + (parseInt(g.dias, 10) || 0), 0);
    }

    // Calcula el saldo pendiente y el estado EN EL NAVEGADOR (para
    // feedback inmediato mientras se completa la Fase 2); el backend
    // vuelve a calcularlo y es la fuente de verdad real.
    function calcularSaldo(diasAsignados, goces, fechaLimite) {
        const tomados = sumarDiasGoces(goces);
        const pendientes = Math.max((parseInt(diasAsignados, 10) || 0) - tomados, 0);
        let estado;
        if (pendientes <= 0) {
            estado = 'Agotado';
        } else if (fechaLimite && new Date(fechaLimite + 'T00:00:00') < new Date(new Date().toDateString())) {
            estado = 'Vencido';
        } else if (tomados > 0) {
            estado = 'Goce parcial';
        } else {
            estado = 'Pendiente de goce';
        }
        return { tomados, pendientes, estado };
    }

    // Arma el payload de Fase 1 (creación o edición del período/saldo).
    function construirPayloadFase1({ personal, periodoVacacional, diasAsignados, fechaLimite, observacion, idVacacion }) {
        const payload = {
            CODE: personal.CODE,
            ID_PERSONAL: personal.ID_PERSONAL,
            EMPLEADO: window.formatearPersonalSeleccionado(personal),
            PERIODO_VACACIONAL: (periodoVacacional || '').trim(),
            DIAS_ASIGNADOS: parseInt(diasAsignados, 10) || DIAS_ASIGNADOS_DEFECTO,
            FECHA_LIMITE: fechaLimite || '',
            OBSERVACION: (observacion || '').trim()
        };
        if (idVacacion) payload.ID_VACACION = idVacacion;
        return payload;
    }

    // Arma el payload de UN NUEVO tramo de goce a agregar (Fase 2).
    function construirPayloadFase2({ idVacacion, fechaInicio, fechaFin, diasTomados, observacionGoce }) {
        return {
            ID_VACACION: idVacacion,
            FECHA_INICIO: fechaInicio,
            FECHA_FIN: fechaFin,
            DIAS_TOMADOS: parseInt(diasTomados, 10) || calcularDiasTramo(fechaInicio, fechaFin),
            OBSERVACION_GOCE: (observacionGoce || '').trim()
        };
    }

    return {
        DIAS_ASIGNADOS_DEFECTO, ESTADO_INFO,
        fechaATextoLegible, calcularDiasTramo, sumarDiasGoces, calcularSaldo,
        construirPayloadFase1, construirPayloadFase2
    };
})();

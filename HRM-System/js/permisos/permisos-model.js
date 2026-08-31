// ============================================================
// PERMISOS-MODEL.JS — Datos y cálculos puros del módulo Permisos
// ============================================================
// Mismo criterio que sobretiempo-model.js: nada aquí toca el DOM.
//
// A diferencia de Sobretiempo, un Permiso es de UNA SOLA FASE: el
// jefe autoriza la salida con su hora de retorno PREVISTA y ya
// queda registrado — la boleta oficial solo trae un campo "Hora de
// Retorno" (no distingue prevista vs. real), así que no hay una
// segunda fase que confirmar después.
// ============================================================

window.PermisosModel = (function() {

    // Las 5 clases de la boleta oficial + "Otra (especificar)".
    // Solo se puede marcar UNA por boleta (radio buttons).
    const CLASES = [
        { value: 'Personal',              label: 'Personal',              icono: 'fa-user' },
        { value: 'Comisión de Servicio',  label: 'Comisión de servicio',  icono: 'fa-briefcase' },
        { value: 'Capacitación',          label: 'Capacitación',          icono: 'fa-graduation-cap' },
        { value: 'Enfermedad',            label: 'Enfermedad',            icono: 'fa-notes-medical' },
        { value: 'Lactancia',             label: 'Lactancia',             icono: 'fa-baby' },
        { value: 'Otra',                  label: 'Otra',                  icono: 'fa-ellipsis' }
    ];

    // Reutiliza las mismas 3 clases de badge que ya existen en
    // css/styles.css (igual que Horarios: Programado/Vigente/Histórico).
    const ESTADO_INFO = {
        'Programado': { clase: 'estado-programado', icono: 'fa-clock' },
        'Vigente':    { clase: 'estado-vigente',    icono: 'fa-check-circle' },
        'Histórico':  { clase: 'estado-historico',  icono: 'fa-box-archive' }
    };

    function horaAMinutos(hhmm) {
        if (!hhmm) return null;
        const [h, m] = hhmm.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return null;
        return h * 60 + m;
    }

    // Duración simple: hora de retorno − hora de salida. A
    // diferencia de Sobretiempo, un permiso no descuenta refrigerio
    // (es una salida corta, no una jornada completa).
    function calcularDuracion(horaSalida, horaRetorno) {
        const ini = horaAMinutos(horaSalida);
        const fin = horaAMinutos(horaRetorno);
        if (ini === null || fin === null) return '0.00';
        let diff = fin - ini;
        if (diff <= 0) diff += 24 * 60; // cruza medianoche
        return (diff / 60).toFixed(2);
    }

    function fechaATextoLegible(fechaISO) {
        if (!fechaISO) return '';
        const soloFecha = String(fechaISO).slice(0, 10);
        const [y, m, d] = soloFecha.split('-');
        if (!y || !m || !d) return fechaISO;
        return `${d}/${m}/${y}`;
    }

    // Arma el payload de creación/edición. OTRA_ESPECIFICAR,
    // LUGAR_DESTINO y CAPACITACION_DETALLE solo se envían cuando la
    // clase marcada efectivamente los necesita (igual que la boleta
    // en papel: esos campos solo aplican a "Otra", "Comisión de
    // Servicio" y "Capacitación" respectivamente).
    function construirPayload({ personal, funcionarioExpide, cargoFuncionario, dependencia, fechaPermiso, horaSalida, horaRetorno, motivoSalida, clasePermiso, otraEspecificar, lugarDestino, capacitacionDetalle, idPermiso }) {
        const payload = {
            CODE: personal.CODE,
            ID_PERSONAL: personal.ID_PERSONAL,
            EMPLEADO: window.formatearPersonalSeleccionado(personal),
            DEPENDENCIA: (dependencia || '').trim(),
            FUNCIONARIO_EXPIDE: (funcionarioExpide || '').trim(),
            CARGO_FUNCIONARIO: (cargoFuncionario || '').trim(),
            FECHA_PERMISO: fechaPermiso,
            HORA_SALIDA: horaSalida,
            HORA_RETORNO: horaRetorno,
            DURACION_TOTAL: calcularDuracion(horaSalida, horaRetorno),
            MOTIVO_SALIDA: (motivoSalida || '').trim(),
            CLASE_PERMISO: clasePermiso,
            OTRA_ESPECIFICAR: clasePermiso === 'Otra' ? (otraEspecificar || '').trim() : '',
            LUGAR_DESTINO: clasePermiso === 'Comisión de Servicio' ? (lugarDestino || '').trim() : '',
            CAPACITACION_DETALLE: clasePermiso === 'Capacitación' ? (capacitacionDetalle || '').trim() : ''
        };
        if (idPermiso) payload.ID_PERMISO = idPermiso;
        return payload;
    }

    return { CLASES, ESTADO_INFO, horaAMinutos, calcularDuracion, fechaATextoLegible, construirPayload };
})();

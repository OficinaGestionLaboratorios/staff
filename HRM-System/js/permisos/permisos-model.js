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

    // "Funcionario que la expide": 2 nombres predefinidos con su
    // cargo fijo (se autocompleta y se bloquea la edición del
    // cargo) + una tercera opción "Otro" que permite escribir
    // libremente nombre y cargo (ver permisos-ui.js:
    // seleccionarFuncionario / pintarFuncionario).
    const FUNCIONARIOS_PREDEFINIDOS = {
        'Wilfredo G. Leon Gonzales': 'Supervisor',
        'Jose Luis Plasencia Carranza': 'Jefe de Oficina OGL'
    };

    // Reutiliza las mismas 3 clases de badge que ya existen en
    // css/styles.css (igual que Horarios: Programado/Vigente/Histórico).
    const ESTADO_INFO = {
        'Programado': { clase: 'estado-programado', icono: 'fa-clock' },
        'Vigente':    { clase: 'estado-vigente',    icono: 'fa-check-circle' },
        'Histórico':  { clase: 'estado-historico',  icono: 'fa-box-archive' }
    };

    // (v144) Una hora tomada de la jornada laboral (porque no se marcó) se guarda como "08:00 (no registro)".
    // horaPura() devuelve solo "HH:MM" (sirve para calcular); esNoRegistro() detecta esa marca.
    const MARCA_NO_REGISTRO = '(no registro)';
    function horaPura(v) {
        const m = String(v || '').match(/^\s*(\d{1,2}):(\d{2})/);
        return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
    }
    function esNoRegistro(v) { return /\(no registro\)/i.test(String(v || '')); }

    function horaAMinutos(hhmm) {
        const p = horaPura(hhmm);
        if (!p) return null;
        const [h, m] = p.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return null;
        return h * 60 + m;
    }

    // Jornada (ingreso y salida) del empleado en una fecha concreta, según su horario efectivo
    // (temporal sobre base, igual que el módulo Horarios). null si ese día no tiene horario.
    const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    function jornadaDelDia(grupos, fechaISO) {
        const H = window.HorarioModel;
        const f = String(fechaISO || '').slice(0, 10);
        const [y, m, d] = f.split('-').map(Number);
        if (!H || !Array.isArray(grupos) || !y || !m || !d) return null;
        const nombre = NOMBRES_DIA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
        const r = H.diaEfectivo(grupos, f, nombre);
        const ing = horaPura(r && r.dia && r.dia.ingreso), sal = horaPura(r && r.dia && r.dia.salida);
        return (ing && sal) ? { ingreso: ing, salida: sal } : null;
    }

    // (v144) Si no se marcó la hora de salida, se toma la hora de INGRESO de la jornada de ese día; si no se
    // marcó la de retorno, la hora de SALIDA de la jornada. Se guardan como "HH:MM (no registro)" y la
    // duración se calcula con ellas. Devuelve { ok, horaSalida, horaRetorno, duracion, derivadas } o
    // { ok:false, sinJornada:true } (ese día no tiene horario) o { ok:false, error } (horas incoherentes).
    function completarHoras({ grupos, fecha, horaSalida, horaRetorno }) {
        const sal = horaPura(horaSalida), ret = horaPura(horaRetorno);
        if (sal && ret) return { ok: true, horaSalida: sal, horaRetorno: ret, duracion: calcularDuracion(sal, ret), derivadas: [] };
        const j = jornadaDelDia(grupos, fecha);
        if (!j) return { ok: false, sinJornada: true };
        const derivadas = [];
        let hs = sal, hr = ret;
        if (!hs) { hs = j.ingreso; derivadas.push('salida'); }
        if (!hr) { hr = j.salida; derivadas.push('retorno'); }
        if (horaAMinutos(hr) <= horaAMinutos(hs)) {
            return { ok: false, error: derivadas.includes('salida')
                ? `la hora de retorno (${hr}) es anterior o igual al ingreso de su jornada (${hs}); revisa la hora de retorno`
                : `la hora de salida (${hs}) es posterior o igual a la salida de su jornada (${hr}); revisa la hora de salida` };
        }
        return {
            ok: true,
            horaSalida: derivadas.includes('salida') ? `${hs} ${MARCA_NO_REGISTRO}` : hs,
            horaRetorno: derivadas.includes('retorno') ? `${hr} ${MARCA_NO_REGISTRO}` : hr,
            duracion: calcularDuracion(hs, hr),
            derivadas
        };
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

    // (v145) Duración decimal de un registro, SIEMPRE recalculada con sus horas (así nunca aparece una fecha
    // si la hoja convirtió "2.08" en 2-ago). Si no hay ambas horas devuelve lo guardado (p. ej. "S/R") o ''.
    function duracionDe(r) {
        if (!r) return '';
        const sal = horaPura(r.HORA_SALIDA), ret = horaPura(r.HORA_RETORNO);
        if (horaAMinutos(sal) !== null && horaAMinutos(ret) !== null) return calcularDuracion(sal, ret);
        const d = String(r.DURACION_TOTAL == null ? '' : r.DURACION_TOTAL).trim();
        return /^\d+(\.\d+)?$/.test(d) || /^s\/r$/i.test(d) ? d : '';
    }

    // Horas decimales -> "HH:MM" (2.08 -> "02:05"). Si no es un número, devuelve el texto tal cual.
    function duracionHM(dec) {
        const n = parseFloat(dec);
        if (Number.isNaN(n) || !/^\d+(\.\d+)?$/.test(String(dec).trim())) return String(dec == null ? '' : dec);
        const t = Math.round(n * 60);
        return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
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
            // Si alguna de las dos horas quedó como "S/R" (Sin
            // Registrar — ver guardarPermiso en permisos.js), la
            // duración tampoco se puede calcular: se guarda "S/R"
            // en vez de un "0.00" engañoso.
            DURACION_TOTAL: (horaSalida === 'S/R' || horaRetorno === 'S/R') ? 'S/R' : calcularDuracion(horaSalida, horaRetorno),
            MOTIVO_SALIDA: (motivoSalida || '').trim(),
            CLASE_PERMISO: clasePermiso,
            OTRA_ESPECIFICAR: clasePermiso === 'Otra' ? (otraEspecificar || '').trim() : '',
            LUGAR_DESTINO: clasePermiso === 'Comisión de Servicio' ? (lugarDestino || '').trim() : '',
            CAPACITACION_DETALLE: clasePermiso === 'Capacitación' ? (capacitacionDetalle || '').trim() : ''
        };
        if (idPermiso) payload.ID_PERMISO = idPermiso;
        return payload;
    }

    return { CLASES, ESTADO_INFO, FUNCIONARIOS_PREDEFINIDOS, horaAMinutos, horaPura, esNoRegistro, jornadaDelDia, completarHoras, MARCA_NO_REGISTRO, calcularDuracion, duracionDe, duracionHM, fechaATextoLegible, construirPayload };
})();

// ============================================================
// HORARIO-MODEL.JS — Datos y cálculos puros del módulo Horarios
// ============================================================
// Nada en este archivo toca el DOM. Son solo estructuras de datos y
// funciones de cálculo, para que horario-ui.js y horarios.js puedan
// reutilizarlas sin duplicar lógica (y para poder testearlas sueltas
// si en algún momento se agregan pruebas unitarias).
// ============================================================

window.HorarioModel = (function() {

    const DIAS = [
        { key: 'Lunes',     corto: 'Lun' },
        { key: 'Martes',    corto: 'Mar' },
        { key: 'Miércoles', corto: 'Mié' },
        { key: 'Jueves',    corto: 'Jue' },
        { key: 'Viernes',   corto: 'Vie' },
        { key: 'Sábado',    corto: 'Sáb' },
        { key: 'Domingo',   corto: 'Dom' }
    ];

    // Horario estándar usado por el botón "Estándar (L-V)".
    const ESTANDAR = { ingreso: '08:00', inicioRef: '13:00', finRef: '14:00', salida: '17:48' };

    const DIAS_LABORABLES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

    // Colores/etiqueta por ESTADO (calculado siempre por el backend,
    // nunca localmente, para que la lista de horarios y el badge
    // reflejen la misma fuente de verdad que BD_HORARIOS).
    const ESTADO_INFO = {
        'Vigente':    { clase: 'estado-vigente',    icono: 'fa-check-circle' },
        'Programado': { clase: 'estado-programado', icono: 'fa-clock' },
        'Histórico':  { clase: 'estado-historico',  icono: 'fa-archive' }
    };

    // ---- Reglas del procedimiento INS-DRH-P-28 (cambio de horario por motivo social y técnico) ----
    // Anticipación mínima en días CALENDARIO entre la solicitud a la DRH y el inicio del cambio
    // (condiciones básicas 6.2 y 6.3). UMBRAL: variación de más de 1 hora → 10 días si es unilateral.
    // MIN_REFRIGERIO_MIN y MAX_HORAS_SEMANA (6.6) no figuran con número en el procedimiento: son
    // valores de referencia editables; se advierte (no se bloquea) cuando no se cumplen.
    const REGLAS = {
        ANTICIPACION_NORMAL: 3,
        ANTICIPACION_UNILATERAL_MAYOR: 10,
        UMBRAL_CAMBIO_MIN: 60,
        MIN_REFRIGERIO_MIN: 60,
        MAX_HORAS_SEMANA: 44
    };

    // Alternativas de sustento (se marcan una o varias). Salen en el recuadro "SUSTENTO DEL MOTIVO"
    // del formato. Técnico = solicita el jefe (necesidad operativa); Social = solicita el trabajador.
    const SUSTENTOS = {
        Jefe: [
            'Por vacaciones del técnico compañero del turno complementario (turno mañana o turno tarde).',
            'Por ausencia del otro técnico del área (descanso médico, licencia u otra ausencia).',
            'Por brindar soporte a prácticas complejas que requieren mayor tiempo o más personal.',
            'Por alta demanda de prácticas según la programación académica del ciclo.',
            'Por preparación de materiales, reactivos o equipos antes o después de las prácticas.',
            'Por mantenimiento, calibración o instalación de equipos del laboratorio.'
        ],
        Trabajador: [
            'Por motivo familiar (detallar).',
            'Por motivo personal (detallar).',
            'Por compatibilizar estudios o capacitación (detallar).'
        ]
    };

    const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    // Días de la semana que realmente ocurren entre dos fechas (incluidas). Ej. 11/11 a 11/11 → solo ese día.
    function diasEnRango(inicio, fin) {
        const p = s => { const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number); return (y && m && d) ? Date.UTC(y, m - 1, d) : null; };
        const a = p(inicio), b = p(fin);
        if (a === null || b === null || b < a) return null;
        const set = new Set();
        for (let t = a, n = 0; t <= b && n < 7; t += 86400000, n++) set.add(NOMBRES_DIA[new Date(t).getUTCDay()]);
        return set;
    }
    function diaSiguienteISO(iso) {
        const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
        const f = new Date(Date.UTC(y, m - 1, d + 1));
        return f.toISOString().slice(0, 10);
    }

    function diasEntreISO(desde, hasta) {
        const p = s => { const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number); return (y && m && d) ? Date.UTC(y, m - 1, d) : null; };
        const a = p(desde), b = p(hasta);
        if (a === null || b === null) return null;
        return Math.round((b - a) / 86400000);
    }

    // Mayor variación (en minutos) de ingreso o salida entre el horario propuesto y el vigente,
    // día por día. Un día que aparece o desaparece cuenta como cambio total (Infinity).
    // null = no hay horario vigente con el que comparar.
    function cambioMaxMinutos(diasPropuestos, diasVigentes) {
        if (!diasVigentes || !diasVigentes.length) return null;
        const mapa = list => { const o = {}; (list || []).forEach(d => { o[d.dia] = d; }); return o; };
        const P = mapa(diasPropuestos), V = mapa(diasVigentes);
        let max = 0;
        new Set(Object.keys(P).concat(Object.keys(V))).forEach(dia => {
            if (!P[dia] || !V[dia]) { max = Infinity; return; }
            const di = Math.abs((horaAMinutos(P[dia].ingreso) ?? 0) - (horaAMinutos(V[dia].ingreso) ?? 0));
            const ds = Math.abs((horaAMinutos(P[dia].salida) ?? 0) - (horaAMinutos(V[dia].salida) ?? 0));
            max = Math.max(max, di, ds);
        });
        return max;
    }

    // Horario "vigente" de referencia: entre los horarios NO temporales del empleado, el que cubre
    // la fecha de inicio del cambio; si ninguno la cubre, el último que empezó antes.
    function seleccionarVigente(grupos, fechaInicio, idExcluir) {
        const ini = String(fechaInicio || '').slice(0, 10);
        const base = (grupos || []).filter(g => g.ID_GRUPO !== idExcluir && !esSuperpuesto(g));
        const ordenados = ordenarGruposPorFechaInicio(base);
        const cubre = ordenados.filter(g => String(g.FECHA_INICIO).slice(0, 10) <= ini && (!g.FECHA_FIN || String(g.FECHA_FIN).slice(0, 10) >= ini));
        return cubre[cubre.length - 1] || ordenados.filter(g => String(g.FECHA_INICIO).slice(0, 10) <= ini).pop() || null;
    }

    // ---- Horario EFECTIVO por fecha (temporal sobre base) ----
    // Regla de negocio: un horario TEMPORAL solo rige dentro de su rango de fechas y SOLO en los días
    // de la semana que trae; lo demás sigue siendo el horario base (el último no temporal que cubre la
    // fecha). Pasado el rango, rige otra vez TODO el horario anterior, sin crear ni cerrar registros.
    // Superpuestos: horarios con periodo propio que pisan al permanente solo mientras duran.
    // Al pasar su fecha fin vuelve a regir, solo, el último horario permanente.
    const SUPERPUESTOS = ['Temporal', 'Rotativo'];
    function esSuperpuesto(g) { return !!g && SUPERPUESTOS.indexOf(g.TIPO_HORARIO) >= 0; }
    function hoyISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function cubreFecha(g, fechaISO) {
        const f = String(fechaISO || '').slice(0, 10);
        const i = String(g.FECHA_INICIO || '').slice(0, 10), e = String(g.FECHA_FIN || '').slice(0, 10);
        return !!i && i <= f && (!e || e >= f);
    }
    // { base, temporal } de UN empleado (grupos = todos sus horarios) en la fecha dada.
    function horarioEfectivoEn(grupos, fechaISO) {
        const orden = ordenarGruposPorFechaInicio((grupos || []).filter(g => cubreFecha(g, fechaISO)));
        return {
            base: orden.filter(g => !esSuperpuesto(g)).pop() || null,
            temporal: orden.filter(g => esSuperpuesto(g)).pop() || null
        };
    }
    // Horario de un día de la semana (nombre completo, ej. "Martes") ya resuelto: { dia, grupo, origen } o null.
    function diaEfectivo(grupos, fechaISO, nombreDia) {
        const { base, temporal } = horarioEfectivoEn(grupos, fechaISO);
        const dt = temporal && (temporal.DIAS || []).find(d => d.dia === nombreDia);
        if (dt) return { dia: dt, grupo: temporal, origen: 'Temporal' };
        const db = base && (base.DIAS || []).find(d => d.dia === nombreDia);
        return db ? { dia: db, grupo: base, origen: 'Base' } : null;
    }
    // Para exportar "los vigentes": un horario por empleado. Si hay un temporal en curso, se exporta
    // el base (el formal); el temporal solo se exporta si no existe base vigente.
    function soloVigentesBase(grupos) {
        const vig = (grupos || []).filter(g => g.ESTADO === 'Vigente');
        const conBase = new Set(vig.filter(g => !esSuperpuesto(g)).map(g => g.CODE));
        return vig.filter(g => !esSuperpuesto(g) || !conBase.has(g.CODE));
    }
    // Días de anticipación exigidos + el artículo del procedimiento que lo sustenta.
    function anticipacionRequerida({ tipo, solicitadoPor, conformidad, cambioMin }) {
        if (tipo === 'Rotativo') return { dias: REGLAS.ANTICIPACION_NORMAL, regla: 'Horario rotativo: solicitud mensual con 3 días calendario de anticipación (6.3)' };
        if (solicitadoPor === 'Trabajador') return { dias: REGLAS.ANTICIPACION_NORMAL, regla: 'Solicitud del trabajador: 3 días calendario de anticipación (6.2)' };
        if (solicitadoPor === 'Jefe') {
            if (conformidad) return { dias: REGLAS.ANTICIPACION_NORMAL, regla: 'Con conformidad expresa del trabajador: 3 días calendario (6.2)' };
            if (cambioMin === null || cambioMin > REGLAS.UMBRAL_CAMBIO_MIN) {
                return { dias: REGLAS.ANTICIPACION_UNILATERAL_MAYOR, regla: cambioMin === null
                    ? 'Cambio unilateral sin horario vigente con qué comparar: se aplican 10 días calendario (6.2)'
                    : 'Cambio unilateral de más de 1 hora: 10 días calendario (6.2)' };
            }
            return { dias: REGLAS.ANTICIPACION_NORMAL, regla: 'Cambio unilateral de menos de 1 hora: 3 días calendario (6.2)' };
        }
        return { dias: REGLAS.ANTICIPACION_NORMAL, regla: '' };
    }

    // ---- Conversión de horas ----

    function horaAMinutos(hhmm) {
        if (!hhmm) return null;
        const [h, m] = hhmm.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return null;
        return h * 60 + m;
    }

    // Diferencia en minutos entre dos horas "HH:MM". Si la hora de fin
    // es menor o igual a la de inicio, se asume turno que cruza la
    // medianoche (ej. 22:00 a 06:00) y se suman 24h al final.
    function diferenciaMinutos(inicio, fin) {
        const ini = horaAMinutos(inicio);
        const term = horaAMinutos(fin);
        if (ini === null || term === null) return 0;
        let diff = term - ini;
        if (diff <= 0) diff += 24 * 60;
        return diff;
    }

    // Formatea minutos como "H:MM".
    function minutosATexto(minutos) {
        const m = Math.max(0, Math.round(minutos));
        const h = Math.floor(m / 60);
        const min = m % 60;
        return `${h}:${String(min).padStart(2, '0')}`;
    }

    // HORAS_SEMANA se guarda en BD_HORARIOS como decimal (ej. "44.00",
    // resultado de sumar minutos/60). Esta función lo convierte de
    // vuelta a "H:MM" para mostrarlo igual que el resto del modal
    // (nunca se muestra el decimal crudo en la interfaz).
    function horasDecimalATexto(horasDecimal) {
        const horas = parseFloat(horasDecimal);
        if (Number.isNaN(horas)) return '0:00';
        return minutosATexto(horas * 60);
    }

    // El backend debería entregar fechas como "YYYY-MM-DD" limpio,
    // pero si el .gs desplegado todavía es una versión vieja (o si
    // Sheets vuelve a autoconvertir el valor a fecha), puede llegar
    // como ISO completo ("2026-08-03T05:00:00.000Z"). Por eso se
    // recorta a los primeros 10 caracteres ANTES de partir por "-":
    // así nunca se arma un string roto tipo "03T05:00:00.000Z/08/...".
    function fechaATextoLegible(fechaISO) {
        if (!fechaISO) return '';
        const soloFecha = String(fechaISO).slice(0, 10);
        const [y, m, d] = soloFecha.split('-');
        if (!y || !m || !d) return fechaISO;
        return `${d}/${m}/${y}`;
    }

    // Minutos netos trabajados en un día, dado un objeto plano
    // { activo, ingreso, inicioRef, finRef, salida }.
    function calcularMinutosDia(dia) {
        if (!dia || !dia.activo || !dia.ingreso || !dia.salida) return 0;

        let minutos = diferenciaMinutos(dia.ingreso, dia.salida);
        if (dia.inicioRef && dia.finRef) {
            minutos -= diferenciaMinutos(dia.inicioRef, dia.finRef);
        }
        return Math.max(0, minutos);
    }

    // Resumen semanal { totalMin, diasActivos, promedioMin } a partir
    // de un array de días { activo, ingreso, inicioRef, finRef, salida }.
    function calcularResumenSemana(dias) {
        let totalMin = 0;
        let diasActivos = 0;

        dias.forEach(dia => {
            const min = calcularMinutosDia(dia);
            if (dia.activo) {
                diasActivos++;
                totalMin += min;
            }
        });

        return {
            totalMin,
            diasActivos,
            promedioMin: diasActivos > 0 ? totalMin / diasActivos : 0
        };
    }

    // Arma el payload que espera el backend (createHorario/updateHorario)
    // a partir de los datos ya validados del formulario.
    function construirPayloadGrupo({ personal, fechaInicio, fechaFin, diasActivos, idGrupo, observacion, tipo, motivos, solicitadoPor, fechaSolicitud, conformidad, sustentos }) {
        const obsGeneral = (observacion || '').trim();
        const dias = diasActivos.map(d => ({
            dia: d.dia,
            ingreso: d.ingreso,
            inicioRef: d.inicioRef || '',
            finRef: d.finRef || '',
            salida: d.salida,
            // La observación ya NO es por día: se guarda la general en cada fila (columna
            // OBSERVACION de BD_HORARIOS), así el backend actual la conserva sin cambios.
            obs: obsGeneral,
            horas: (calcularMinutosDia(d) / 60).toFixed(2)
        }));

        const horasSemana = dias.reduce((sum, d) => sum + parseFloat(d.horas), 0).toFixed(2);

        const payload = {
            CODE: personal.CODE,
            ID_PERSONAL: personal.ID_PERSONAL,
            EMPLEADO: window.formatearPersonalSeleccionado(personal),
            FECHA_INICIO: fechaInicio,
            FECHA_FIN: fechaFin || '',
            DIAS_JSON: JSON.stringify(dias),
            HORAS_SEMANA: horasSemana,
            OBSERVACION: obsGeneral,
            TIPO_HORARIO: tipo || '',
            MOTIVOS: (motivos || []).join(','),
            SOLICITADO_POR: solicitadoPor || '',
            FECHA_SOLICITUD: fechaSolicitud || '',
            CONFORMIDAD_TRABAJADOR: conformidad ? 'SI' : 'NO',
            SUSTENTOS: (sustentos || []).join('|')
        };
        if (idGrupo) payload.ID_GRUPO = idGrupo;

        return payload;
    }

    // Observación general de un grupo. Si el horario se registró con la versión anterior
    // (una observación por día), se consolida SIN perder información: un solo texto si todos
    // los días tienen lo mismo, o "Lun: ... · Mar: ..." si variaban.
    function observacionGeneral(grupo) {
        if (!grupo) return '';
        if (grupo.OBSERVACION) return String(grupo.OBSERVACION).trim();
        const conObs = (grupo.DIAS || []).filter(d => d.obs && String(d.obs).trim());
        if (!conObs.length) return '';
        const textos = conObs.map(d => String(d.obs).trim());
        if (textos.every(t => t === textos[0])) return textos[0];
        const corto = {}; DIAS.forEach(x => { corto[x.key] = x.corto; });
        return conObs.map(d => `${corto[d.dia] || d.dia}: ${String(d.obs).trim()}`).join(' · ');
    }

    // Ordena una lista de grupos por FECHA_INICIO. Por defecto, de la
    // fecha más lejana (antigua) a la más cercana (reciente) — el
    // orden que debe verse tanto en el panel "Horarios registrados de
    // este empleado" del modal como en el detalle exportado a Excel.
    // No muta el array recibido (devuelve uno nuevo).
    function ordenarGruposPorFechaInicio(grupos, direccion = 'asc') {
        const factor = direccion === 'desc' ? -1 : 1;
        return (grupos || []).slice().sort((a, b) => {
            const fa = String(a.FECHA_INICIO || '').slice(0, 10);
            const fb = String(b.FECHA_INICIO || '').slice(0, 10);
            if (fa < fb) return -1 * factor;
            if (fa > fb) return 1 * factor;
            return 0;
        });
    }

    // Retrocede desde fechaISO ("YYYY-MM-DD") hasta el día hábil
    // inmediatamente anterior: resta un día y sigue restando mientras
    // caiga en domingo (y también en sábado, salvo que `incluirSabado`
    // sea true). Ej.: si fechaISO es un lunes y no se trabaja sábado,
    // devuelve el viernes previo; si sí se trabaja sábado, un lunes
    // retrocede solo hasta el sábado anterior.
    function diaHabilAnterior(fechaISO, incluirSabado) {
        const soloFecha = String(fechaISO || '').slice(0, 10);
        const [y, m, d] = soloFecha.split('-').map(Number);
        if (!y || !m || !d) return '';
        const fecha = new Date(y, m - 1, d);
        fecha.setDate(fecha.getDate() - 1);
        while (fecha.getDay() === 0 || (!incluirSabado && fecha.getDay() === 6)) { // 0=domingo, 6=sábado
            fecha.setDate(fecha.getDate() - 1);
        }
        const yy = fecha.getFullYear();
        const mm = String(fecha.getMonth() + 1).padStart(2, '0');
        const dd = String(fecha.getDate()).padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
    }

    // Encadena la FECHA_FIN de cada horario con el inicio del
    // siguiente: recibe los grupos de UN mismo empleado YA ordenados
    // de fecha más lejana a más cercana, y devuelve una copia donde
    // cada grupo (salvo el último, el vigente/más reciente, que no
    // tiene "siguiente") queda con FECHA_FIN = el día hábil anterior a
    // la FECHA_INICIO del horario que le sigue. Si ESE horario (el que
    // está terminando) trabaja los sábados —está "Sábado" entre sus
    // DIAS—, el sábado cuenta como día hábil suyo y su FECHA_FIN puede
    // caer en sábado; si no, se retrocede hasta el viernes. Así, al
    // exportar, el fin de un horario y el inicio del próximo quedan
    // encadenados sin huecos ni traslapes. No muta los objetos
    // originales.
    function encadenarFechasFin(gruposAsc) {
        const lista = gruposAsc || [];
        return lista.map((grupo, i) => {
            const siguiente = lista[i + 1];
            if (!siguiente) return grupo; // el más reciente: sin cambios
            const trabajaSabado = (grupo.DIAS || []).some(d => d.dia === 'Sábado');
            return Object.assign({}, grupo, { FECHA_FIN: diaHabilAnterior(siguiente.FECHA_INICIO, trabajaSabado) });
        });
    }

    return {
        DIAS, ESTANDAR, DIAS_LABORABLES, ESTADO_INFO, REGLAS, SUSTENTOS, diasEnRango, diaSiguienteISO,
        diasEntreISO, cambioMaxMinutos, seleccionarVigente, anticipacionRequerida,
        horaAMinutos, diferenciaMinutos, minutosATexto, horasDecimalATexto, fechaATextoLegible,
        calcularMinutosDia, calcularResumenSemana, construirPayloadGrupo,
        observacionGeneral, ordenarGruposPorFechaInicio, diaHabilAnterior, encadenarFechasFin,
        hoyISO, cubreFecha, esSuperpuesto, horarioEfectivoEn, diaEfectivo, soloVigentesBase
    };
})();

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
    function construirPayloadGrupo({ personal, fechaInicio, fechaFin, diasActivos, idGrupo }) {
        const dias = diasActivos.map(d => ({
            dia: d.dia,
            ingreso: d.ingreso,
            inicioRef: d.inicioRef || '',
            finRef: d.finRef || '',
            salida: d.salida,
            obs: (d.obs || '').trim(),
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
            HORAS_SEMANA: horasSemana
        };
        if (idGrupo) payload.ID_GRUPO = idGrupo;

        return payload;
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
        DIAS, ESTANDAR, DIAS_LABORABLES, ESTADO_INFO,
        horaAMinutos, diferenciaMinutos, minutosATexto, horasDecimalATexto, fechaATextoLegible,
        calcularMinutosDia, calcularResumenSemana, construirPayloadGrupo,
        ordenarGruposPorFechaInicio, diaHabilAnterior, encadenarFechasFin
    };
})();

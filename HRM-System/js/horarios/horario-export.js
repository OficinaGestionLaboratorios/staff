// ============================================================
// HORARIO-EXPORT.JS — Descargar/copiar BD_HORARIOS desde la interfaz
// ============================================================
// Antes, para llevarse el detalle de un horario fuera de la app había
// que abrir la hoja de cálculo directamente. Esto permite: (a)
// descargar el horario completo de UN grupo seleccionado (CSV), (b)
// copiarlo al portapapeles en texto legible, y (c) descargar TODOS
// los horarios registrados (de todos los empleados) en un solo CSV.
// ============================================================

function csvEscape(valor) {
    let v = String(valor === undefined || valor === null ? '' : valor);
    v = v.replace(/"/g, '""');
    if (v.includes(',') || v.includes('"') || v.includes('\n')) v = `"${v}"`;
    return v;
}

// Excel/Sheets, con configuración regional en español (coma como
// separador decimal), reinterpreta mal un número con PUNTO decimal
// dentro de un CSV: "8.8" puede terminar mostrándose como "8800".
// La única forma 100% confiable de que NINGÚN programa (Excel,
// Sheets, Numbers, un editor de texto) intente "adivinar" que es un
// número —sin importar el idioma/región configurado, y sin depender
// de que se evalúe ninguna fórmula— es que el valor no parezca un
// número puro. Por eso se le agrega el sufijo "h" (de horas): así
// se ve limpio ("8.80h") y ningún programa lo tocará jamás.
function csvHoras(valor) {
    const v = String(valor === undefined || valor === null ? '' : valor).trim();
    if (!v) return '';
    return v + 'h';
}

// FECHA_REGISTRO/FECHA_ACTUALIZACION llegan del backend como ISO
// completo ("2026-08-03T05:00:00.000Z", ver armarGrupoDesdeFilas en
// Codigo_corregido.gs), que es justo lo que guarda BD_HORARIOS en
// esas dos columnas (fecha + hora). Se muestran en local dd/mm/yyyy
// hh:mm para que sean legibles en el CSV sin perder el dato de hora
// que sí tiene la hoja original.
function csvFechaHora(valor) {
    if (!valor) return '';
    const d = new Date(valor);
    if (isNaN(d)) return String(valor);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

window.descargarArchivo = function(nombre, contenido, tipo = 'text/csv;charset=utf-8;') {
    const blob = new Blob(['\uFEFF' + contenido], { type: tipo });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nombre;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};

window.HorarioExport = (function() {
    // Mismas 16 columnas, mismos nombres y MISMO ORDEN que
    // HORARIOS_HEADERS en Codigo_corregido.gs (hoja BD_HORARIOS).
    // El Sheet es el original: la exportación debe calcarlo, no
    // inventar su propio orden ni agregar/quitar columnas.
    const CSV_HEADERS = ['ID_GRUPO', 'FECHA_REGISTRO', 'FECHA_ACTUALIZACION', 'CODE', 'ID_PERSONAL', 'EMPLEADO', 'FECHA_INICIO', 'FECHA_FIN', 'DIA', 'HORA_INGRESO', 'INICIO_REFRIGERIO', 'FIN_REFRIGERIO', 'HORA_SALIDA', 'HORAS_DIA', 'HORAS_SEMANA', 'OBSERVACION'];

    // Aplana uno o varios grupos (cabecera + DIAS anidados) a filas
    // planas, una por día, listas para CSV — el mismo formato "una
    // fila por día" que ya usa BD_HORARIOS en la hoja original, con
    // sus mismas 16 columnas en el mismo orden.
    function aFilas(grupos) {
        const filas = [];
        grupos.forEach(g => {
            (g.DIAS || []).forEach(d => {
                filas.push([
                    g.ID_GRUPO,
                    csvFechaHora(g.FECHA_REGISTRO),
                    csvFechaHora(g.FECHA_ACTUALIZACION),
                    g.CODE, g.ID_PERSONAL, g.EMPLEADO,
                    g.FECHA_INICIO, g.FECHA_FIN, d.dia, d.ingreso, d.inicioRef,
                    d.finRef, d.salida,
                    csvHoras(d.horas),           // HORAS_DIA — con sufijo "h", ver csvHoras()
                    csvHoras(g.HORAS_SEMANA),    // HORAS_SEMANA — con sufijo "h", ver csvHoras()
                    d.obs                        // OBSERVACION — última columna
                ]);
            });
        });
        return filas;
    }

    function aCSV(grupos) {
        const lineas = [CSV_HEADERS.join(',')];
        aFilas(grupos).forEach(fila => lineas.push(fila.map(csvEscape).join(',')));
        return lineas.join('\n');
    }

    // Texto legible para copiar al portapapeles (no es CSV: pensado
    // para pegar en un chat/correo, no en una hoja de cálculo).
    function aTextoLegible(grupo) {
        const M = window.HorarioModel;
        const vigencia = grupo.FECHA_FIN ? `${grupo.FECHA_INICIO} → ${grupo.FECHA_FIN}` : `Desde ${grupo.FECHA_INICIO}`;
        let texto = `Horario ${grupo.ID_GRUPO} — ${grupo.EMPLEADO || ''}\n`;
        texto += `Vigencia: ${vigencia}  |  Estado: ${grupo.ESTADO}  |  Total semanal: ${M ? M.horasDecimalATexto(grupo.HORAS_SEMANA) : grupo.HORAS_SEMANA}h\n\n`;
        (grupo.DIAS || []).forEach(d => {
            texto += `${d.dia}: ${d.ingreso}`;
            if (d.inicioRef || d.finRef) texto += ` (ref. ${d.inicioRef || '—'}-${d.finRef || '—'})`;
            texto += ` a ${d.salida}`;
            if (d.obs) texto += `  · ${d.obs}`;
            texto += '\n';
        });
        return texto;
    }

    function descargarGrupo(grupo) {
        const nombre = `horario_${grupo.ID_GRUPO}_${(grupo.EMPLEADO || '').replace(/[^\wÀ-ÿ]+/g, '_')}.csv`;
        window.descargarArchivo(nombre, aCSV([grupo]));
        window.toast('📥 Horario descargado', 'success');
    }

    function copiarGrupo(grupo) {
        window.copiarTexto(aTextoLegible(grupo));
    }

    async function descargarTodos() {
        window.toast('⏳ Preparando descarga de todos los horarios...', 'info');
        const result = await window.HorarioAPI.listar();
        if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
            window.toast('⚠️ ' + (result.message || 'No hay horarios registrados'), 'warning');
            return;
        }
        window.descargarArchivo(`horarios_todos_${new Date().toISOString().slice(0,10)}.csv`, aCSV(result.data));
        window.toast(`📥 ${result.data.length} horario(s) descargado(s)`, 'success');
    }

    async function descargarDeEmpleado(code, nombreArchivo) {
        const result = await window.HorarioAPI.listar(code);
        if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
            window.toast('⚠️ Este empleado no tiene horarios registrados', 'warning');
            return;
        }
        window.descargarArchivo(nombreArchivo, aCSV(result.data));
        window.toast(`📥 ${result.data.length} horario(s) descargado(s)`, 'success');
    }

    return { aCSV, aTextoLegible, descargarGrupo, copiarGrupo, descargarTodos, descargarDeEmpleado };
})();

// Botón del sidebar: "Exportar Horarios" — genera directamente el
// .xlsx "Horarios_RRHH" (mismo formato que antes producía el macro
// de Excel: COLABORADOR (ID) | FECHA INICIO | DÍAS | HORARIO |
// HORAS/SEMANA, con los días agrupados y sin líneas de "Descanso"),
// con TODOS los horarios VIGENTES de TODOS los empleados. No
// requiere tener a nadie seleccionado en Lista de Personal, ni
// pasar por CSV/Excel/macro.
window.exportarTodosHorarios = async function() {
    window.toast('⏳ Generando Horarios_RRHH.xlsx...', 'info');
    const result = await window.HorarioAPI.listar();
    if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
        window.toast('⚠️ ' + (result.message || 'No hay horarios registrados'), 'warning');
        return;
    }
    const vigentes = result.data.filter(g => g.ESTADO === 'Vigente');
    if (vigentes.length === 0) {
        window.toast('⚠️ No hay horarios vigentes para exportar', 'warning');
        return;
    }
    const ok = window.HorarioExportXLSX.generar(vigentes);
    if (ok) window.toast(`📥 ${vigentes.length} horario(s) exportado(s)`, 'success');
};

// Descarga alternativa: el CSV plano (una fila por día, TODOS los
// horarios sin filtrar por ESTADO) que antes usaba el botón de
// arriba. Se conserva por si se necesita el detalle crudo tal cual
// está en BD_HORARIOS, ya que "exportarTodosHorarios" ahora entrega
// el .xlsx amigable en su lugar.
window.exportarTodosHorariosCSV = function() {
    window.HorarioExport.descargarTodos();
};

// Botón "Exportar" dentro del modal de Horarios — descarga solo los
// horarios del empleado actualmente seleccionado.
window.exportarHorariosEmpleadoActual = function() {
    if (!window.personalSeleccionado) {
        window.toast('⚠️ No hay empleado seleccionado', 'warning');
        return;
    }
    const nombre = `horarios_${window.personalSeleccionado.CODE}_${(window.personalSeleccionado.NOMBRES || '').replace(/[^\wÀ-ÿ]+/g, '_')}.csv`;
    window.HorarioExport.descargarDeEmpleado(window.personalSeleccionado.CODE, nombre);
};

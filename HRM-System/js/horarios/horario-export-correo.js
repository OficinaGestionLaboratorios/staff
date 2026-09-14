// ============================================================
// HORARIO-EXPORT-CORREO.JS — Genera el .xlsx "carta de horario"
// (formato para pegar/adjuntar en un correo electrónico) por CADA
// horario emitido, uno por colaborador.
// ============================================================
// No es un reporte interno como Horarios_RRHH.xlsx (horario-export-
// xlsx.js): es la carta que se envía al colaborador para que
// confirme su horario propuesto. Reproduce EXACTAMENTE el formato
// de ejemplo que se recibió (mismo texto, mismo orden de filas,
// mismos merges y el mismo estilo de encabezado con fondo celeste):
// título "CONFIRMACIÓN DE HORARIO: ..." arriba de todo, luego el
// cuerpo de la carta, la tabla con bordes y cierre sin repetir el
// título al final — calculado en el navegador con los datos que ya
// devuelve HorarioAPI.listar(), sin volver a pasar por Excel a mano.
//
// Reutiliza armarDiasYHorario() de HorarioExportXLSX para que los
// días consecutivos con el mismo horario se agrupen exactamente
// igual que en el reporte de RRHH (una sola fuente de verdad para
// ese algoritmo).
//
// Requiere xlsx-js-style (ya cargado en app.html para
// horario-export-xlsx.js).
// ============================================================

window.HorarioExportCorreo = (function() {

    const CELESTE_ENCABEZADO = 'FFDCE6F1';
    const BORDE_TABLA = { style: 'thin', color: { rgb: 'FFB7C6D9' } };
    const BORDE_CELDA = { top: BORDE_TABLA, bottom: BORDE_TABLA, left: BORDE_TABLA, right: BORDE_TABLA };

    function fuente(extra) {
        return Object.assign({ name: 'Calibri', sz: 11 }, extra || {});
    }

    // Texto de la última columna ("Jornada"): total de horas de la
    // semana. Se muestra como texto legible ("44:00 h"), nunca como
    // duración numérica de Excel — así se evita que, al superar las
    // 24 horas, Excel/los lectores la interpreten como "1 día y
    // 20:00:00" en vez de "44 horas".
    function jornadaTexto(horasSemana) {
        const M = window.HorarioModel;
        return `${M ? M.horasDecimalATexto(horasSemana) : horasSemana} h`;
    }

    function fechaVigenciaTexto(grupo) {
        const M = window.HorarioModel;
        return M ? M.fechaATextoLegible(grupo.FECHA_INICIO) : grupo.FECHA_INICIO;
    }

    function nombreYEncabezado(grupo) {
        const nombre = (grupo.EMPLEADO || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
        return { nombre, encabezadoNombre: `${nombre} (Id: ${grupo.ID_PERSONAL || ''})` };
    }

    // Construye el libro para UN solo grupo/colaborador y dispara la
    // descarga. Devuelve true/false según si pudo generarlo.
    function generar(grupo) {
        if (typeof XLSX === 'undefined' || !XLSX.utils) {
            window.toast('⚠️ No se pudo cargar la librería de Excel (XLSX). Revisa tu conexión.', 'warning');
            return false;
        }
        if (!grupo) {
            window.toast('⚠️ No hay horario seleccionado', 'warning');
            return false;
        }

        const { nombre, encabezadoNombre } = nombreYEncabezado(grupo);
        const { dias, horario } = window.HorarioExportXLSX.armarDiasYHorario(grupo);
        const lineasDias = dias ? dias.split('\n') : [];
        const lineasHorario = horario ? horario.split('\n') : [];
        const numFilasDetalle = Math.max(1, lineasDias.length);

        const totalCols = 5;
        const ws = {};
        const merges = [];

        function setCell(r, c, valor, estilo) {
            const addr = XLSX.utils.encode_cell({ r, c });
            ws[addr] = { v: valor, t: typeof valor === 'number' ? 'n' : 's', s: estilo };
        }

        function mergeFilaCompleta(r) {
            merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
        }

        // ---- Título (fila 1 del ejemplo → índice 0) ----
        setCell(0, 0, `CONFIRMACIÓN DE HORARIO: ${encabezadoNombre}`, { font: fuente({ bold: true }), alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
        mergeFilaCompleta(0);

        // ---- Cuerpo de la carta (idéntico al ejemplo, fila por fila) ----
        setCell(2, 0, 'Estimada(o) compañera(o):', { font: fuente(), alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
        mergeFilaCompleta(2);

        setCell(4, 0, 'De mi mayor consideración, reciba un cordial saludo.', { font: fuente(), alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
        mergeFilaCompleta(4);

        setCell(5, 0, 'Por medio de la presente, remito el horario propuesto según el siguiente detalle:', { font: fuente(), alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
        mergeFilaCompleta(5);

        // ---- Encabezado de la tabla (fila 8 del ejemplo → índice 7) ----
        const headers = ['Empleado', 'F. Vigencia', 'Días', 'Horario', 'Jornada'];
        const filaHeader = 7;
        headers.forEach((h, c) => {
            setCell(filaHeader, c, h, {
                font: fuente({ bold: true }),
                fill: { fgColor: { rgb: CELESTE_ENCABEZADO } },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: BORDE_CELDA
            });
        });

        // ---- Fila del colaborador + filas de detalle de días ----
        const filaColaborador = filaHeader + 1;
        setCell(filaColaborador, 0, encabezadoNombre, { font: fuente(), alignment: { horizontal: 'left', vertical: 'center' }, border: BORDE_CELDA });
        setCell(filaColaborador, 1, fechaVigenciaTexto(grupo), { font: fuente(), alignment: { horizontal: 'left', vertical: 'center' }, border: BORDE_CELDA });
        setCell(filaColaborador, 4, jornadaTexto(grupo.HORAS_SEMANA), { font: fuente(), alignment: { horizontal: 'left', vertical: 'center' }, border: BORDE_CELDA });
        if (numFilasDetalle > 1) {
            merges.push({ s: { r: filaColaborador, c: 0 }, e: { r: filaColaborador + numFilasDetalle - 1, c: 0 } });
            merges.push({ s: { r: filaColaborador, c: 1 }, e: { r: filaColaborador + numFilasDetalle - 1, c: 1 } });
            merges.push({ s: { r: filaColaborador, c: 4 }, e: { r: filaColaborador + numFilasDetalle - 1, c: 4 } });
        }
        for (let i = 0; i < numFilasDetalle; i++) {
            const r = filaColaborador + i;
            // Bordes en las celdas C/D de cada fila de detalle, y también
            // en A/B/E para las filas que quedan "debajo" de una celda
            // fusionada (Excel exige un estilo por celda del rango, aunque
            // esté vacía, para que el borde se vea continuo en todo el
            // bloque fusionado).
            if (i > 0) {
                setCell(r, 0, '', { border: BORDE_CELDA });
                setCell(r, 1, '', { border: BORDE_CELDA });
                setCell(r, 4, '', { border: BORDE_CELDA });
            }
            setCell(r, 2, lineasDias[i] || '', { font: fuente(), alignment: { horizontal: 'left', vertical: 'center' }, border: BORDE_CELDA });
            setCell(r, 3, lineasHorario[i] || '', { font: fuente(), alignment: { horizontal: 'left', vertical: 'center' }, border: BORDE_CELDA });
        }

        // ---- Cierre de la carta (sin repetir el título al final) ----
        let r = filaColaborador + numFilasDetalle + 1;
        setCell(r, 0, 'Agradeceré que pueda remitir su conformidad como manifestación de aceptación del presente horario.', { font: fuente(), alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
        mergeFilaCompleta(r);
        r += 1;
        setCell(r, 0, 'Sin otro particular, quedo atento a sus comentarios.', { font: fuente(), alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
        mergeFilaCompleta(r);
        r += 1;
        setCell(r, 0, 'Un cordial saludo.', { font: fuente(), alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
        mergeFilaCompleta(r);

        const ultimaFila = r;
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ultimaFila, c: totalCols - 1 } });
        ws['!merges'] = merges;
        ws['!cols'] = [{ wch: 41.45 }, { wch: 12.45 }, { wch: 14.73 }, { wch: 26.45 }, { wch: 11.45 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'TempPDF');

        const nombreArchivo = `correo_horario_${grupo.ID_GRUPO}_${nombre.replace(/[^\wÀ-ÿ]+/g, '_')}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo, { bookType: 'xlsx', cellStyles: true });
        return true;
    }

    // Escapa texto para insertarlo dentro de HTML (previsualización y
    // portapapeles) sin romper el marcado ni permitir inyección.
    function escHTML(v) {
        return String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Misma carta que generar() (mismo texto, mismo orden de filas,
    // mismos merges y el mismo celeste de encabezado) pero como
    // <table> HTML en vez de libro .xlsx. Un <table> con estilos
    // inline es lo que Outlook/Gmail/Word entienden al pegar: por
    // eso NO se usa una hoja de estilos aparte, cada celda lleva su
    // propio "style=" (los clientes de correo ignoran <style> y
    // clases CSS al pegar contenido).
    //
    // La tabla usa table-layout:fixed + anchos en % (proporcionales a
    // los mismos anchos de columna del .xlsx) en vez de un ancho fijo
    // en píxeles: así el contenido nunca se sale del modal ni de la
    // ventana del correo donde se pegue, sin importar el tamaño de
    // pantalla — el texto largo (nombre, rango de horario) se ajusta
    // con salto de línea dentro de su columna en lugar de desbordar.
    function generarHTML(grupo) {
        const { encabezadoNombre } = nombreYEncabezado(grupo);
        const { dias, horario } = window.HorarioExportXLSX.armarDiasYHorario(grupo);
        const lineasDias = dias ? dias.split('\n') : [];
        const lineasHorario = horario ? horario.split('\n') : [];
        const numFilas = Math.max(1, lineasDias.length);

        const F = "font-family:Calibri,Arial,sans-serif;font-size:14px;color:#000000;";
        // Celdas de la TABLA (encabezado y contenido: Empleado, F.
        // Vigencia, Días, Horario, Jornada): antes partían el texto
        // en varias líneas dentro de la celda (word-break/overflow-
        // wrap); ahora van en una sola línea — si el contenido
        // necesita más espacio, la columna crece en vez de partir el
        // texto (#correoHorarioPreview ya tiene scroll horizontal
        // propio por si la tabla completa no entra en el modal).
        const AJUSTE_CELDA = 'white-space:nowrap;';
        const celda = `${F}${AJUSTE_CELDA}padding:4px 8px;border:1px solid #B7C6D9;vertical-align:top;box-sizing:border-box;`;
        const th = `${celda}background-color:#DCE6F1;font-weight:bold;text-align:center;`;
        // Párrafos de la carta (saludo, cuerpo, cierre): estos SÍ
        // deben seguir ajustándose con salto de línea normal, ya que
        // son oraciones largas y forzarlas a una sola línea las
        // saldría del ancho del correo.
        const AJUSTE_TEXTO = 'word-break:break-word;overflow-wrap:break-word;';

        let filasDetalle = '';
        for (let i = 0; i < numFilas; i++) {
            filasDetalle += '<tr>';
            if (i === 0) {
                filasDetalle += `<td style="${celda}" rowspan="${numFilas}">${escHTML(encabezadoNombre)}</td>`;
                filasDetalle += `<td style="${celda}" rowspan="${numFilas}">${escHTML(fechaVigenciaTexto(grupo))}</td>`;
            }
            filasDetalle += `<td style="${celda}">${escHTML(lineasDias[i] || '')}</td>`;
            filasDetalle += `<td style="${celda}">${escHTML(lineasHorario[i] || '')}</td>`;
            if (i === 0) {
                filasDetalle += `<td style="${celda}" rowspan="${numFilas}">${escHTML(jornadaTexto(grupo.HORAS_SEMANA))}</td>`;
            }
            filasDetalle += '</tr>';
        }

        // Anchos proporcionales a ['!cols'] de generar(): 41.45,
        // 12.45, 14.73, 26.45, 11.45 (suma ≈ 106.5) → % redondeados.
        // Con table-layout:auto son solo una sugerencia de reparto:
        // si el contenido de una columna (en una sola línea) necesita
        // más espacio, esa columna crece en vez de partir el texto.
        const colgroup = `
<colgroup>
<col style="width:39%"><col style="width:12%"><col style="width:14%"><col style="width:25%"><col style="width:10%">
</colgroup>`;

        // El texto de la carta (título, saludo, cuerpo, cierre) va
        // FUERA de la tabla, en párrafos normales que ocupan el 100%
        // del ancho y se ajustan con salto de línea normal. Antes
        // estaba dentro de filas <tr colspan="5"> de la MISMA tabla
        // que la grilla de horario: al forzar esa grilla a una sola
        // línea (sin wrap) la tabla completa se volvía más ancha que
        // el modal, y como los párrafos compartían el mismo scroll
        // horizontal de la tabla, al desplazarse para ver "Jornada"
        // se ocultaba el inicio de cada párrafo — de ahí las
        // esquinas/lados recortados que no se veían profesionales.
        // Ahora el scroll horizontal, si hace falta, queda aislado
        // solo en el contenedor de la tabla; los párrafos siempre se
        // ven completos.
        const textoAntes = `
<div style="${F}${AJUSTE_TEXTO}">
<p style="margin:0 0 8px 0;font-weight:bold;">CONFIRMACIÓN DE HORARIO: ${escHTML(encabezadoNombre)}</p>
<p style="margin:0 0 8px 0;">Estimada(o) compañera(o):</p>
<p style="margin:0 0 4px 0;">De mi mayor consideración, reciba un cordial saludo.</p>
<p style="margin:0 0 8px 0;">Por medio de la presente, remito el horario propuesto según el siguiente detalle:</p>
</div>`;

        const textoDespues = `
<div style="${F}${AJUSTE_TEXTO}">
<p style="margin:8px 0 4px 0;">Agradeceré que pueda remitir su conformidad como manifestación de aceptación del presente horario.</p>
<p style="margin:0 0 4px 0;">Sin otro particular, quedo atento a sus comentarios.</p>
<p style="margin:0;">Un cordial saludo.</p>
</div>`;

        const tabla = `
<div style="overflow-x:auto;max-width:100%;">
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;table-layout:auto;box-sizing:border-box;">
${colgroup}
<tr>
<td style="${th}">Empleado</td><td style="${th}">F. Vigencia</td><td style="${th}">Días</td><td style="${th}">Horario</td><td style="${th}">Jornada</td>
</tr>
${filasDetalle}
</table>
</div>`;

        return `${textoAntes}${tabla}${textoDespues}`.trim();
    }

    // Versión en texto plano de la misma carta, por si el cliente de
    // correo no acepta HTML al pegar (fallback de copiarCorreoHorarioModal).
    // Las columnas de la tabla se separan con tabulador para que, si el
    // destino sí entiende tablas (Excel, Sheets, algunos correos en
    // texto enriquecido), las columnas igual queden alineadas.
    function generarTextoPlano(grupo) {
        const { encabezadoNombre } = nombreYEncabezado(grupo);
        const { dias, horario } = window.HorarioExportXLSX.armarDiasYHorario(grupo);
        const lineasDias = dias ? dias.split('\n') : [];
        const lineasHorario = horario ? horario.split('\n') : [];
        const numFilas = Math.max(1, lineasDias.length);

        let t = `CONFIRMACIÓN DE HORARIO: ${encabezadoNombre}\n\n`;
        t += 'Estimada(o) compañera(o):\n\n';
        t += 'De mi mayor consideración, reciba un cordial saludo.\n';
        t += 'Por medio de la presente, remito el horario propuesto según el siguiente detalle:\n\n';
        t += 'Empleado\tF. Vigencia\tDías\tHorario\tJornada\n';
        for (let i = 0; i < numFilas; i++) {
            const col1 = i === 0 ? encabezadoNombre : '';
            const col2 = i === 0 ? fechaVigenciaTexto(grupo) : '';
            const col5 = i === 0 ? jornadaTexto(grupo.HORAS_SEMANA) : '';
            t += `${col1}\t${col2}\t${lineasDias[i] || ''}\t${lineasHorario[i] || ''}\t${col5}\n`;
        }
        t += '\nAgradeceré que pueda remitir su conformidad como manifestación de aceptación del presente horario.\n';
        t += 'Sin otro particular, quedo atento a sus comentarios.\n';
        t += 'Un cordial saludo.\n';
        return t;
    }

    return { generar, generarHTML, generarTextoPlano };
})();

// Ya no se usa como acción directa del botón "Correo" (ver
// abrirModalCorreoHorario más abajo), pero se conserva porque el
// botón "Descargar Excel" dentro del modal de vista previa sigue
// llamando a esta misma función para generar el .xlsx.
window.generarCorreoGrupoHorario = function(grupo) {
    if (window.HorarioExportCorreo.generar(grupo)) {
        window.toast('📧 Formato de correo generado', 'success');
    }
};

// ============================================================
// MODAL "Vista previa de correo" — reemplaza la descarga directa
// del botón ✉️. Etapa 1: muestra la carta ya armada (misma
// tabla/estilo que el .xlsx) para revisarla antes de enviarla.
// Etapa 2: un solo clic en "Copiar todo" la deja lista para pegar
// tal cual en el cuerpo del correo (Outlook/Gmail), conservando el
// mismo formato de tabla con encabezado celeste que tiene el Excel;
// "Descargar Excel" sigue disponible por si se prefiere adjuntarlo,
// y "Cerrar" descarta la vista previa sin hacer nada más.
// ============================================================

let horarioCorreoModalGrupo = null;

window.abrirModalCorreoHorario = function(grupo) {
    if (!grupo) {
        window.toast('⚠️ No hay horario seleccionado', 'warning');
        return;
    }
    const modal = document.getElementById('modalCorreoHorario');
    const cuerpo = document.getElementById('correoHorarioPreview');
    if (!modal || !cuerpo) return;

    horarioCorreoModalGrupo = grupo;
    cuerpo.innerHTML = window.HorarioExportCorreo.generarHTML(grupo);

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.cerrarModalCorreoHorario = function() {
    const modal = document.getElementById('modalCorreoHorario');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    horarioCorreoModalGrupo = null;
};

// Descarga el .xlsx del grupo actualmente en vista previa (misma
// función que antes disparaba el botón ✉️ directamente).
window.descargarCorreoHorarioModal = function() {
    if (!horarioCorreoModalGrupo) return;
    window.generarCorreoGrupoHorario(horarioCorreoModalGrupo);
};

// Copia la carta al portapapeles con su formato de tabla (HTML), con
// una versión en texto plano de respaldo. Se usa el truco clásico de
// seleccionar un nodo oculto (contenteditable) y document.execCommand
// ('copy') en vez de solo la Clipboard API moderna: así el HTML
// enriquecido se copia también en equipos con navegadores/Outlook
// más antiguos, típicos de un entorno de RRHH, sin pedir permisos de
// portapapeles.
window.copiarCorreoHorarioModal = async function() {
    if (!horarioCorreoModalGrupo) return;
    const html = window.HorarioExportCorreo.generarHTML(horarioCorreoModalGrupo);
    const texto = window.HorarioExportCorreo.generarTextoPlano(horarioCorreoModalGrupo);

    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    host.style.cssText = 'position:fixed;top:0;left:0;width:680px;overflow:hidden;opacity:0;pointer-events:none;';
    host.innerHTML = html;
    document.body.appendChild(host);

    let copiado = false;
    try {
        const rango = document.createRange();
        rango.selectNodeContents(host);
        const seleccion = window.getSelection();
        seleccion.removeAllRanges();
        seleccion.addRange(rango);
        copiado = document.execCommand('copy');
        seleccion.removeAllRanges();
    } catch (e) {
        copiado = false;
    }
    document.body.removeChild(host);

    // Si el truco de execCommand falla (navegador no lo soporta), se
    // intenta con la Clipboard API moderna como respaldo.
    if (!copiado) {
        try {
            if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': new Blob([html], { type: 'text/html' }),
                        'text/plain': new Blob([texto], { type: 'text/plain' })
                    })
                ]);
                copiado = true;
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(texto);
                copiado = true;
            }
        } catch (e) {
            copiado = false;
        }
    }

    if (copiado) {
        window.toast('📋 Copiado — pégalo directo en el cuerpo del correo', 'success');
    } else {
        window.toast('⚠️ No se pudo copiar automáticamente. Selecciona el texto y usa Ctrl+C.', 'warning');
    }
};

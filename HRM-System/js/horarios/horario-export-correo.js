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

    const CELESTE_ENCABEZADO = 'FFE3E8ED';
    const BORDE_TABLA = { style: 'thin', color: { rgb: 'FFBFC8D1' } };
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

    // Saludo personalizado: busca el registro de Personal por
    // ID_PERSONAL (misma fuente que usa el listado de Personal,
    // window.API.getDatos()) para leer su SEXO — igual patrón que ya
    // usa sobretiempo-export-correo.js para el tratamiento Sr./Sra.
    // Si el SEXO está cargado, arma "Estimada Sra. {primer nombre}
    // {apellido paterno}" / "Estimado Sr. {primer nombre} {apellido
    // paterno}"; si no hay SEXO cargado (o no se encuentra el
    // registro), se mantiene el saludo genérico de siempre.
    function saludoCarta(grupo) {
        const datos = (window.API && window.API.getDatos) ? (window.API.getDatos() || []) : [];
        const personal = datos.find(p => String(p.ID_PERSONAL) === String(grupo.ID_PERSONAL || ''));
        const sexo = window.sexoPersona(personal);
        if (!personal || (sexo !== 'femenino' && sexo !== 'masculino')) {
            return 'Estimada(o) compañera(o):';
        }
        const primerNombre = String(personal.NOMBRES || '').trim().split(/\s+/)[0] || '';
        const apellido = String(personal.APE_PATERNO || '').trim();
        const tratamiento = sexo === 'femenino' ? 'Estimada Sra.' : 'Estimado Sr.';
        return `${tratamiento} ${primerNombre} ${apellido}`.replace(/\s+/g, ' ').trim() + ':';
    }

    // Construye el libro para UN solo grupo/colaborador. Devuelve
    // { wb, nombreArchivo } o null si no pudo (ya avisó con un toast).
    function construirLibro(grupo) {
        if (typeof XLSX === 'undefined' || !XLSX.utils) {
            window.toast('⚠️ No se pudo cargar la librería de Excel (XLSX). Revisa tu conexión.', 'warning');
            return null;
        }
        if (!grupo) {
            window.toast('⚠️ No hay horario seleccionado', 'warning');
            return null;
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
        setCell(2, 0, saludoCarta(grupo), { font: fuente(), alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
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
        return { wb, nombreArchivo };
    }

    // Descarga el .xlsx. Devuelve true/false según si pudo generarlo.
    function generar(grupo) {
        const l = construirLibro(grupo);
        if (!l) return false;
        XLSX.writeFile(l.wb, l.nombreArchivo, { bookType: 'xlsx', cellStyles: true });
        return true;
    }

    // El mismo .xlsx como adjunto de correo: { name, type, dataUrl, size } o null.
    const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    function generarAdjunto(grupo) {
        const l = construirLibro(grupo);
        if (!l) return null;
        const base64 = XLSX.write(l.wb, { bookType: 'xlsx', type: 'base64', cellStyles: true });
        return { name: l.nombreArchivo, type: MIME_XLSX, dataUrl: `data:${MIME_XLSX};base64,${base64}`, size: Math.round(base64.length * 0.75) };
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

        const F = "font-family:Calibri,Arial,sans-serif;font-size:14px;color:#32363A;";
        // Celdas de la TABLA (encabezado y contenido: Empleado, F.
        // Vigencia, Días, Horario, Jornada): antes partían el texto
        // en varias líneas dentro de la celda (word-break/overflow-
        // wrap); ahora van en una sola línea — si el contenido
        // necesita más espacio, la columna crece en vez de partir el
        // texto (#ogcPreview ya tiene scroll horizontal
        // propio por si la tabla completa no entra en el modal).
        const AJUSTE_CELDA = 'white-space:nowrap;';
        // Fondo BLANCO explícito en todo (carta, tabla y celdas): si no
        // se declara, al copiar el navegador arrastra el fondo azulado
        // de la página (#E9EDF1) y el correo pegado sale con ese tono.
        // Lo único sombreado son los encabezados de la tabla.
        const BLANCO = 'background-color:#FFFFFF;';
        const celdaBase = `${F}${AJUSTE_CELDA}padding:4px 8px;border:1px solid #BFC8D1;vertical-align:top;box-sizing:border-box;`;
        const celda = `${celdaBase}${BLANCO}`;
        const th = `${celdaBase}background-color:#E3E8ED;font-weight:bold;text-align:center;`;
        // Párrafos de la carta (saludo, cuerpo, cierre): estos SÍ
        // deben seguir ajustándose con salto de línea normal, ya que
        // son oraciones largas y forzarlas a una sola línea las
        // saldría del ancho del correo.
        const AJUSTE_TEXTO = 'word-break:break-word;overflow-wrap:break-word;';

        let filasDetalle = '';
        for (let i = 0; i < numFilas; i++) {
            filasDetalle += '<tr>';
            if (i === 0) {
                filasDetalle += `<td bgcolor="#FFFFFF" style="${celda}" rowspan="${numFilas}">${escHTML(encabezadoNombre)}</td>`;
                filasDetalle += `<td bgcolor="#FFFFFF" style="${celda}" rowspan="${numFilas}">${escHTML(fechaVigenciaTexto(grupo))}</td>`;
            }
            filasDetalle += `<td bgcolor="#FFFFFF" style="${celda}">${escHTML(lineasDias[i] || '')}</td>`;
            filasDetalle += `<td bgcolor="#FFFFFF" style="${celda}">${escHTML(lineasHorario[i] || '')}</td>`;
            if (i === 0) {
                filasDetalle += `<td bgcolor="#FFFFFF" style="${celda}" rowspan="${numFilas}">${escHTML(jornadaTexto(grupo.HORAS_SEMANA))}</td>`;
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
<div style="${F}${AJUSTE_TEXTO}${BLANCO}">
<p style="margin:0 0 8px 0;">${escHTML(saludoCarta(grupo))}</p>
<p style="margin:0 0 4px 0;">De mi mayor consideración, reciba un cordial saludo.</p>
<p style="margin:0 0 8px 0;">Por medio de la presente, remito el horario propuesto según el siguiente detalle:</p>
</div>`;

        const textoDespues = `
<div style="${F}${AJUSTE_TEXTO}${BLANCO}">
<p style="margin:8px 0 4px 0;">Agradeceré que pueda <strong>remitir su conformidad</strong> como manifestación de aceptación del presente horario.</p>
<p style="margin:0 0 4px 0;">Sin otro particular, quedo atento a sus comentarios.</p>
<p style="margin:0;">Un cordial saludo.</p>
</div>`;

        const tabla = `
<div style="overflow-x:auto;max-width:100%;${BLANCO}">
<table cellspacing="0" cellpadding="0" bgcolor="#FFFFFF" style="border-collapse:collapse;width:100%;table-layout:auto;box-sizing:border-box;${BLANCO}">
${colgroup}
<tr>
<td bgcolor="#E3E8ED" style="${th}">Empleado</td><td bgcolor="#E3E8ED" style="${th}">F. Vigencia</td><td bgcolor="#E3E8ED" style="${th}">Días</td><td bgcolor="#E3E8ED" style="${th}">Horario</td><td bgcolor="#E3E8ED" style="${th}">Jornada</td>
</tr>
${filasDetalle}
</table>
</div>`;

        return `${textoAntes}${tabla}${textoDespues}`.trim();
    }

    // Versión en texto plano de la misma carta, por si el cliente de
    // correo no acepta HTML al pegar (respaldo de «Copiar todo» en js/core/correo-modal.js).
    // Las columnas de la tabla se separan con tabulador para que, si el
    // destino sí entiende tablas (Excel, Sheets, algunos correos en
    // texto enriquecido), las columnas igual queden alineadas.
    function generarTextoPlano(grupo) {
        const { encabezadoNombre } = nombreYEncabezado(grupo);
        const { dias, horario } = window.HorarioExportXLSX.armarDiasYHorario(grupo);
        const lineasDias = dias ? dias.split('\n') : [];
        const lineasHorario = horario ? horario.split('\n') : [];
        const numFilas = Math.max(1, lineasDias.length);

        // El título ("Confirmación de horario: …") va solo en el asunto, no en el cuerpo.
        let t = `${saludoCarta(grupo)}\n\n`;
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

    // Asunto del correo (misma identificación que el título de la carta).
    function asunto(grupo) { return `Confirmación de horario – ${nombreYEncabezado(grupo).encabezadoNombre}`; }

    // Correo institucional del colaborador (para precargar «Para»), si está cargado en Personal.
    function correoColaborador(grupo) {
        const datos = (window.API && window.API.getDatos) ? (window.API.getDatos() || []) : [];
        const p = datos.find(x => String(x.ID_PERSONAL) === String(grupo.ID_PERSONAL || ''));
        return String((p && p.EMAIL_INSTITUCIONAL) || '').trim();
    }

    return { generar, generarAdjunto, generarHTML, generarTextoPlano, asunto, correoColaborador };
})();

// Lo usa el botón "Descargar Excel" del modal de vista previa
// (ver abrirModalCorreoHorario más abajo).
window.generarCorreoGrupoHorario = function(grupo) {
    if (window.HorarioExportCorreo.generar(grupo)) {
        window.toast('📧 Formato de correo generado', 'success');
    }
};

// ============================================================
// Apertura del modal único de correo (js/core/correo-modal.js) —
// el mismo que usan Sobretiempo y Descanso médico: vista previa
// editable, «Copiar todo» (conserva la tabla con encabezado celeste
// al pegar en Outlook/Gmail) y «Enviar correo» con la cuenta
// corporativa. «Descargar Excel» sigue disponible en el pie.
// ============================================================
window.abrirModalCorreoHorario = function(grupo) {
    if (!grupo) {
        window.toast('⚠️ No hay horario seleccionado', 'warning');
        return;
    }
    const E = window.HorarioExportCorreo;
    window.CorreoModal.abrir({
        clave: 'horario',
        titulo: 'Vista previa de correo',
        subtitulo: 'Carta de confirmación de horario: cópiala al cuerpo del correo o envíala directo con tu cuenta corporativa',
        asunto: E.asunto(grupo),
        html: E.generarHTML(grupo),
        textoPlano: () => E.generarTextoPlano(grupo),
        // La carta va a cada colaborador: se precarga su correo institucional y no se recuerda el destinatario.
        paraInicial: E.correoColaborador(grupo),
        adjuntosAuto: [{
            id: 'excelHorario',
            etiqueta: 'Adjuntar el Excel de la carta de horario',
            etiquetaCorta: 'Excel de horario',
            marcado: false,
            generar: async () => {
                const a = E.generarAdjunto(grupo);
                return a ? { archivos: [a], fallos: [], total: 1 } : { archivos: [], fallos: ['No se pudo generar el Excel'], total: 1 };
            }
        }],
        botones: [{ texto: 'Descargar Excel', icono: 'fa-download', onClick: () => window.generarCorreoGrupoHorario(grupo) }]
    });
};

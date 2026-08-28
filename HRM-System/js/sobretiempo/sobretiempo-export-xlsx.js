// ============================================================
// SOBRETIEMPO-EXPORT-XLSX.JS — Genera el "FORMATO DE SOLICITUD DE
// AUTORIZACIÓN DE TRABAJO EN SOBRETIEMPO, FERIADO Y DESCANSO SEMANAL
// OBLIGATORIO" (código INS-DRH-F-30.01, Anexo 01 del procedimiento
// INS-DRH-P-30) ya completado con los datos de la solicitud.
// ============================================================
// Mismo patrón que horario-export-xlsx.js: se genera 100% en el
// navegador con xlsx-js-style (colores/bordes/negritas), sin backend.
//
// Reproduce la estructura del formato oficial:
//   Sección I  — datos del trabajador y de la labor (llenados con
//                los datos de Fase 1 "generación de horas").
//   Sección II — autorización de SRYBS (se deja en blanco: firma
//                física, fuera del alcance de este sistema).
//   Sección III — Control de Asistencia (llenada con los datos de
//                Fase 2 "registro del descanso"): observaciones y
//                total de horas efectivas.
//
// SOLO está disponible una vez que la solicitud está "Completa"
// (tiene FECHA_DESCANSO registrada) — ver botón "Exportar" en
// sobretiempo-ui.js, que solo se muestra en ese estado.
// ============================================================

window.SobretiempoExportXLSX = (function() {

    const AZUL = '1F4E78';
    const BLANCO = 'FFFFFF';
    const GRIS_BANDA = 'F2F2F2';
    const GRIS_TEXTO = '595959';
    const BORDE_COLOR = 'B7C6D9';
    const VERDE = '15803D';

    function bordeFino() {
        return {
            top: { style: 'thin', color: { rgb: BORDE_COLOR } },
            bottom: { style: 'thin', color: { rgb: BORDE_COLOR } },
            left: { style: 'thin', color: { rgb: BORDE_COLOR } },
            right: { style: 'thin', color: { rgb: BORDE_COLOR } }
        };
    }

    function fechaHoyTexto() {
        const d = new Date();
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    }

    function generar(registro) {
        if (typeof XLSX === 'undefined' || !XLSX.utils) {
            window.toast('⚠️ No se pudo cargar la librería de Excel (XLSX). Revisa tu conexión.', 'warning');
            return false;
        }
        if (registro.ESTADO !== 'Completo') {
            window.toast('⚠️ Esta solicitud aún no tiene registrado el descanso compensatorio — no se puede exportar todavía', 'warning');
            return false;
        }

        const M = window.SobretiempoModel;
        const totalCols = 8;
        const ws = {};
        const merges = [];
        const rowHeights = [];

        function setCell(r, c, valor, estilo) {
            const addr = XLSX.utils.encode_cell({ r, c });
            ws[addr] = { v: valor, t: typeof valor === 'number' ? 'n' : 's', s: estilo };
        }
        function merge(r1, c1, r2, c2) {
            merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
        }
        const fontLabel = { name: 'Arial', sz: 9, bold: true, color: { rgb: GRIS_TEXTO } };
        const fontValor = { name: 'Arial', sz: 10 };
        const fillCabecera = { fgColor: { rgb: AZUL } };
        const bordeCelda = { border: bordeFino() };

        // ---- Cabecera institucional ----
        setCell(0, 0, 'UNIVERSIDAD PRIVADA ANTENOR ORREGO', {
            font: { name: 'Arial', sz: 13, bold: true, color: { rgb: BLANCO } },
            fill: fillCabecera, alignment: { horizontal: 'center', vertical: 'center' }
        });
        merge(0, 0, 0, totalCols - 1);
        rowHeights[0] = { hpt: 22 };

        setCell(1, 0, 'FORMATO DE SOLICITUD DE AUTORIZACIÓN DE TRABAJO EN SOBRETIEMPO, FERIADO Y DESCANSO SEMANAL OBLIGATORIO', {
            font: { name: 'Arial', sz: 10, bold: true, color: { rgb: AZUL } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
        });
        merge(1, 0, 1, totalCols - 1);
        rowHeights[1] = { hpt: 30 };

        setCell(2, 0, `Código: INS-DRH-F-30.01   ·   Versión: 01   ·   Vigencia: 11/02/2026   ·   Generado desde la web el ${fechaHoyTexto()}`, {
            font: { name: 'Arial', sz: 8, italic: true, color: { rgb: GRIS_TEXTO } },
            alignment: { horizontal: 'center' }
        });
        merge(2, 0, 2, totalCols - 1);

        let r = 4;

        // ---- SECCIÓN I ----
        setCell(r, 0, 'SECCIÓN I – El Jefe inmediato completa esta parte y la presenta a la Sección de Remuneraciones y Beneficios Sociales', {
            font: { name: 'Arial', sz: 9, bold: true, color: { rgb: BLANCO } }, fill: fillCabecera,
            alignment: { horizontal: 'left', vertical: 'center' }
        });
        merge(r, 0, r, totalCols - 1);
        r += 2;

        function filaEtiquetaValor(fila, etiqueta, valor, colInicio, colFinEtiqueta, colFinValor) {
            setCell(fila, colInicio, etiqueta, { ...bordeCelda, font: fontLabel, fill: { fgColor: { rgb: GRIS_BANDA } }, alignment: { vertical: 'center', wrapText: true } });
            merge(fila, colInicio, fila, colFinEtiqueta);
            setCell(fila, colFinEtiqueta + 1, valor, { ...bordeCelda, font: fontValor, alignment: { vertical: 'center' } });
            merge(fila, colFinEtiqueta + 1, fila, colFinValor);
        }

        filaEtiquetaValor(r, 'NOMBRE DEL TRABAJADOR', (registro.EMPLEADO || '').replace(/\s*\([^)]*\)\s*$/, '').trim(), 0, 1, 5);
        setCell(r, 6, 'ID', { ...bordeCelda, font: fontLabel, fill: { fgColor: { rgb: GRIS_BANDA } }, alignment: { horizontal: 'center', vertical: 'center' } });
        setCell(r, 7, registro.ID_PERSONAL || '', { ...bordeCelda, font: fontValor, alignment: { horizontal: 'center', vertical: 'center' } });
        rowHeights[r] = { hpt: 20 };
        r++;

        filaEtiquetaValor(r, 'DEPENDENCIA', registro.DEPENDENCIA || '', 0, 1, totalCols - 1);
        rowHeights[r] = { hpt: 20 };
        r += 2;

        // Tipo de trabajo (marca con X el que corresponda)
        setCell(r, 0, 'TIPO DE TRABAJO', { font: fontLabel });
        merge(r, 0, r, totalCols - 1);
        r++;
        const tipos = [
            { label: 'TRABAJO EN SOBRETIEMPO', value: 'Sobretiempo' },
            { label: 'TRABAJO EN DÍA FERIADO', value: 'Feriado' },
            { label: 'TRABAJO EN DÍA DE DESCANSO SEMANAL OBLIGATORIO', value: 'Descanso Semanal Obligatorio' }
        ];
        let cCursor = 0;
        tipos.forEach(t => {
            const marcado = registro.TIPO_TRABAJO === t.value;
            setCell(r, cCursor, t.label, { ...bordeCelda, font: { name: 'Arial', sz: 8, bold: marcado }, fill: { fgColor: { rgb: marcado ? 'DCFCE7' : BLANCO } }, alignment: { vertical: 'center', wrapText: true } });
            merge(r, cCursor, r, cCursor + 1);
            setCell(r, cCursor + 2, marcado ? 'X' : '', { ...bordeCelda, font: { name: 'Arial', sz: 12, bold: true, color: { rgb: VERDE } }, alignment: { horizontal: 'center', vertical: 'center' } });
            cCursor += 3;
        });
        rowHeights[r] = { hpt: 34 };
        r += 2;

        // Fecha de ejecución / hora inicio / hora fin / total horas
        const headersFecha = ['FECHA DE EJECUCIÓN', 'HORA INICIO', 'HORA FIN', 'TOTAL DE HORAS'];
        headersFecha.forEach((h, i) => {
            setCell(r, i * 2, h, { ...bordeCelda, font: { name: 'Arial', sz: 9, bold: true, color: { rgb: BLANCO } }, fill: fillCabecera, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } });
            merge(r, i * 2, r, i * 2 + 1);
        });
        r++;
        const valoresFecha = [M.fechaATextoLegible(registro.FECHA_EJECUCION), registro.HORA_INICIO, registro.HORA_FIN, (registro.TOTAL_HORAS || '') + ' h'];
        valoresFecha.forEach((v, i) => {
            setCell(r, i * 2, v, { ...bordeCelda, font: { ...fontValor, bold: i === 3 }, alignment: { horizontal: 'center', vertical: 'center' } });
            merge(r, i * 2, r, i * 2 + 1);
        });
        rowHeights[r] = { hpt: 20 };
        r += 2;

        setCell(r, 0, 'ACTIVIDADES A REALIZAR', { font: fontLabel }); merge(r, 0, r, totalCols - 1); r++;
        setCell(r, 0, registro.ACTIVIDADES || '', { ...bordeCelda, font: fontValor, alignment: { vertical: 'top', wrapText: true } });
        merge(r, 0, r + 1, totalCols - 1);
        rowHeights[r] = { hpt: 40 };
        r += 3;

        setCell(r, 0, 'JUSTIFICACIÓN DE LA NECESIDAD', { font: fontLabel }); merge(r, 0, r, totalCols - 1); r++;
        setCell(r, 0, registro.JUSTIFICACION || '', { ...bordeCelda, font: fontValor, alignment: { vertical: 'top', wrapText: true } });
        merge(r, 0, r + 1, totalCols - 1);
        rowHeights[r] = { hpt: 40 };
        r += 3;

        setCell(r, 0, '(Firma del trabajador y visto bueno del jefe inmediato: sección física / manual)', {
            font: { name: 'Arial', sz: 8, italic: true, color: { rgb: GRIS_TEXTO } }
        });
        merge(r, 0, r, totalCols - 1);
        r += 2;

        // ---- SECCIÓN III (Control de Asistencia — descanso compensatorio) ----
        setCell(r, 0, 'SECCIÓN III – Control de Asistencia — Registro del descanso compensatorio', {
            font: { name: 'Arial', sz: 9, bold: true, color: { rgb: BLANCO } }, fill: fillCabecera,
            alignment: { horizontal: 'left', vertical: 'center' }
        });
        merge(r, 0, r, totalCols - 1);
        r += 2;

        filaEtiquetaValor(r, 'FECHA DE DESCANSO COMPENSATORIO', M.fechaATextoLegible(registro.FECHA_DESCANSO), 0, 2, 5);
        setCell(r, 6, 'TOTAL DE HORAS EFECTIVAS', { ...bordeCelda, font: fontLabel, fill: { fgColor: { rgb: GRIS_BANDA } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } });
        setCell(r, 7, (registro.TOTAL_HORAS_EFECTIVAS || '') + ' h', { ...bordeCelda, font: { ...fontValor, bold: true, color: { rgb: AZUL } }, alignment: { horizontal: 'center', vertical: 'center' } });
        rowHeights[r] = { hpt: 20 };
        r += 2;

        setCell(r, 0, 'OBSERVACIONES', { font: fontLabel }); merge(r, 0, r, totalCols - 1); r++;
        setCell(r, 0, registro.OBSERVACIONES_DESCANSO || '—', { ...bordeCelda, font: fontValor, alignment: { vertical: 'top', wrapText: true } });
        merge(r, 0, r + 1, totalCols - 1);
        rowHeights[r] = { hpt: 34 };
        r += 3;

        setCell(r, 0, `Solicitud ${registro.ID_SOLICITUD} — Este documento es propiedad intelectual de la Universidad Privada Antenor Orrego.`, {
            font: { name: 'Arial', sz: 7, italic: true, color: { rgb: GRIS_TEXTO } }
        });
        merge(r, 0, r, totalCols - 1);

        const ultimaFila = r;
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ultimaFila, c: totalCols - 1 } });
        ws['!merges'] = merges;
        ws['!cols'] = Array.from({ length: totalCols }, () => ({ wch: 15 }));
        ws['!rows'] = rowHeights;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'INS-DRH-F-30.01');

        const nombreArchivo = `Sobretiempo_${registro.ID_SOLICITUD}_${(registro.EMPLEADO || '').replace(/[^a-zA-Z0-9]+/g, '_')}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo, { bookType: 'xlsx', cellStyles: true });
        window.toast('📥 Excel generado — falta solo la Sección II (firma y sello de SRYBS)', 'success');
        return true;
    }

    return { generar };
})();

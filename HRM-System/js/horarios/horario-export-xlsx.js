// ============================================================
// HORARIO-EXPORT-XLSX.JS — Genera el .xlsx "Horarios_RRHH" desde
// la web, sin pasar por CSV ni por el macro de Excel.
// ============================================================
// Reproduce exactamente el mismo resultado que el macro
// GenerarHorariosRRHH.bas, pero calculado en el navegador con los
// datos que ya devuelve HorarioAPI.listar():
//   - Solo horarios con ESTADO === 'Vigente' (uno por colaborador;
//     lo calcula siempre el backend, así que es la fuente de verdad
//     real — más confiable que "la fecha de registro más reciente",
//     que era la aproximación que usaba el macro por no tener ESTADO
//     disponible en la hoja plana).
//   - Columnas: COLABORADOR (ID) | FECHA INICIO | DÍAS | HORARIO |
//     HORAS / SEMANA.
//   - Días consecutivos con el mismo horario se agrupan en una sola
//     línea dentro de la celda (ej. "Lunes, Martes, Miércoles").
//   - Los días sin horario registrado simplemente no aparecen (no
//     se genera ninguna línea "Descanso").
//
// Requiere la librería xlsx-js-style (cargada en index.html antes
// de este archivo) para poder aplicar colores/bordes/negritas al
// .xlsx generado — la librería SheetJS "a secas" no soporta estilos
// en su versión gratuita.
// ============================================================

window.HorarioExportXLSX = (function() {

    const AZUL = '1F4E78';
    const BLANCO = 'FFFFFF';
    const GRIS_BANDA = 'F2F2F2';
    const GRIS_TEXTO = '595959';
    const BORDE_COLOR = 'B7C6D9';

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
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
    }

    // Arma, para UN grupo vigente, las líneas ya agrupadas de
    // "DÍAS" y "HORARIO" — mismo algoritmo que el macro: recorre los
    // días en orden semanal, junta los consecutivos que comparten
    // exactamente el mismo texto de horario, y omite por completo
    // cualquier día que no tenga horario (no hay "Descanso").
    function armarDiasYHorario(grupo) {
        const M = window.HorarioModel;
        const ordenSemana = M.DIAS.map(d => d.key); // Lunes..Domingo

        const diasOrdenados = (grupo.DIAS || [])
            .filter(d => d.dia && d.ingreso && d.salida)
            .slice()
            .sort((a, b) => ordenSemana.indexOf(a.dia) - ordenSemana.indexOf(b.dia))
            .map(d => ({
                dia: d.dia,
                texto: (d.inicioRef && d.finRef)
                    ? `${d.ingreso} a ${d.inicioRef} Y ${d.finRef} a ${d.salida}`
                    : `${d.ingreso} a ${d.salida}`
            }));

        const lineasDias = [];
        const lineasHorario = [];
        let i = 0;
        while (i < diasOrdenados.length) {
            let j = i;
            while (j + 1 < diasOrdenados.length && diasOrdenados[j + 1].texto === diasOrdenados[i].texto) j++;
            lineasDias.push(diasOrdenados.slice(i, j + 1).map(x => x.dia).join(', '));
            lineasHorario.push(diasOrdenados[i].texto);
            i = j + 1;
        }

        return {
            dias: lineasDias.join('\n'),
            horario: lineasHorario.join('\n'),
            numLineas: Math.max(1, lineasDias.length)
        };
    }

    // Convierte los grupos ya filtrados/ordenados a las filas planas
    // que necesita generar().
    function construirFilas(gruposVigentes) {
        return gruposVigentes.map(grupo => {
            const nombre = (grupo.EMPLEADO || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
            const { dias, horario, numLineas } = armarDiasYHorario(grupo);
            return {
                colaboradorId: `${nombre} (${grupo.ID_PERSONAL || ''})`,
                fechaInicio: window.HorarioModel.fechaATextoLegible(grupo.FECHA_INICIO),
                dias, horario, numLineas,
                horasSemana: parseFloat(grupo.HORAS_SEMANA) || 0
            };
        });
    }

    // Construye el libro .xlsx completo (estilos incluidos) y
    // dispara la descarga.
    function generar(gruposVigentes) {
        if (typeof XLSX === 'undefined' || !XLSX.utils) {
            window.toast('⚠️ No se pudo cargar la librería de Excel (XLSX). Revisa tu conexión.', 'warning');
            return false;
        }

        // Ordenar por nombre de colaborador (igual que el macro)
        const filas = construirFilas(gruposVigentes).sort((a, b) =>
            a.colaboradorId.localeCompare(b.colaboradorId, 'es')
        );

        const totalCols = 5;
        const fechaGen = fechaHoyTexto();
        const ws = {};
        const merges = [];
        const rowHeights = [];

        function setCell(r, c, valor, estilo) {
            const addr = XLSX.utils.encode_cell({ r, c });
            ws[addr] = { v: valor, t: typeof valor === 'number' ? 'n' : 's', s: estilo };
        }

        // Fila 1: título
        setCell(0, 0, 'HORARIOS DE PERSONAL — PRESENTACIÓN PARA RECURSOS HUMANOS', {
            font: { name: 'Arial', sz: 14, bold: true, color: { rgb: BLANCO } },
            fill: { fgColor: { rgb: AZUL } },
            alignment: { horizontal: 'center', vertical: 'center' }
        });
        merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });
        rowHeights[0] = { hpt: 26 };

        // Fila 2: subtítulo
        setCell(1, 0, `Generado desde la web  ·  Fecha de generación: ${fechaGen}  ·  Total de colaboradores: ${filas.length}`, {
            font: { name: 'Arial', sz: 9, italic: true, color: { rgb: GRIS_TEXTO } },
            alignment: { horizontal: 'center' }
        });
        merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } });

        // Fila 4 (índice 3): encabezados
        const headers = ['COLABORADOR (ID)', 'FECHA INICIO', 'DÍAS', 'HORARIO', 'HORAS / SEMANA'];
        headers.forEach((h, c) => {
            setCell(3, c, h, {
                font: { name: 'Arial', sz: 10, bold: true, color: { rgb: BLANCO } },
                fill: { fgColor: { rgb: AZUL } },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: bordeFino()
            });
        });
        rowHeights[3] = { hpt: 24 };

        // Filas de datos
        let r = 4;
        filas.forEach((fila, idx) => {
            const banda = (idx % 2 === 1) ? GRIS_BANDA : BLANCO;
            const base = {
                font: { name: 'Arial', sz: 10 },
                border: bordeFino(),
                fill: { fgColor: { rgb: banda } }
            };
            setCell(r, 0, fila.colaboradorId, { ...base, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } });
            setCell(r, 1, fila.fechaInicio, { ...base, alignment: { horizontal: 'center', vertical: 'top' } });
            setCell(r, 2, fila.dias, { ...base, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } });
            setCell(r, 3, fila.horario, { ...base, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } });
            setCell(r, 4, fila.horasSemana, {
                font: { name: 'Arial', sz: 10, bold: true, color: { rgb: AZUL } },
                border: bordeFino(),
                fill: { fgColor: { rgb: banda } },
                alignment: { horizontal: 'center', vertical: 'top' },
                numFmt: '0.00'
            });
            rowHeights[r] = { hpt: Math.max(20, 15 * fila.numLineas + 6) };
            r++;
        });

        const ultimaFila = Math.max(3, r - 1);
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ultimaFila, c: totalCols - 1 } });
        ws['!merges'] = merges;
        ws['!cols'] = [{ wch: 47 }, { wch: 14 }, { wch: 46 }, { wch: 28 }, { wch: 14 }];
        ws['!rows'] = rowHeights;
        // Congela encabezado (fila 4) — depende del visor si lo respeta al abrir.
        ws['!panes'] = [{ xSplit: 0, ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft', state: 'frozen' }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Horarios_RRHH');

        const nombreArchivo = `Horarios_RRHH_${fechaGen.replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo, { bookType: 'xlsx', cellStyles: true });
        return true;
    }

    return { generar, construirFilas, armarDiasYHorario };
})();

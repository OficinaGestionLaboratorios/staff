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
// Requiere la librería xlsx-js-style (cargada en app.html antes
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

    // ---- DETALLE PLANO (.xlsx): una fila por día, TODOS los estados,
    // sin agrupar días — usado por los botones "Exportar" (horarios de
    // un empleado) y "descargar horario individual" (un solo grupo).
    // No incluye ID_GRUPO/FECHA_REGISTRO/FECHA_ACTUALIZACION/CODE/
    // ID_PERSONAL (esas 5 columnas son de uso interno, no le sirven a
    // quien recibe el archivo). ----
    const DETALLE_HEADERS = ['EMPLEADO', 'FECHA_INICIO', 'FECHA_FIN', 'DIA', 'HORA_INGRESO', 'INICIO_REFRIGERIO', 'FIN_REFRIGERIO', 'HORA_SALIDA', 'HORAS_DIA', 'HORAS_SEMANA', 'OBSERVACION'];
    const DETALLE_ANCHOS = [26, 12, 12, 12, 11, 14, 12, 11, 10, 12, 22];
    const DETALLE_COL_EMPLEADO = 0;    // alineado a la izquierda
    const DETALLE_COL_OBSERVACION = 10; // con wrapText

    // Columnas que describen al GRUPO (no cambian entre los días de un
    // mismo horario semanal): EMPLEADO, FECHA_INICIO, FECHA_FIN y
    // HORAS_SEMANA. El resto (DIA, horas del día, OBSERVACION) sí
    // varía fila a fila y nunca se combina.
    const DETALLE_COLS_GRUPO = [0, 1, 2, 9];

    // A partir de los grupos (ya ordenados y con FECHA_FIN ya
    // encadenada), arma las filas planas de siempre (reutilizando
    // HorarioExport.aFilas, que ya calcula el formato exacto de cada
    // columna), les quita las primeras 5 columnas internas
    // (ID_GRUPO/FECHA_REGISTRO/FECHA_ACTUALIZACION/CODE/ID_PERSONAL) y
    // deja en blanco las columnas de DETALLE_COLS_GRUPO a partir de la
    // 2da fila de cada grupo —así esos datos aparecen una sola vez por
    // horario en vez de repetirse en cada día— y devuelve además los
    // rangos de fila que ocupa cada grupo, para poder combinar esas
    // celdas al escribir el .xlsx.
    function construirFilasDetalleAgrupadas(grupos) {
        const filas = [];
        const rangos = [];
        grupos.forEach(grupo => {
            const filasGrupo = window.HorarioExport.aFilas([grupo]).map(fila => fila.slice(5));
            if (filasGrupo.length === 0) return;
            const inicio = filas.length;
            filasGrupo.forEach((fila, i) => {
                // FECHA_INICIO/FECHA_FIN en formato dd/mm/aaaa. El
                // horario más reciente no tiene "siguiente" que
                // encadene su FECHA_FIN (queda vacía) — en ese caso se
                // muestra "A la actualidad" en vez de dejarlo en blanco.
                fila[1] = window.HorarioModel.fechaATextoLegible(fila[1]);
                fila[2] = fila[2] ? window.HorarioModel.fechaATextoLegible(fila[2]) : 'A la actualidad';
                if (i > 0) DETALLE_COLS_GRUPO.forEach(c => { fila[c] = ''; });
                filas.push(fila);
            });
            rangos.push({ inicio, fin: filas.length - 1 });
        });
        return { filas, rangos };
    }

    // grupos: los que se van a mostrar/exportar en el archivo.
    // gruposDelEmpleado: TODOS los horarios de ese empleado (incluye a
    // los de `grupos`), usados solo para calcular la FECHA_FIN
    // encadenada de cada uno en función del que le sigue — aunque se
    // exporte un único horario, su FECHA_FIN debe calcularse mirando
    // al resto de horarios del empleado. Si no se pasa, se asume que
    // `grupos` ya es el universo completo (caso "exportar todos").
    function generarDetalle(grupos, tituloArchivo, tituloVisible, gruposDelEmpleado) {
        if (typeof XLSX === 'undefined' || !XLSX.utils) {
            window.toast('⚠️ No se pudo cargar la librería de Excel (XLSX). Revisa tu conexión.', 'warning');
            return false;
        }
        if (!grupos || grupos.length === 0) return false;

        // De fecha de inicio más lejana a más cercana — mismo criterio
        // que el panel "Horarios registrados" del modal — y con la
        // FECHA_FIN de cada uno encadenada al inicio del siguiente
        // (un día hábil antes), calculado sobre TODOS los horarios del
        // empleado aunque solo se vaya a mostrar uno.
        const universo = window.HorarioModel.ordenarGruposPorFechaInicio(gruposDelEmpleado || grupos);
        const universoEncadenado = window.HorarioModel.encadenarFechasFin(universo);
        const idsAMostrar = new Set(grupos.map(g => g.ID_GRUPO));
        const gruposOrdenados = universoEncadenado.filter(g => idsAMostrar.has(g.ID_GRUPO));

        const { filas, rangos } = construirFilasDetalleAgrupadas(gruposOrdenados);
        // Índice de grupo (0,1,2...) al que pertenece cada fila, para
        // que las bandas de color alternen por HORARIO y no por fila
        // suelta (todas las filas de un mismo grupo comparten banda).
        const grupoDeFila = [];
        rangos.forEach((rango, gi) => {
            for (let i = rango.inicio; i <= rango.fin; i++) grupoDeFila[i] = gi;
        });
        const totalCols = DETALLE_HEADERS.length;
        const fechaGen = fechaHoyTexto();
        const ws = {};
        const merges = [];
        const rowHeights = [];

        function setCell(r, c, valor, estilo) {
            const addr = XLSX.utils.encode_cell({ r, c });
            ws[addr] = { v: valor, t: typeof valor === 'number' ? 'n' : 's', s: estilo };
        }

        setCell(0, 0, tituloVisible, {
            font: { name: 'Arial', sz: 14, bold: true, color: { rgb: BLANCO } },
            fill: { fgColor: { rgb: AZUL } },
            alignment: { horizontal: 'center', vertical: 'center' }
        });
        merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });
        rowHeights[0] = { hpt: 26 };

        setCell(1, 0, `Generado desde la web  ·  Fecha de generación: ${fechaGen}  ·  Total de filas: ${filas.length}`, {
            font: { name: 'Arial', sz: 9, italic: true, color: { rgb: GRIS_TEXTO } },
            alignment: { horizontal: 'center' }
        });
        merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } });

        DETALLE_HEADERS.forEach((h, c) => {
            setCell(3, c, h, {
                font: { name: 'Arial', sz: 9, bold: true, color: { rgb: BLANCO } },
                fill: { fgColor: { rgb: AZUL } },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: bordeFino()
            });
        });
        rowHeights[3] = { hpt: 24 };

        let r = 4;
        filas.forEach((fila, idx) => {
            const banda = (grupoDeFila[idx] % 2 === 1) ? GRIS_BANDA : BLANCO;
            fila.forEach((valor, c) => {
                setCell(r, c, valor, {
                    font: { name: 'Arial', sz: 9 },
                    border: bordeFino(),
                    fill: { fgColor: { rgb: banda } },
                    alignment: { horizontal: c === DETALLE_COL_EMPLEADO ? 'left' : 'center', vertical: 'center', wrapText: c === DETALLE_COL_OBSERVACION }
                });
            });
            r++;
        });

        // Combina verticalmente, para cada grupo con más de un día, las
        // columnas que no varían dentro de ese grupo (ver
        // DETALLE_COLS_GRUPO) — así ID_GRUPO/fechas/empleado/HORAS_SEMANA
        // se ven una sola vez por horario en vez de repetidos en cada fila.
        rangos.forEach(rango => {
            if (rango.fin === rango.inicio) return; // un solo día: nada que combinar
            const filaInicio = 4 + rango.inicio;
            const filaFin = 4 + rango.fin;
            DETALLE_COLS_GRUPO.forEach(c => {
                merges.push({ s: { r: filaInicio, c }, e: { r: filaFin, c } });
            });
        });

        const ultimaFila = Math.max(3, r - 1);
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ultimaFila, c: totalCols - 1 } });
        ws['!merges'] = merges;
        ws['!cols'] = DETALLE_ANCHOS.map(wch => ({ wch }));
        ws['!rows'] = rowHeights;
        ws['!panes'] = [{ xSplit: 0, ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft', state: 'frozen' }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Horarios');
        XLSX.writeFile(wb, `${tituloArchivo}.xlsx`, { bookType: 'xlsx', cellStyles: true });
        return true;
    }

    return { generar, construirFilas, armarDiasYHorario, generarDetalle };
})();

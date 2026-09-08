// ============================================================
// VACACIONES-EXPORT-XLSX.JS — Genera el reporte
// "OF DE GESTIÓN DE LABORATORIOS — Control de Vacaciones" en .xlsx
// desde la web, con el MISMO formato de columnas del Excel original
// que se llevaba a mano:
//   APELLIDOS Y NOMBRES | PERÍODO VACACIONAL | DÍAS PENDIENTES |
//   FECHA LÍMITE GOCE DE VACACIONES | OBSERVACIÓN
// ============================================================
// Mismo patrón que horario-export-xlsx.js: usa xlsx-js-style
// (cargada en index.html) para poder aplicar colores/bordes al
// .xlsx generado. No pasa por el backend: se arma enteramente con
// los datos que ya devuelve VacacionesAPI.listar().
// ============================================================

window.VacacionesExportXLSX = (function() {

    const AZUL = '1F4E78';
    const BLANCO = 'FFFFFF';
    const GRIS_BANDA = 'F2F2F2';
    const GRIS_TEXTO = '595959';
    const BORDE_COLOR = 'B7C6D9';
    const ROJO_VENCIDO = 'FEE2E2';
    const ROJO_TEXTO = 'B91C1C';

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

    // Nombre APELLIDOS, NOMBRES a partir de EMPLEADO ("Apellido
    // Apellido Nombres (ID)"), igual criterio que horario-export.
    function nombreSinId(empleado) {
        return (empleado || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    }

    function construirFilas(registros) {
        return registros.map(r => ({
            nombre: nombreSinId(r.EMPLEADO),
            periodo: r.PERIODO_VACACIONAL || '',
            diasPendientes: parseInt(r.DIAS_PENDIENTES, 10) || 0,
            fechaLimite: window.VacacionesModel.fechaATextoLegible(r.FECHA_LIMITE),
            fechaLimiteISO: (r.FECHA_LIMITE || '').slice(0, 10),
            estado: r.ESTADO || '',
            observacion: r.OBSERVACION || ''
        }));
    }

    function generar(registros) {
        if (typeof XLSX === 'undefined' || !XLSX.utils) {
            window.toast('⚠️ No se pudo cargar la librería de Excel (XLSX). Revisa tu conexión.', 'warning');
            return false;
        }

        const filas = construirFilas(registros).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

        const totalCols = 5;
        const fechaGen = fechaHoyTexto();
        const ws = {};
        const merges = [];
        const rowHeights = [];

        function setCell(r, c, valor, estilo) {
            const addr = XLSX.utils.encode_cell({ r, c });
            ws[addr] = { v: valor, t: typeof valor === 'number' ? 'n' : 's', s: estilo };
        }

        setCell(0, 0, 'OFICINA DE GESTIÓN DE LABORATORIOS — CONTROL DE VACACIONES', {
            font: { name: 'Arial', sz: 14, bold: true, color: { rgb: BLANCO } },
            fill: { fgColor: { rgb: AZUL } },
            alignment: { horizontal: 'center', vertical: 'center' }
        });
        merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });
        rowHeights[0] = { hpt: 26 };

        setCell(1, 0, `Generado desde la web  ·  Fecha de generación: ${fechaGen}  ·  Total de períodos: ${filas.length}`, {
            font: { name: 'Arial', sz: 9, italic: true, color: { rgb: GRIS_TEXTO } },
            alignment: { horizontal: 'center' }
        });
        merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } });

        const headers = ['APELLIDOS Y NOMBRES', 'PERIODO VACACIONAL', 'DIAS PENDIENTES', 'FECHA LIMITE GOCE DE VACACIONES', 'OBSERVACIÓN'];
        headers.forEach((h, c) => {
            setCell(3, c, h, {
                font: { name: 'Arial', sz: 10, bold: true, color: { rgb: BLANCO } },
                fill: { fgColor: { rgb: AZUL } },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: bordeFino()
            });
        });
        rowHeights[3] = { hpt: 24 };

        let r = 4;
        const hoyISO = new Date().toISOString().slice(0, 10);
        filas.forEach((fila, idx) => {
            // Resalta en rojo suave las filas Vencidas (fecha límite
            // ya pasada y aún con días pendientes) — es justamente lo
            // que este control busca evitar.
            const vencido = fila.diasPendientes > 0 && fila.fechaLimiteISO && fila.fechaLimiteISO < hoyISO;
            const banda = vencido ? ROJO_VENCIDO : (idx % 2 === 1 ? GRIS_BANDA : BLANCO);
            const base = {
                font: { name: 'Arial', sz: 10, color: { rgb: vencido ? ROJO_TEXTO : '000000' } },
                border: bordeFino(),
                fill: { fgColor: { rgb: banda } }
            };
            setCell(r, 0, fila.nombre, { ...base, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } });
            setCell(r, 1, fila.periodo, { ...base, alignment: { horizontal: 'center', vertical: 'top' } });
            setCell(r, 2, fila.diasPendientes, {
                font: { name: 'Arial', sz: 10, bold: true, color: { rgb: vencido ? ROJO_TEXTO : AZUL } },
                border: bordeFino(),
                fill: { fgColor: { rgb: banda } },
                alignment: { horizontal: 'center', vertical: 'top' }
            });
            setCell(r, 3, fila.fechaLimite, { ...base, alignment: { horizontal: 'center', vertical: 'top' } });
            setCell(r, 4, fila.observacion, { ...base, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } });
            rowHeights[r] = { hpt: 20 };
            r++;
        });

        const ultimaFila = Math.max(3, r - 1);
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ultimaFila, c: totalCols - 1 } });
        ws['!merges'] = merges;
        ws['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 16 }, { wch: 28 }, { wch: 40 }];
        ws['!rows'] = rowHeights;
        ws['!panes'] = [{ xSplit: 0, ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft', state: 'frozen' }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Control_Vacaciones');

        const nombreArchivo = `Control_Vacaciones_${fechaGen.replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo, { bookType: 'xlsx', cellStyles: true });

        window.toast('📥 Reporte de vacaciones generado', 'success');
        return true;
    }

    return { generar, construirFilas };
})();

// ============================================================
// VACACIONES-EXPORT-DOCX.JS — Genera el documento Word
// "SOLICITO OTORGAMIENTO DE VACACIONES", con el MISMO formato
// (fuente, márgenes, párrafos) de la plantilla oficial
// "FORMATO SOLICITUD OTORGAMIENTO DE VACACIONESstd", ya con los
// datos del trabajador y del tramo de goce completados.
// ============================================================
// Mismo patrón que vacaciones-export-xlsx.js: se arma enteramente
// en el navegador (no pasa por el backend) usando la librería
// "docx" cargada por CDN en index.html. Se genera UN documento por
// CADA goce/tramo de vacaciones registrado (ver vacaciones.js,
// generarDocumentoDeGoce), tal como pedía el Excel manual original.
// ============================================================

window.VacacionesExportDOCX = (function() {

    const FUENTE = 'Gadugi';
    const TAMANO = 22; // 11pt en semipuntos — igual que la plantilla original (.docx)
    const INDENT = { left: 709, right: 475 }; // mismo sangrado de párrafo que la plantilla (twips)

    // La plantilla original usa "setiembre" (forma preferida en el
    // Perú), no "septiembre".
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

    // "2025-12-10" → "10 de diciembre"
    function fechaDiaMes(fechaISO) {
        if (!fechaISO) return '____________';
        const soloFecha = String(fechaISO).slice(0, 10);
        const [y, m, d] = soloFecha.split('-');
        if (!y || !m || !d) return String(fechaISO);
        const mes = MESES[parseInt(m, 10) - 1] || '';
        return `${parseInt(d, 10)} de ${mes}`;
    }

    function anioDe(fechaISO) {
        const soloFecha = String(fechaISO || '').slice(0, 10);
        return soloFecha.split('-')[0] || String(new Date().getFullYear());
    }

    function texto(contenido, opts = {}) {
        const docx = window.docx;
        return new docx.TextRun({
            text: contenido,
            font: FUENTE,
            size: TAMANO,
            bold: !!opts.bold,
            underline: opts.underline ? { type: docx.UnderlineType.SINGLE } : undefined
        });
    }

    function parrafo(runs, opts = {}) {
        const docx = window.docx;
        return new docx.Paragraph({
            indent: INDENT,
            alignment: opts.alignment || docx.AlignmentType.JUSTIFIED,
            spacing: opts.spacing,
            children: runs
        });
    }

    function vacio() { return parrafo([]); }

    // datos = { nombreCompleto, dni, idPersonal, fechaInicio (ISO), fechaFin (ISO) }
    function construirDocumento(datos) {
        const docx = window.docx;
        const hoy = new Date();
        const fechaSolicitudTexto = fechaDiaMes(hoy.toISOString().slice(0, 10));
        const anioActual = String(hoy.getFullYear());
        const anioPeriodo = anioDe(datos.fechaInicio) || anioActual;

        const children = [
            vacio(),
            parrafo([texto('SOLICITO OTORGAMIENTO DE VACACIONES', { bold: true })], { alignment: docx.AlignmentType.RIGHT }),
            vacio(),
            parrafo([texto('SEÑOR')], { spacing: { after: 0 } }),
            parrafo([texto('DIRECTOR DE RECURSOS HUMANOS')], { spacing: { after: 0 } }),
            parrafo([texto('Presente', { bold: true, underline: true })], { spacing: { after: 0 } }),
            vacio(),
            parrafo([
                texto('Yo, '),
                texto(datos.nombreCompleto || '____________________________'),
                texto(', trabajador(a) de esta superior casa de estudios, identificado(a) con DNI: '),
                texto(datos.dni || '_______________'),
                texto(', e ID: '),
                texto(datos.idPersonal || '____________'),
                texto(', ante usted con el debido respeto me presento y expongo lo siguiente:')
            ], { spacing: { before: 120, line: 360, lineRule: docx.LineRuleType.AUTO } }),
            vacio(),
            parrafo([
                texto('Por el presente solicito se sirva autorizar se me otorgue vacaciones durante el período comprendido entre el '),
                texto(fechaDiaMes(datos.fechaInicio)),
                texto(' al '),
                texto(fechaDiaMes(datos.fechaFin)),
                texto(' del año '),
                texto(anioPeriodo),
                texto('.')
            ], { spacing: { line: 360, lineRule: docx.LineRuleType.AUTO } }),
            vacio(),
            parrafo([texto('Es justicia que espero alcanzar.')]),
            vacio(),
            vacio(),
            parrafo([
                texto('Trujillo, '),
                texto(fechaSolicitudTexto),
                texto(' del '),
                texto(anioActual),
                texto('.')
            ], { alignment: docx.AlignmentType.RIGHT }),
            vacio(),
            vacio(),
            vacio(),
            parrafo([texto('____________________________________')]),
            parrafo([texto('\t\tFIRMA')])
        ];

        return new docx.Document({
            sections: [{
                properties: {
                    page: {
                        size: { width: 11907, height: 16840 }, // A4 — igual que la plantilla original
                        margin: { top: 567, right: 851, bottom: 567, left: 851, header: 567, footer: 170 }
                    }
                },
                children
            }]
        });
    }

    // Genera y descarga el .docx de UN goce/tramo de vacaciones.
    // datos = { nombreCompleto, dni, idPersonal, fechaInicio, fechaFin }
    async function generarSolicitud(datos) {
        if (typeof window.docx === 'undefined') {
            window.toast('⚠️ No se pudo cargar la librería de Word (docx). Revisa tu conexión.', 'warning');
            return false;
        }
        try {
            const doc = construirDocumento(datos || {});
            const blob = await window.docx.Packer.toBlob(doc);

            const sufijoNombre = (datos.nombreCompleto || 'empleado').replace(/[^\wÀ-ÿ]+/g, '_');
            const sufijoFechas = `${(datos.fechaInicio || '').slice(0, 10)}_${(datos.fechaFin || '').slice(0, 10)}`;
            const nombreArchivo = `Solicitud_Vacaciones_${sufijoNombre}_${sufijoFechas}.docx`;

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = nombreArchivo;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

            window.toast('📄 Documento de solicitud generado', 'success');
            return true;
        } catch (e) {
            console.error(e);
            window.toast('❌ No se pudo generar el documento de solicitud', 'error');
            return false;
        }
    }

    return { generarSolicitud };
})();

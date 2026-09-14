// ============================================================
// LICENCIAS-EXPORT-DOCX.JS — Documento Word basado en la plantilla
// "FORMATO DE SOLICITUD DE LICENCIA SIN GOCE DE HABER POR MOTIVOS PERSONALES".
// ============================================================
window.LicenciasExportDOCX = (function () {
    const FUENTE = 'Times New Roman';
    const TAMANO = 22; // 11 pt
    const MESES = window.LicenciasModel.MESES;

    function fechaPartes(iso) {
        const p = String(iso || '').slice(0,10).split('-');
        if (p.length !== 3) return { dia:'____', mes:'________', anio:'____' };
        return { dia:String(parseInt(p[2],10)), mes:MESES[parseInt(p[1],10)-1] || '', anio:p[0] };
    }
    function run(text, opts={}) {
        const d = window.docx;
        return new d.TextRun({ text: String(text ?? ''), font: FUENTE, size: opts.size ?? TAMANO, bold: !!opts.bold, underline: opts.underline ? {} : undefined });
    }
    function p(children=[], opts={}) {
        const d = window.docx;
        return new d.Paragraph({
            alignment: opts.alignment || d.AlignmentType.JUSTIFIED,
            indent: { left: 0, right: 0 },
            spacing: { before: opts.before || 0, after: opts.after ?? 80, line: 300 },
            children
        });
    }
    function construir(datos) {
        const d = window.docx;
        const fs = fechaPartes(datos.FECHA_SOLICITUD);
        const fi = fechaPartes(datos.FECHA_INICIO);
        const ff = fechaPartes(datos.FECHA_FIN);
        const nombre = datos.EMPLEADO || '____________________________';
        const dni = datos.DNI || '_______________';
        const id = datos.ID_PERSONAL || '____________';
        const direccion = datos.DIRECCION || '____________________________________________';
        const email = datos.EMAIL || '____________________________________________';
        const telefono = datos.TELEFONO || '____________';
        const cargo = datos.CARGO || '________________';
        const area = datos.AREA || '________________';
        const motivo = datos.MOTIVO || 'motivos personales';
        const anexos = datos.ANEXOS ? datos.ANEXOS.split(/\n|;/).map(x=>x.trim()).filter(Boolean) : [];

        const children = [
            p([run('FORMATO DE SOLICITUD DE LICENCIA SIN GOCE DE HABER POR MOTIVOS', {bold:true})], {alignment:d.AlignmentType.CENTER, after:0}),
            p([run('PERSONALES', {bold:true})], {alignment:d.AlignmentType.CENTER, after:180}),
            p([run('Trujillo, '), run(fs.dia, {bold:true}), run(' de '), run(fs.mes, {bold:true}), run(' del '), run(fs.anio, {bold:true})], {after:160}),
            p([run('Señor')], {after:0}),
            p([run('DIRECTOR DE RECURSOS HUMANOS')], {after:0}),
            p([run('Presente. -')], {after:160}),
            p([
                run('Yo, '), run(nombre, {bold:true}), run(', identificado con ID N° '), run(id, {bold:true}),
                run(', con D.N.I. N° '), run(dni, {bold:true}), run(', con domicilio en '), run(direccion, {bold:true}),
                run(', correo electrónico '), run(email, {bold:true}), run(', teléfono '), run(telefono, {bold:true}),
                run(', en calidad de trabajador en el cargo de '), run(cargo, {bold:true}),
                run(' del área de '), run(area, {bold:true}), run(' de esta Superior Casa de Estudios, ante usted me presento y digo:')
            ], {after:140}),
            p([run('Solicito se me conceda: '), run('LICENCIA SIN GOCE DE HABER POR MOTIVOS PERSONALES', {bold:true}), run(', desde el '), run(window.LicenciasModel.fechaTexto(datos.FECHA_INICIO).replace(/ del \d{4}$/,''), {bold:true}), run(' hasta el '), run(window.LicenciasModel.fechaTexto(datos.FECHA_FIN).replace(/ del \d{4}$/,''), {bold:true}), run(', en atención a que '), run(motivo, {bold:true}), run(', solicitud que cuenta con el visto bueno de mi Jefe Inmediato, de conformidad con lo establecido en el artículo 127° del Reglamento Interno de Trabajo.')], {after:120}),
            p([run('Anexos.', {underline:true})], {after:70}),
            ...(anexos.length ? anexos.map(a => p([run(a)], {after:50})) : [p([run('____________________________________________')], {after:40}), p([run('____________________________________________')], {after:70})]),
            p([run('Atentamente,')], {after:220}),
            new d.Table({
                width: { size: 100, type: d.WidthType.PERCENTAGE },
                borders: {
                    top: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    bottom: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    left: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    right: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    insideHorizontal: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    insideVertical: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' }
                },
                rows: [new d.TableRow({
                    children: [
                        new d.TableCell({
                            width: { size: 50, type: d.WidthType.PERCENTAGE },
                            children: [
                                p([run('____________________________________')], {alignment:d.AlignmentType.CENTER, after:0}),
                                p([run('Firma del trabajador')], {alignment:d.AlignmentType.CENTER, after:0})
                            ]
                        }),
                        new d.TableCell({
                            width: { size: 50, type: d.WidthType.PERCENTAGE },
                            children: [
                                p([run('____________________________________')], {alignment:d.AlignmentType.CENTER, after:0}),
                                p([run('V°B° Jefatura')], {alignment:d.AlignmentType.CENTER, after:0})
                            ]
                        })
                    ]
                })]
            }),
            p([], {after:80}),
            p([run('¹ Indicar el sustento que motive la solicitud del trabajador.', {size:18})], {after:20}),
            p([run('² Art. 127°.- Las licencias son autorizaciones que se otorgan a los trabajadores para no asistir al centro de trabajo por uno (01) o más días. Deben ser solicitadas ante la Dirección de Recursos Humanos por escrito con no menos de veinticuatro (24) horas de anticipación, previo visto bueno del jefe inmediato, según los casos.', {size:18})], {after:20}),
            p([run('³ De ser el caso, se deberán adjuntar como Anexos los documentos que el trabajador considere pertinentes, relacionados al sustento de la solicitud.', {size:18})], {after:0})
        ];

        return new d.Document({ sections: [{ properties: { page: { size: { width:11907, height:16840 }, margin:{ top:1100, right:1300, bottom:900, left:1300 } } }, children }] });
    }
    async function generar(datos) {
        if (!window.docx) { window.toast('⚠️ No se pudo cargar la librería de Word.', 'warning'); return false; }
        try {
            const blob = await window.docx.Packer.toBlob(construir(datos));
            const nombre = `Solicitud_Licencia_Sin_Goce_${(datos.EMPLEADO || 'empleado').replace(/[^\wÀ-ÿ]+/g,'_')}_${String(datos.FECHA_INICIO||'').slice(0,10)}_${String(datos.FECHA_FIN||'').slice(0,10)}.docx`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href=url; a.download=nombre; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(()=>URL.revokeObjectURL(url),1000);
            window.toast('📄 Documento Word generado correctamente', 'success');
            return true;
        } catch(e) { console.error(e); window.toast('❌ No se pudo generar el documento Word', 'error'); return false; }
    }
    return { generar };
})();

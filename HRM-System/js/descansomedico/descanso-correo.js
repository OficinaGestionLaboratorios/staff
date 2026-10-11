// ============================================================
// DESCANSO-CORREO.JS — Modelo y redacción del correo de gestión
// de descanso médico (con o sin fotografía adjunta).
// ============================================================
window.DescansoMedicoCorreo = (function () {
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','setiembre','octubre','noviembre','diciembre'];

    function esc(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function partes(iso) { const p = String(iso || '').slice(0,10).split('-'); return p.length === 3 ? { y: +p[0], m: +p[1], d: +p[2] } : null; }
    function fechaLarga(iso) { const f = partes(iso); return f ? `${f.d} de ${MESES[f.m-1]} del ${f.y}` : ''; }

    function calcularDias(ini, fin) {
        if (!ini || !fin) return 0;
        const d = Math.round((new Date(fin + 'T00:00:00') - new Date(ini + 'T00:00:00')) / 86400000);
        return d >= 0 ? d + 1 : 0;
    }

    // "13 de octubre del 2026" · "13 y 14 de octubre del 2026" · "del 13 al 19 de octubre del 2026"
    function rangoTexto(ini, fin) {
        const a = partes(ini), b = partes(fin);
        if (!a || !b) return '';
        if (ini === fin) return fechaLarga(ini);
        if (a.y === b.y && a.m === b.m) {
            const n = calcularDias(ini, fin);
            return n === 2 ? `${a.d} y ${b.d} de ${MESES[a.m-1]} del ${a.y}` : `del ${a.d} al ${b.d} de ${MESES[a.m-1]} del ${a.y}`;
        }
        return `del ${fechaLarga(ini)} al ${fechaLarga(fin)}`;
    }

    function datosPersona(personal) {
        const nombre = window.formatearPersonalSeleccionado ? window.formatearPersonalSeleccionado(personal) : '';
        const limpio = String(nombre || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
        const sexo = String(personal?.SEXO || '').trim().toLowerCase();
        const trat = sexo === 'femenino' ? 'la Sra.' : (sexo === 'masculino' ? 'el Sr.' : '');
        return { nombre: limpio, id: personal?.ID_PERSONAL || '', cargo: personal?.CARGO || '', trat };
    }

    // d: { personal, fechaInicio, fechaFin, fechaOtorgamiento, imagenes: [dataURL], pdfs: [nombre], observacion }
    // Las imágenes van pegadas en el cuerpo del correo; los PDF van como archivos adjuntos.
    function imagenesDe(d) { return Array.isArray(d.imagenes) ? d.imagenes : (d.foto ? [d.foto] : []); }
    function pdfsDe(d) { return Array.isArray(d.pdfs) ? d.pdfs : []; }
    function armar(d) {
        const p = datosPersona(d.personal), n = calcularDias(d.fechaInicio, d.fechaFin);
        const sujeto = `${p.trat ? p.trat + ' ' : ''}${p.nombre}`.trim();
        const dias = rangoTexto(d.fechaInicio, d.fechaFin);
        const asunto = `Gestión de descanso médico – ${p.nombre}`;
        const intro = `Por medio del presente, se informa que ${sujeto}${p.id ? ' (ID: ' + p.id + ')' : ''} ha solicitado gestionar su descanso médico para ${n === 1 ? 'el día' : 'los días'} ${dias}.`;
        const imgs = imagenesDe(d), pdfs = pdfsDe(d), total = imgs.length + pdfs.length;
        const items = [];
        if (imgs.length) items.push(imgs.length === 1 ? 'la fotografía' : `las ${imgs.length} fotografías`);
        if (pdfs.length) items.push(pdfs.length === 1 ? 'el archivo PDF' : `los ${pdfs.length} archivos PDF`);
        const cierre = total
            ? `Para su trámite, ${total > 1 ? 'se adjuntan' : 'se adjunta'} ${items.join(' y ')} del descanso médico que lo ${total > 1 ? 'acreditan' : 'acredita'}. El trabajador se apersonará a entregar físicamente su constancia de descanso médico al concluir su descanso.`
            : 'Por el momento el trabajador declara su descanso médico; el documento que lo acredita será enviado oportunamente, y se entregará físicamente la constancia al concluir su descanso.';
        const obs = (d.observacion || '').trim();
        return { asunto, saludo: 'Estimados, buen día:', intro, cierre, obs, firma: 'Atentamente,', periodo: [
            ['Trabajador', sujeto.replace(/^(el Sr\.|la Sra\.)\s*/, '')], ['Fecha de inicio', fechaLarga(d.fechaInicio)], ['Fecha de fin', fechaLarga(d.fechaFin)],
            ['Total de días de descanso', String(n)], ['Fecha de otorgamiento', fechaLarga(d.fechaOtorgamiento)]
        ] };
    }

    function generarHTML(d, opc) {
        const c = armar(d), P = datosPersona(d.personal), n = calcularDias(d.fechaInicio, d.fechaFin);
        const fuente = 'font-family:Calibri,Arial,sans-serif;color:#000000;';
        const p = `style="margin:0 0 12px 0;${fuente}font-size:14px;line-height:1.5;"`;
        const amarillo = t => `<span style="background-color:#FFF3A8;font-weight:bold;">${esc(t)}</span>`;
        const negrita = t => `<b>${esc(t)}</b>`;
        const sujeto = `${P.trat ? esc(P.trat) + ' ' : ''}${negrita(P.nombre)}${P.id ? ' (ID: ' + esc(P.id) + ')' : ''}`;
        const intro = `Por medio del presente, se informa que ${sujeto} ha solicitado gestionar su descanso médico para ${n === 1 ? 'el día' : 'los días'} ` +
            `${amarillo(rangoTexto(d.fechaInicio, d.fechaFin))}.`;

        // Tabla compacta: ancho de cada columna según su texto + 10 %
        const PX = 6.6, PAD = 20;                                   // px por carácter (13 px) y relleno horizontal
        const ancho = textos => Math.ceil(Math.max(...textos.map(t => String(t).length)) * PX * 1.1) + PAD;
        const w1 = ancho(c.periodo.map(r => r[0])), w2 = ancho(c.periodo.map(r => r[1]));
        const td = 'border:1px solid #BFC7D1;padding:3px 8px;' + fuente + 'font-size:13px;white-space:nowrap;';
        const filas = c.periodo.map(([k, v], i) => {
            const val = i === 0 ? negrita(v) : esc(v);
            return `<tr><td width="${w1}" style="${td}font-weight:bold;background:#F2F4F7;">${esc(k)}</td><td width="${w2}" style="${td}">${val}</td></tr>`;
        }).join('');
        return `<div style="background:#FFFFFF;${fuente}">
<p ${p}><b>Asunto:</b> ${esc(c.asunto)}</p>
<p ${p}>${esc(c.saludo)}</p>
<p ${p}>${intro}</p>
<table width="${w1 + w2}" style="border-collapse:collapse;width:${w1 + w2}px;margin:0 0 12px 0;">${filas}</table>
<p ${p}>${esc(c.cierre)}</p>
${c.obs ? `<p ${p}><b>Observación:</b> ${esc(c.obs)}</p>` : ''}
${imagenesDe(d).map((src, i) => `<p ${p}><img src="${opc && opc.cid ? 'cid:img' + (i + 1) : src}" alt="Descanso médico" style="max-width:520px;width:100%;border:1px solid #BFC7D1;"></p>`).join('')}
<p ${p}>${esc(c.firma)}</p>
</div>`;
    }

    function generarTexto(d) {
        const c = armar(d);
        return [`Asunto: ${c.asunto}`, '', c.saludo, '', c.intro, '', ...c.periodo.map(([k, v]) => `${k}: ${v}`), '', c.cierre, c.obs ? '\nObservación: ' + c.obs : '', '', c.firma].join('\n');
    }

    // ---------- Archivo .eml (borrador con imágenes en el cuerpo y PDF adjuntos) ----------
    function b64(str) { return btoa(unescape(encodeURIComponent(str))); }
    function lineas76(b) { return (b.match(/.{1,76}/g) || []).join('\r\n'); }
    function datosB64(dataUrl) { return String(dataUrl).split(',')[1] || ''; }
    // archivos: [{ name, type, dataUrl, esImagen }]
    // opc: { enviar: true, para, cc } → mensaje listo para enviar por Gmail API (con To/Cc, sin X-Unsent)
    function generarEml(d, archivos, opc) {
        opc = opc || {};
        const c = armar(d), imgs = archivos.filter(a => a.esImagen), pdfs = archivos.filter(a => !a.esImagen);
        const b1 = '----=_HRM_mixed_' + Date.now(), b2 = '----=_HRM_rel_' + Date.now();
        const html = '<html><body>' + generarHTML({ ...d, imagenes: imgs.map(i => i.dataUrl) }, { cid: true }) + '</body></html>';
        const L = [
            ...(opc.enviar ? ['To: ' + opc.para, ...(opc.cc ? ['Cc: ' + opc.cc] : [])] : ['X-Unsent: 1']), 'MIME-Version: 1.0', 'Subject: =?UTF-8?B?' + b64(c.asunto) + '?=',
            `Content-Type: multipart/mixed; boundary="${b1}"`, '',
            `--${b1}`, `Content-Type: multipart/related; boundary="${b2}"`, '',
            `--${b2}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', lineas76(b64(html)), ''
        ];
        imgs.forEach((im, i) => L.push(`--${b2}`, 'Content-Type: image/jpeg', 'Content-Transfer-Encoding: base64', `Content-ID: <img${i + 1}>`,
            `Content-Disposition: inline; filename="${im.name}"`, '', lineas76(datosB64(im.dataUrl)), ''));
        L.push(`--${b2}--`, '');
        pdfs.forEach(p => L.push(`--${b1}`, `Content-Type: application/pdf; name="${p.name}"`, 'Content-Transfer-Encoding: base64',
            `Content-Disposition: attachment; filename="${p.name}"`, '', lineas76(datosB64(p.dataUrl)), ''));
        L.push(`--${b1}--`, '');
        return L.join('\r\n');
    }

    return { generarEml, MESES, fechaLarga, calcularDias, rangoTexto, armar, generarHTML, generarTexto };
})();

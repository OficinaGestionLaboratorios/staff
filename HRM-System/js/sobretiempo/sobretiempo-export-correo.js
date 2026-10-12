// ============================================================
// SOBRETIEMPO-EXPORT-CORREO.JS — Redacción de los correos de Sobretiempo
// ============================================================
// Genera el texto (HTML con estilos inline) de:
//   · Etapa 1: "Solicitud de autorización de horas de sobretiempo"
//   · Etapa 2: "Solicitud de descanso compensatorio" — reproduce el modelo
//     real: título, saludo, párrafo con el motivo y DOS tablas lado a lado
//     (HORAS SOBRETIEMPO / DESCANSO COMPENSATORIO) con fila de total.
// La vista previa, la edición, los adjuntos, «Copiar todo» y el envío
// directo con la cuenta corporativa los resuelve el modal único
// js/core/correo-modal.js (el mismo que usan Horario y Descanso médico).
// ============================================================

window.SobretiempoExportCorreo = (function() {
    const M = window.SobretiempoModel;

    function escHTML(v) {
        return String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Nombre "limpio" (sin el "(ID: ...)" que a veces ya trae
    // formatearPersonalSeleccionado) + encabezado con ID aparte.
    // "tratamiento" (Sr./Sra.) sale del campo SEXO del personal,
    // igual que en el modelo real ("al Sr. Eduardo...").
    function nombreYEncabezado(personal) {
        const nombreCompleto = window.formatearPersonalSeleccionado
            ? window.formatearPersonalSeleccionado(personal)
            : (personal?.NOMBRES ? `${personal.NOMBRES} ${personal.APELLIDOS || ''}`.trim() : '');
        const nombre = String(nombreCompleto || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
        const sexo = window.sexoPersona(personal);
        const tratamiento = sexo === 'femenino' ? 'Sra.' : (sexo === 'masculino' ? 'Sr.' : '');
        return { nombre, id: personal?.ID_PERSONAL || '', cargo: personal?.CARGO || '', tratamiento };
    }

    // Suma de horas de un arreglo de filas con campo "horas" (decimal).
    function sumarHoras(filas, campo) {
        return (filas || []).reduce((acc, f) => acc + (parseFloat(f[campo]) || 0), 0);
    }

    // ---- Filas de la tabla "HORAS SOBRETIEMPO" (a partir de las
    // selecciones tomadas del banco de horas) ----
    function filasSobretiempo(selecciones) {
        return (selecciones || []).slice().sort((a, b) => String(a.FECHA_SOBRETIEMPO).localeCompare(String(b.FECHA_SOBRETIEMPO)));
    }

    // ---- Estilos compartidos (inline, para que Outlook/Gmail los
    // conserven al pegar — igual criterio que horario-export-correo) ----
    const F = "font-family:Calibri,Arial,sans-serif;font-size:14px;color:#32363A;background:#FFFFFF;";
    const AJUSTE_TEXTO = 'word-break:break-word;overflow-wrap:break-word;';
    const BORDE = '1px solid #BFC8D1';
    const AMARILLO = '#D1E8FA';

    function celdaEstilo(extra) {
        return `${F}padding:4px 10px;border:${BORDE};vertical-align:middle;box-sizing:border-box;white-space:nowrap;${extra || ''}`;
    }

    // Arma UNA de las dos tablas (encabezado + filas + fila de total
    // resaltada en amarillo, igual que el modelo real).
    function tablaHTML(titulo, filas) {
        const th = celdaEstilo('font-weight:bold;text-align:center;');
        const tdCentro = celdaEstilo('text-align:center;');
        const tdDia = celdaEstilo('text-align:left;');
        const total = filas.reduce((acc, f) => acc + (parseFloat(f.horas) || 0), 0);

        const filasHTML = filas.map(f => `
<tr>
<td style="${tdDia}">${escHTML(f.dia)}</td>
<td style="${tdCentro}">${escHTML(f.inicio)}</td>
<td style="${tdCentro}">${escHTML(f.fin)}</td>
<td style="${tdCentro}">${escHTML(M.horasDecimalATextoHM(f.horas))}</td>
</tr>`).join('');

        return `
<table cellspacing="0" cellpadding="0" style="background:#FFFFFF;border-collapse:collapse;">
<tr><td colspan="4" style="${F}font-weight:bold;padding:0 0 4px 0;border:none;">${escHTML(titulo)}</td></tr>
<tr>
<td style="${th}">DÍA</td><td style="${th}">INICIO</td><td style="${th}">FIN</td><td style="${th}">TOTAL</td>
</tr>
${filasHTML}
<tr>
<td style="${celdaEstilo('border:none;')}"></td>
<td style="${celdaEstilo('border:none;')}"></td>
<td style="${celdaEstilo('border:none;')}"></td>
<td style="${celdaEstilo(`background-color:${AMARILLO};text-align:center;font-weight:bold;`)}">${escHTML(M.horasDecimalATextoHM(total))}</td>
</tr>
</table>`;
    }

    // Construye los datos ya listos para pintar (día en texto,
    // inicio/fin, horas decimales) a partir de lo que trae el
    // objeto "descanso" armado en sobretiempo.js.
    function armarFilas(descanso) {
        const filasSt = filasSobretiempo(descanso.selecciones).map(s => ({
            dia: M.diaSemanaYFechaTexto(s.FECHA_SOBRETIEMPO),
            inicio: s.HORA_INICIO || '',
            fin: s.HORA_FIN || '',
            horas: s.HORAS_A_UTILIZAR
        }));
        const filasDescanso = (descanso.fechasDescanso || []).map(f => ({
            dia: M.diaSemanaYFechaTexto(f.fecha),
            inicio: f.horaInicio || '',
            fin: f.horaFin || '',
            horas: f.horas || 0
        }));
        return { filasSt, filasDescanso };
    }

    // ---------- ETAPA 1: solicitud de autorización de horas de sobretiempo ----------
    // d = { tipo:'autorizacion', personal, idSolicitud, justificacion, saludo }
    function esAutorizacion(d) { return d && d.tipo === 'autorizacion'; }
    // "Nombres Apellidos" (como se escribe en un oficio); si faltan los campos, el nombre estándar.
    function nombreNatural(personal) {
        const n = [personal?.NOMBRES, personal?.APE_PATERNO, personal?.APE_MATERNO].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        return n || nombreYEncabezado(personal).nombre;
    }
    function partesAutorizacion(d) {
        const { cargo } = nombreYEncabezado(d.personal), nombre = nombreNatural(d.personal);
        const sexo = window.sexoPersona(d.personal);
        const art = sexo === 'femenino' ? 'la' : 'el';
        const trat = sexo === 'femenino' ? 'Sra.' : (sexo === 'masculino' ? 'Sr.' : '');   // según el campo SEXO de la base de personal
        const idp = d.personal?.ID_PERSONAL ? ` (${d.personal.ID_PERSONAL})` : '';
        const rol = String(cargo || '').trim().toLowerCase() || 'colaborador';
        const saludo = (d.saludo || '').trim() || 'Estimado [nombre del responsable]';
        const justif = String(d.justificacion || '').trim().replace(/[.\s]+$/, '');
        return [
            `${saludo.replace(/:\s*$/, '')}:`,
            'De mi mayor consideración:',
            `Reciba un cordial saludo. Mediante la presente, solicito se considere la autorización de horas de sobretiempo para ${art} ${rol} ${trat ? trat + ' ' : ''}${nombre}${idp}.`,
            justif ? `La presente solicitud se sustenta en lo siguiente: ${justif}.` : '',
            'En ese sentido, las horas de sobretiempo permitirán mantener la adecuada atención de los requerimientos operativos del laboratorio y asegurar la continuidad de las actividades programadas sin afectar el servicio brindado.',
            'Agradezco de antemano la atención prestada.',
            'Atentamente,'
        ].filter(Boolean);
    }
    function generarHTMLAutorizacion(d) {
        return `<div style="${F}${AJUSTE_TEXTO}">${partesAutorizacion(d).map(t => `<p style="margin:0 0 12px 0;">${escHTML(t)}</p>`).join('')}</div>`;
    }
    function asuntoAutorizacion(d) {
        const idp = d.personal?.ID_PERSONAL ? ` (${d.personal.ID_PERSONAL})` : '';
        return `Solicitud de autorización de horas de sobretiempo: ${nombreNatural(d.personal)}${idp}`;
    }

    function generarHTML(descanso) {
        if (esAutorizacion(descanso)) return generarHTMLAutorizacion(descanso);
        const { nombre, id, tratamiento } = nombreYEncabezado(descanso.personal);
        const { filasSt, filasDescanso } = armarFilas(descanso);
        const encabezadoNombre = `${nombre} (ID: ${id})`;
        const destinatario = (descanso.destinatario || '').trim() || '[Nombre del responsable]';
        const motivo = (descanso.observaciones || '').trim();
        const datosPersona = `${tratamiento ? escHTML(tratamiento) + ' ' : ''}${escHTML(`${nombre} (${id})`)}`;
        const conector = tratamiento === 'Sra.' ? 'a la' : (tratamiento ? 'al' : 'a'); // "al Sr./Sra. X" vs "a X" si no hay SEXO cargado

        const textoAntes = `
<div style="${F}${AJUSTE_TEXTO}">
<p style="margin:0 0 8px 0;">Estimado ${escHTML(destinatario)}:</p>
<p style="margin:0 0 8px 0;">De mi mayor consideración, reciba un cordial saludo.</p>
<p style="margin:0 0 12px 0;">Mediante la presente, se solicita considerar el otorgamiento de descanso compensatorio ${conector} ${datosPersona}${motivo ? `, ${escHTML(motivo)}` : ''}.</p>
</div>`;

        const tablas = `
<table cellspacing="0" cellpadding="0" style="background:#FFFFFF;border-collapse:collapse;margin-bottom:8px;">
<tr>
<td style="background:#FFFFFF;vertical-align:top;padding:0 24px 0 0;">${tablaHTML('HORAS SOBRETIEMPO', filasSt)}</td>
<td style="background:#FFFFFF;vertical-align:top;padding:0;">${tablaHTML('DESCANSO COMPENSATORIO', filasDescanso)}</td>
</tr>
</table>`;

        const textoDespues = `
<div style="${F}${AJUSTE_TEXTO}">
<p style="margin:8px 0 4px 0;">Se adjuntan las evidencias y autorizaciones correspondientes para su consideración.</p>
<p style="margin:8px 0 4px 0;">Sin otro particular, quedo de usted.</p>
<p style="margin:0;">Saludos cordiales.</p>
</div>`;

        return `${textoAntes}${tablas}${textoDespues}`.trim();
    }

    // Versión en texto plano (respaldo si el cliente de correo no
    // acepta HTML al pegar), columnas separadas por tabulador.
    function generarTextoPlano(descanso) {
        if (esAutorizacion(descanso)) return partesAutorizacion(descanso).join('\n\n');
        const { nombre, id, tratamiento } = nombreYEncabezado(descanso.personal);
        const { filasSt, filasDescanso } = armarFilas(descanso);
        const destinatario = (descanso.destinatario || '').trim() || '[Nombre del responsable]';
        const motivo = (descanso.observaciones || '').trim();
        const datosPersona = `${tratamiento ? tratamiento + ' ' : ''}${nombre} (${id})`;
        const conector = tratamiento === 'Sra.' ? 'a la' : (tratamiento ? 'al' : 'a');

        function bloqueTabla(titulo, filas) {
            let t = `${titulo}\nDÍA\tINICIO\tFIN\tTOTAL\n`;
            let total = 0;
            filas.forEach(f => {
                total += parseFloat(f.horas) || 0;
                t += `${f.dia}\t${f.inicio}\t${f.fin}\t${M.horasDecimalATextoHM(f.horas)}\n`;
            });
            t += `\t\t\t${M.horasDecimalATextoHM(total)} (TOTAL)\n`;
            return t;
        }

        let t = `Estimado ${destinatario}:\n\n`;
        t += 'De mi mayor consideración, reciba un cordial saludo.\n';
        t += `Mediante la presente, se solicita considerar el otorgamiento de descanso compensatorio ${conector} ${datosPersona}${motivo ? `, ${motivo}` : ''}.\n\n`;
        t += bloqueTabla('HORAS SOBRETIEMPO', filasSt) + '\n';
        t += bloqueTabla('DESCANSO COMPENSATORIO', filasDescanso) + '\n';
        t += 'Se adjuntan las evidencias y autorizaciones correspondientes para su consideración.\n';
        t += 'Sin otro particular, quedo de usted.\n';
        t += 'Saludos cordiales.\n';
        return t;
    }

    // ---- Asunto ----
    function asunto(descanso) {
        if (esAutorizacion(descanso)) return asuntoAutorizacion(descanso);
        const { nombre, id } = nombreYEncabezado(descanso.personal);
        return `Solicitud de descanso compensatorio – ${nombre} (${id})`;
    }

    return { generarHTML, generarTextoPlano, asunto, esAutorizacion };
})();

// ============================================================
// Apertura del modal único de correo (js/core/correo-modal.js)
// ============================================================
const ST_LS_SALUDO = 'ogl_sobretiempo_aut_saludo';
function stLsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function stLsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

// IDs de las solicitudes de sobretiempo (etapa 1) de las que sale el descanso compensatorio.
function stIdsSolicitudesOrigen(descanso) {
    if (descanso && descanso.tipo === 'autorizacion') return descanso.idSolicitud ? [String(descanso.idSolicitud)] : [];
    const ids = (descanso.selecciones || []).map(x => String(x.ID_SOLICITUD_ORIGEN || '').trim()).filter(Boolean);
    return Array.from(new Set(ids));
}

// Genera (en el backend, desde la plantilla oficial) el Excel de cada solicitud de etapa 1
// y lo devuelve como adjuntos. Si alguno falla, devuelve { fallos } para que el usuario decida.
async function stGenerarExcelsEtapa1(descanso) {
    const ids = stIdsSolicitudesOrigen(descanso), out = [], fallos = [];
    for (const id of ids) {
        try {
            const r = await window.AUTH.request(window.API_URL + '?action=generarSobretiempoXLSX&idSolicitud=' + encodeURIComponent(id));
            if (!r.success || !r.data || !r.data.base64) { fallos.push(`${id}: ${(r && r.message) || 'sin respuesta'}`); continue; }
            const mime = r.data.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            out.push({ name: r.data.filename || `Sobretiempo_${id}.xlsx`, type: mime, dataUrl: `data:${mime};base64,${r.data.base64}`, size: Math.round(r.data.base64.length * 0.75) });
        } catch (e) { fallos.push(`${id}: ${e.message || 'error de conexión'}`); }
    }
    return { archivos: out, fallos, total: ids.length };
}

window.abrirModalCorreoSobretiempo = function(descanso) {
    if (!descanso || !descanso.personal) return;
    const E = window.SobretiempoExportCorreo, esAut = E.esAutorizacion(descanso);
    if (esAut && !descanso.saludo) descanso.saludo = stLsGet(ST_LS_SALUDO);
    const ids = stIdsSolicitudesOrigen(descanso);

    window.CorreoModal.abrir({
        clave: 'sobretiempo',
        claveLegacy: { para: 'ogl_sobretiempo_correo_para', cc: 'ogl_sobretiempo_correo_cc' },
        titulo: esAut ? 'Solicitud de autorización de horas de sobretiempo' : 'Solicitud de descanso compensatorio',
        asunto: E.asunto(descanso),
        html: E.generarHTML(descanso),
        textoPlano: () => E.generarTextoPlano(descanso),
        // Etapa 1: saludo con el nombre y cargo de quien autoriza (se recuerda para la próxima vez)
        extras: esAut ? (cont, api) => {
            cont.innerHTML = `<div class="form-group" style="margin-bottom:12px;">
                <label>Saludo: nombre y cargo de quien autoriza (se recuerda para la próxima vez)</label>
                <input type="text" id="stCorreoSaludo" placeholder="Ej. Estimado Ing. Genaro Pajuelo"></div>`;
            const inp = cont.querySelector('#stCorreoSaludo');
            inp.value = descanso.saludo || '';
            inp.addEventListener('input', () => { descanso.saludo = inp.value; api.setHTML(E.generarHTML(descanso)); });
        } : null,
        adjuntosAuto: [{
            id: 'excelEtapa1',
            etiqueta: ids.length ? `Adjuntar el formato Excel de sobretiempo de la etapa 1 (${ids.length} solicitud${ids.length === 1 ? '' : 'es'}: ${ids.join(', ')})` : 'No hay solicitudes de sobretiempo de origen para adjuntar',
            etiquetaCorta: 'formato(s) Excel de sobretiempo',
            cantidad: ids.length,
            generar: () => stGenerarExcelsEtapa1(descanso)
        }],
        alEnviar: () => { if (esAut && descanso.saludo) stLsSet(ST_LS_SALUDO, descanso.saludo); }
    });
};

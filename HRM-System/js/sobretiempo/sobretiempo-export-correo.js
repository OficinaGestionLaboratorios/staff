// ============================================================
// SOBRETIEMPO-EXPORT-CORREO.JS — Producto final de la Fase 2
// ============================================================
// Genera el correo de "Solicitud de descanso compensatorio" que se
// pega directo en el cuerpo de un correo (Gmail/Outlook) para
// enviarlo manualmente (botón "Copiar todo") o enviarlo directo con
// la cuenta de Google corporativa de quien usa el sistema (botón
// "Enviar correo", mismo modelo que Descanso médico: ver
// descansomedico/descanso-gmail.js). "Copiar todo" se conserva como
// respaldo por si el envío directo no funciona.
//
// Reproduce el modelo real recibido: título "SOLICITUD DE DESCANSO
// COMPENSATORIO: Nombre (ID: ...)", saludo, párrafo con el motivo,
// y DOS tablas lado a lado (HORAS SOBRETIEMPO / DESCANSO
// COMPENSATORIO), cada una con columnas DÍA/INICIO/FIN/TOTAL y una
// fila de total resaltada en amarillo.
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
    // Resaltado suave (mismo amarillo del correo de Descanso médico) + negrita.
    const RESALTE = 'background-color:#FFF3A8;font-weight:bold;';
    const resaltado = t => `<span style="${RESALTE}">${escHTML(t)}</span>`;
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
        const rol = String(cargo || '').trim().toLowerCase() || 'colaborador';
        const saludo = (d.saludo || '').trim() || 'Estimado [nombre del responsable]';
        const justif = String(d.justificacion || '').trim().replace(/[.\s]+$/, '');
        return [
            `${saludo.replace(/:\s*$/, '')}:`,
            'De mi mayor consideración:',
            `Reciba un cordial saludo. Mediante la presente, solicito se considere la autorización de horas de sobretiempo para ${art} ${rol} ${nombre}.`,
            justif ? `La presente solicitud se sustenta en lo siguiente: ${justif}.` : '',
            'En ese sentido, las horas de sobretiempo permitirán mantener la adecuada atención de los requerimientos operativos del laboratorio y asegurar la continuidad de las actividades programadas sin afectar el servicio brindado.',
            'Agradezco de antemano la atención prestada.',
            'Atentamente,'
        ].filter(Boolean);
    }
    function generarHTMLAutorizacion(d) {
        const nombre = nombreNatural(d.personal);
        const parrafo = t => { const e = escHTML(t); return nombre ? e.replace(escHTML(nombre), resaltado(nombre)) : e; };
        return `<div style="${F}${AJUSTE_TEXTO}">${partesAutorizacion(d).map(t => `<p style="margin:0 0 12px 0;">${parrafo(t)}</p>`).join('')}</div>`;
    }
    function asuntoAutorizacion(d) {
        return `Solicitud de autorización de horas de sobretiempo: ${nombreNatural(d.personal)}`;
    }

    function generarHTML(descanso) {
        if (esAutorizacion(descanso)) return generarHTMLAutorizacion(descanso);
        const { nombre, id, tratamiento } = nombreYEncabezado(descanso.personal);
        const { filasSt, filasDescanso } = armarFilas(descanso);
        const encabezadoNombre = `${nombre} (ID: ${id})`;
        const destinatario = (descanso.destinatario || '').trim() || '[Nombre del responsable]';
        const motivo = (descanso.observaciones || '').trim();
        const datosPersona = `${tratamiento ? escHTML(tratamiento) + ' ' : ''}${resaltado(`${nombre} (${id})`)}`;
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
        const datosPersona = `${tratamiento ? tratamiento + ' ' : ''}${nombre} (ID: ${id})`;
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

    // ---- Asunto y mensaje .eml (para enviar por Gmail API) ----
    function asunto(descanso) {
        if (esAutorizacion(descanso)) return asuntoAutorizacion(descanso);
        const { nombre, id } = nombreYEncabezado(descanso.personal);
        return `Solicitud de descanso compensatorio – ${nombre} (ID: ${id})`;
    }
    function b64(str) { return btoa(unescape(encodeURIComponent(str))); }
    function lineas76(b) { return (b.match(/.{1,76}/g) || []).join('\r\n'); }
    // archivos: [{ name, type, dataUrl }] → adjuntos reales. opc: { para, cc }
    function generarEml(descanso, archivos, opc) {
        opc = opc || {};
        const bnd = '----=_OGL_mixed_' + Date.now();
        const html = '<html><body>' + (opc.html || generarHTML(descanso)) + '</body></html>';   // opc.html = cuerpo editado por el usuario
        const L = ['To: ' + opc.para, ...(opc.cc ? ['Cc: ' + opc.cc] : []), 'MIME-Version: 1.0', 'Subject: =?UTF-8?B?' + b64(opc.asunto || asunto(descanso)) + '?=',
            `Content-Type: multipart/mixed; boundary=\"${bnd}\"`, '',
            `--${bnd}`, 'Content-Type: text/html; charset=\"UTF-8\"', 'Content-Transfer-Encoding: base64', '', lineas76(b64(html)), ''];
        (archivos || []).forEach(a => {
            const nombre = String(a.name || 'adjunto').replace(/[\r\n\"]/g, '_');
            L.push(`--${bnd}`, `Content-Type: ${a.type || 'application/octet-stream'}; name=\"${nombre}\"`, 'Content-Transfer-Encoding: base64',
                `Content-Disposition: attachment; filename=\"${nombre}\"`, '', lineas76(String(a.dataUrl).split(',')[1] || ''), '');
        });
        L.push(`--${bnd}--`, '');
        return L.join('\r\n');
    }

    return { generarHTML, generarTextoPlano, asunto, generarEml, esAutorizacion };
})();

// ============================================================
// MODAL "Vista previa de correo" — Copiar todo (respaldo) y Enviar
// correo directo con la cuenta de Google corporativa del usuario.
// ============================================================

let sobretiempoCorreoModalDescanso = null;
let sobretiempoCorreoArchivos = [];   // adjuntos opcionales (PDF / imágenes) — no se guardan en BD
const ST_LS_PARA = 'ogl_sobretiempo_correo_para', ST_LS_CC = 'ogl_sobretiempo_correo_cc', ST_LS_SALUDO = 'ogl_sobretiempo_aut_saludo';
function stLsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function stLsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function stEl(id) { return document.getElementById(id); }
function stPintarAdjuntos() {
    const el = stEl('stCorreoAdjuntos'); if (!el) return;
    el.innerHTML = sobretiempoCorreoArchivos.length ? sobretiempoCorreoArchivos.map((f, i) =>
        `<span style=\"display:inline-flex;align-items:center;gap:6px;margin:0 8px 6px 0;padding:4px 8px;border:1px solid #CBD5E1;border-radius:6px;background:#F8FAFC;font-size:12px;\">📎 ${window.esc(f.name)}
        <button type=\"button\" onclick=\"window.stQuitarArchivo(${i})\" title=\"Quitar\" style=\"border:none;background:none;cursor:pointer;color:#BB0000;\"><i class=\"fas fa-times\"></i></button></span>`).join('') : '';
}

window.abrirModalCorreoSobretiempo = function(descanso) {
    if (!descanso || !descanso.personal) return;
    const modal = document.getElementById('modalCorreoSobretiempo');
    const cuerpo = document.getElementById('correoSobretiempoPreview');
    if (!modal || !cuerpo) return;

    sobretiempoCorreoModalDescanso = descanso;
    const esAut = descanso.tipo === 'autorizacion';
    if (esAut && !descanso.saludo) descanso.saludo = stLsGet(ST_LS_SALUDO);
    const filaSaludo = stEl('stFilaSaludo'), inSaludo = stEl('stCorreoSaludo');
    if (filaSaludo) filaSaludo.style.display = esAut ? '' : 'none';
    if (inSaludo) inSaludo.value = esAut ? (descanso.saludo || '') : '';
    const tit = stEl('stCorreoTitulo'); if (tit) tit.textContent = esAut ? 'Solicitud de autorización de horas de sobretiempo' : 'Solicitud de descanso compensatorio';
    cuerpo.innerHTML = window.SobretiempoExportCorreo.generarHTML(descanso);
    cuerpo.contentEditable = 'true';   // el usuario puede corregir el texto antes de enviar o copiar
    sobretiempoCorreoArchivos = []; stPintarAdjuntos();
    const chkX = stEl('stAdjuntarExcel'), nX = stIdsSolicitudesOrigen(descanso).length;
    if (chkX) { chkX.checked = nX > 0; chkX.disabled = nX === 0; }
    const lblX = stEl('stAdjuntarExcelTxt'); if (lblX) lblX.textContent = nX ? `Adjuntar el formato Excel de sobretiempo de la etapa 1 (${nX} solicitud${nX === 1 ? '' : 'es'}: ${stIdsSolicitudesOrigen(descanso).join(', ')})` : 'No hay solicitudes de sobretiempo de origen para adjuntar';
    const para = stEl('stCorreoPara'), cc = stEl('stCorreoCc'), asu = stEl('stCorreoAsuntoTexto'), fi = stEl('stCorreoArchivos');
    if (para) para.value = stLsGet(ST_LS_PARA); if (cc) cc.value = stLsGet(ST_LS_CC); if (fi) fi.value = '';
    if (asu) asu.value = window.SobretiempoExportCorreo.asunto(descanso);
    window.DescansoGmail?.precargar().catch(() => {});

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.cerrarModalCorreoSobretiempo = function() {
    const modal = document.getElementById('modalCorreoSobretiempo');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    sobretiempoCorreoModalDescanso = null;
    sobretiempoCorreoArchivos = [];
};

window.stQuitarArchivo = function(i) { sobretiempoCorreoArchivos.splice(i, 1); stPintarAdjuntos(); };
window.stArchivosElegidos = async function(input) {
    const MAX = 10 * 1024 * 1024, TOTAL = 18 * 1024 * 1024;
    for (const f of Array.from(input.files || [])) {
        const ok = f.type === 'application/pdf' || /\.pdf$/i.test(f.name) || (f.type || '').startsWith('image/');
        if (!ok) { window.toast(`⚠️ \"${f.name}\" no es imagen ni PDF`, 'warning'); continue; }
        const usado = sobretiempoCorreoArchivos.reduce((a, x) => a + (x.size || 0), 0);
        if (f.size > MAX) { window.toast(`⚠️ \"${f.name}\" pesa más de 10 MB`, 'warning'); continue; }
        if (usado + f.size > TOTAL) { window.toast('⚠️ Los adjuntos superan 18 MB en total', 'warning'); continue; }
        const dataUrl = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(''); fr.readAsDataURL(f); });
        if (dataUrl) sobretiempoCorreoArchivos.push({ name: f.name, type: f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : 'application/octet-stream'), dataUrl, size: f.size });
        else window.toast(`⚠️ No se pudo leer \"${f.name}\"`, 'warning');
    }
    input.value = '';
    stPintarAdjuntos();
};

// IDs de las solicitudes de sobretiempo (etapa 1) de las que sale el descanso compensatorio.
function stIdsSolicitudesOrigen(descanso) {
    if (descanso && descanso.tipo === 'autorizacion') return descanso.idSolicitud ? [String(descanso.idSolicitud)] : [];
    const ids = (descanso.selecciones || []).map(x => String(x.ID_SOLICITUD_ORIGEN || '').trim()).filter(Boolean);
    return Array.from(new Set(ids));
}

// Genera (en el backend, desde la plantilla oficial) el Excel de cada solicitud de etapa 1
// y lo devuelve como adjuntos. Si alguno falla, devuelve { error } para que el usuario decida.
async function stGenerarExcelsEtapa1(descanso) {
    const ids = stIdsSolicitudesOrigen(descanso), out = [], fallos = [];
    for (const id of ids) {
        try {
            const r = await window.AUTH.request(window.API_URL + '?action=generarSobretiempoXLSX&idSolicitud=' + encodeURIComponent(id));
            if (!r.success || !r.data || !r.data.base64) { fallos.push(`${id}: ${(r && r.message) || 'sin respuesta'}`); continue; }
            const mime = r.data.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            out.push({ name: r.data.filename || `Sobretiempo_${id}.xlsx`, type: mime, dataUrl: `data:${mime};base64,${r.data.base64}`, size: Math.round(r.data.base64.length * 0.75), etapa1: true });
        } catch (e) { fallos.push(`${id}: ${e.message || 'error de conexión'}`); }
    }
    return { archivos: out, fallos, total: ids.length };
}

// Si cambia el saludo, se vuelve a armar el cuerpo (solo etapa 1).
// Barra de formato del cuerpo editable: negrita, cursiva, subrayado, resaltado amarillo, fuente y tamaño.
window.stFormato = function(cmd, valor) {
    const cuerpo = stEl('correoSobretiempoPreview'), sel = window.getSelection();
    if (!cuerpo || !sel.rangeCount || sel.isCollapsed || !cuerpo.contains(sel.anchorNode)) {
        window.toast('⚠️ Selecciona primero un texto dentro del correo', 'warning'); return;
    }
    document.execCommand('styleWithCSS', false, true);
    if (cmd === 'resaltar') document.execCommand('hiliteColor', false, '#FFF3A8');
    else if (cmd === 'sinResalte') document.execCommand('hiliteColor', false, 'transparent');
    else document.execCommand(cmd, false, valor);
};

window.stSaludoCambiado = function() {
    const d = sobretiempoCorreoModalDescanso; if (!d || d.tipo !== 'autorizacion') return;
    d.saludo = stEl('stCorreoSaludo')?.value || '';
    const cuerpo = stEl('correoSobretiempoPreview');
    if (cuerpo) cuerpo.innerHTML = window.SobretiempoExportCorreo.generarHTML(d);
};

window.stCopiarAsunto = async function() {
    const t = stEl('stCorreoAsuntoTexto')?.value || '';
    if (!t) return;
    try { await navigator.clipboard.writeText(t); window.toast('📋 Asunto copiado', 'success'); }
    catch (e) { window.toast('❌ No se pudo copiar el asunto', 'error'); }
};

window.stCambiarCuentaGoogle = async function() {
    try { window.DescansoGmail.olvidar(); await window.DescansoGmail.precargar(); await window.DescansoGmail.obtenerToken(true); window.toast('Cuenta de Google actualizada', 'success'); }
    catch (e) { window.toast('❌ ' + e.message, 'error'); }
};

// Envío directo con Gmail (cuenta corporativa de quien usa el sistema).
window.stEnviarCorreo = async function() {
    const d = sobretiempoCorreoModalDescanso; if (!d) return;
    if (!window.DescansoGmail || !window.DescansoGmail.disponible()) { window.toast('⚠️ El envío directo no está configurado: usa «Copiar todo»', 'warning'); return; }
    const para = (stEl('stCorreoPara')?.value || '').trim(), cc = (stEl('stCorreoCc')?.value || '').trim();
    if (!para) { window.toast('⚠️ Indica el correo del destinatario', 'warning'); stEl('stCorreoPara')?.focus(); return; }
    const E = window.SobretiempoExportCorreo;
    const asuntoFinal = (stEl('stCorreoAsuntoTexto')?.value || '').trim() || E.asunto(d);
    const cuerpoFinal = (stEl('correoSobretiempoPreview')?.innerHTML || '').trim();
    if (!cuerpoFinal) { window.toast('⚠️ El cuerpo del correo está vacío', 'warning'); return; }
    const conExcel = !!stEl('stAdjuntarExcel')?.checked, nExcel = conExcel ? stIdsSolicitudesOrigen(d).length : 0;
    if (!confirm(`¿Enviar ahora este correo?\n\nPara: ${para}${cc ? '\nCC: ' + cc : ''}\nAsunto: ${asuntoFinal}\nAdjuntos: ${sobretiempoCorreoArchivos.length} archivo(s) tuyos` + (conExcel ? ` + ${nExcel} formato(s) Excel de sobretiempo` : '') + `\n\nSe enviará con tu cuenta de Google corporativa.`)) return;
    const btn = stEl('stBtnEnviar'); if (btn) { btn.disabled = true; btn.innerHTML = '<i class=\"fas fa-spinner fa-spin\"></i> Enviando...'; }
    try {
        // El token se pide primero, dentro del clic (si no, el navegador bloquea la ventana de Google).
        const tk = await window.DescansoGmail.obtenerToken(false);
        let adjuntos = sobretiempoCorreoArchivos.slice();
        if (conExcel) {
            if (btn) btn.innerHTML = '<i class=\"fas fa-spinner fa-spin\"></i> Generando Excel...';
            const g = await stGenerarExcelsEtapa1(d);
            if (g.fallos.length && !confirm(`No se pudo generar ${g.fallos.length} de ${g.total} Excel:\n\n${g.fallos.join('\n')}\n\n¿Enviar el correo de todos modos, sin ese(os) Excel?`)) return;
            adjuntos = adjuntos.concat(g.archivos);
            if (adjuntos.reduce((a, x) => a + (x.size || 0), 0) > 18 * 1024 * 1024) { window.toast('⚠️ Los adjuntos superan 18 MB: quita alguno o usa «Copiar todo»', 'warning'); return; }
            if (btn) btn.innerHTML = '<i class=\"fas fa-spinner fa-spin\"></i> Enviando...';
        }
        const r = await window.DescansoGmail.enviar(tk, E.generarEml(d, adjuntos, { para, cc, html: cuerpoFinal, asunto: asuntoFinal }));
        if (!r.ok) { window.toast('❌ ' + r.message + ' (puedes usar «Copiar todo»)', 'error'); return; }
        stLsSet(ST_LS_PARA, para); stLsSet(ST_LS_CC, cc);
        if (d.tipo === 'autorizacion' && d.saludo) stLsSet(ST_LS_SALUDO, d.saludo);
        window.toast('✉️ Correo enviado desde ' + r.de + ' a ' + para, 'success');
        window.cerrarModalCorreoSobretiempo();
    } catch (e) {
        window.toast('❌ ' + (e.message || 'No se pudo enviar el correo') + ' (puedes usar «Copiar todo»)', 'error');
    } finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class=\"fas fa-paper-plane\"></i> Enviar correo'; } }
};

// Mismo truco de contenteditable + execCommand('copy') que usa
// copiarCorreoHorarioModal, con respaldo en la Clipboard API moderna.
window.copiarCorreoSobretiempoModal = async function() {
    if (!sobretiempoCorreoModalDescanso) return;
    const editado = (stEl('correoSobretiempoPreview')?.innerHTML || '').trim();
    const html = editado || window.SobretiempoExportCorreo.generarHTML(sobretiempoCorreoModalDescanso);
    const texto = stEl('correoSobretiempoPreview')?.innerText || window.SobretiempoExportCorreo.generarTextoPlano(sobretiempoCorreoModalDescanso);

    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    host.style.cssText = 'position:fixed;top:0;left:0;width:680px;overflow:hidden;opacity:0;pointer-events:none;background:#FFFFFF;';
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

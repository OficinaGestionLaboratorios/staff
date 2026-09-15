// ============================================================
// SOBRETIEMPO-EXPORT-CORREO.JS — Producto final de la Fase 2
// ============================================================
// Genera el correo de "Solicitud de descanso compensatorio" que se
// pega directo en el cuerpo de un correo (Gmail/Outlook) para
// enviarlo manualmente — la web NUNCA envía el correo por sí sola,
// solo arma el texto/tabla listo para copiar, igual que la carta de
// Horarios (ver horario-export-correo.js, mismo patrón de modal
// "Vista previa" + botón "Copiar todo").
//
// Reproduce el modelo real recibido: título "SOLICITUD DE DESCANSO
// COMPENSATORIO: Nombre (Id: ...)", saludo, párrafo con el motivo,
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

    // Nombre "limpio" (sin el "(Id: ...)" que a veces ya trae
    // formatearPersonalSeleccionado) + encabezado con Id aparte.
    function nombreYEncabezado(personal) {
        const nombreCompleto = window.formatearPersonalSeleccionado
            ? window.formatearPersonalSeleccionado(personal)
            : (personal?.NOMBRES ? `${personal.NOMBRES} ${personal.APELLIDOS || ''}`.trim() : '');
        const nombre = String(nombreCompleto || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
        return { nombre, id: personal?.ID_PERSONAL || '', cargo: personal?.CARGO || '' };
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
    const F = "font-family:Calibri,Arial,sans-serif;font-size:14px;color:#000000;";
    const AJUSTE_TEXTO = 'word-break:break-word;overflow-wrap:break-word;';
    const BORDE = '1px solid #333333';
    const AMARILLO = '#FFFF00';

    function celdaEstilo(extra) {
        return `${F}padding:4px 10px;border:${BORDE};vertical-align:middle;box-sizing:border-box;white-space:nowrap;${extra || ''}`;
    }

    // Arma UNA de las dos tablas (encabezado + filas + fila de total
    // resaltada en amarillo, igual que el modelo real).
    function tablaHTML(titulo, filas) {
        const th = celdaEstilo('background-color:#F2F2F2;font-weight:bold;text-align:center;');
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
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
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

    function generarHTML(descanso) {
        const { nombre, id } = nombreYEncabezado(descanso.personal);
        const { filasSt, filasDescanso } = armarFilas(descanso);
        const encabezadoNombre = `${nombre} (Id: ${id})`;
        const destinatario = (descanso.destinatario || '').trim() || '[Nombre del responsable]';
        const motivo = (descanso.observaciones || '').trim();
        const datosPersona = `<strong>${escHTML(nombre)} (Id: ${escHTML(id)})</strong>`;

        const textoAntes = `
<div style="${F}${AJUSTE_TEXTO}">
<p style="margin:0 0 8px 0;font-weight:bold;">SOLICITUD DE DESCANSO COMPENSATORIO: ${escHTML(encabezadoNombre)}</p>
<p style="margin:0 0 8px 0;">Estimado(a) ${escHTML(destinatario)}:</p>
<p style="margin:0 0 8px 0;">De mi mayor consideración, reciba un cordial saludo.</p>
<p style="margin:0 0 12px 0;">Mediante la presente, se solicita considerar el otorgamiento de descanso compensatorio a ${datosPersona}${motivo ? `, ${escHTML(motivo)}` : ''}. Adjunto las evidencias de las autorizaciones correspondientes.</p>
</div>`;

        const tablas = `
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:8px;">
<tr>
<td style="vertical-align:top;padding:0 24px 0 0;">${tablaHTML('HORAS SOBRETIEMPO', filasSt)}</td>
<td style="vertical-align:top;padding:0;">${tablaHTML('DESCANSO COMPENSATORIO', filasDescanso)}</td>
</tr>
</table>`;

        const textoDespues = `
<div style="${F}${AJUSTE_TEXTO}">
<p style="margin:8px 0 4px 0;">Sin otro particular, quedo de usted.</p>
<p style="margin:0;">Saludos cordiales.</p>
</div>`;

        return `${textoAntes}${tablas}${textoDespues}`.trim();
    }

    // Versión en texto plano (respaldo si el cliente de correo no
    // acepta HTML al pegar), columnas separadas por tabulador.
    function generarTextoPlano(descanso) {
        const { nombre, id } = nombreYEncabezado(descanso.personal);
        const { filasSt, filasDescanso } = armarFilas(descanso);
        const destinatario = (descanso.destinatario || '').trim() || '[Nombre del responsable]';
        const motivo = (descanso.observaciones || '').trim();
        const datosPersona = `${nombre} (Id: ${id})`;

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

        let t = `SOLICITUD DE DESCANSO COMPENSATORIO: ${nombre} (Id: ${id})\n\n`;
        t += `Estimado(a) ${destinatario}:\n\n`;
        t += 'De mi mayor consideración, reciba un cordial saludo.\n';
        t += `Mediante la presente, se solicita considerar el otorgamiento de descanso compensatorio a ${datosPersona}${motivo ? `, ${motivo}` : ''}. Adjunto las evidencias de las autorizaciones correspondientes.\n\n`;
        t += bloqueTabla('HORAS SOBRETIEMPO', filasSt) + '\n';
        t += bloqueTabla('DESCANSO COMPENSATORIO', filasDescanso) + '\n';
        t += 'Sin otro particular, quedo de usted.\n';
        t += 'Saludos cordiales.\n';
        return t;
    }

    return { generarHTML, generarTextoPlano };
})();

// ============================================================
// MODAL "Vista previa de correo" — mismo criterio que
// modalCorreoHorario: solo copiar/pegar, la web nunca envía nada.
// ============================================================

let sobretiempoCorreoModalDescanso = null;

window.abrirModalCorreoSobretiempo = function(descanso) {
    if (!descanso || !descanso.personal) return;
    const modal = document.getElementById('modalCorreoSobretiempo');
    const cuerpo = document.getElementById('correoSobretiempoPreview');
    if (!modal || !cuerpo) return;

    sobretiempoCorreoModalDescanso = descanso;
    cuerpo.innerHTML = window.SobretiempoExportCorreo.generarHTML(descanso);

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
};

// Mismo truco de contenteditable + execCommand('copy') que usa
// copiarCorreoHorarioModal, con respaldo en la Clipboard API moderna.
window.copiarCorreoSobretiempoModal = async function() {
    if (!sobretiempoCorreoModalDescanso) return;
    const html = window.SobretiempoExportCorreo.generarHTML(sobretiempoCorreoModalDescanso);
    const texto = window.SobretiempoExportCorreo.generarTextoPlano(sobretiempoCorreoModalDescanso);

    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    host.style.cssText = 'position:fixed;top:0;left:0;width:680px;overflow:hidden;opacity:0;pointer-events:none;';
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

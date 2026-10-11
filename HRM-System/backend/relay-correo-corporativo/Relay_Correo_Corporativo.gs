// ============================================================
// RELAY_CORREO_CORPORATIVO.GS
// Proyecto de Apps Script INDEPENDIENTE, creado y desplegado con la
// CUENTA CORPORATIVA. Solo envía correos; no toca ningún Sheets.
// El backend principal (en la otra cuenta) lo llama con una clave.
//
// Configuración (Configuración del proyecto → Propiedades de script):
//   CLAVE = una clave larga y secreta (la misma que RELAY_CLAVE en el principal)
// Implementar → Nueva implementación → Aplicación web
//   Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier persona
// ============================================================
function jsonRelay_(ok, msg, data) {
  return ContentService.createTextOutput(JSON.stringify({ success: ok, message: msg, data: data || null })).setMimeType(ContentService.MimeType.JSON);
}

function doGet() { return jsonRelay_(true, 'Servicio de correo corporativo activo'); }

function doPost(e) {
  try {
    const clave = PropertiesService.getScriptProperties().getProperty('CLAVE');
    if (!clave) return jsonRelay_(false, 'El relay no tiene CLAVE configurada');
    const d = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (d.CLAVE !== clave) return jsonRelay_(false, 'Clave del servicio de correo incorrecta');
    if (!d.PARA || !d.ASUNTO || !d.HTML) return jsonRelay_(false, 'Faltan destinatario, asunto o cuerpo');

    const imagenes = Array.isArray(d.IMAGENES) ? d.IMAGENES : [], pdfs = Array.isArray(d.PDFS) ? d.PDFS : [];
    const inline = {}, adjuntos = [];
    imagenes.forEach(function (im, i) { inline['img' + (i + 1)] = Utilities.newBlob(Utilities.base64Decode(im.base64), 'image/jpeg', im.name || ('foto' + (i + 1) + '.jpg')); });
    pdfs.forEach(function (p) { adjuntos.push(Utilities.newBlob(Utilities.base64Decode(p.base64), 'application/pdf', p.name || 'descanso_medico.pdf')); });

    const op = { htmlBody: d.HTML, name: d.REMITENTE || 'Oficina de Gestión de Laboratorios' };
    if (d.CC) op.cc = d.CC;
    if (imagenes.length) op.inlineImages = inline;
    if (adjuntos.length) op.attachments = adjuntos;
    MailApp.sendEmail(d.PARA, d.ASUNTO, d.TEXTO || '', op);
    return jsonRelay_(true, 'Correo enviado', { RESTANTES_HOY: MailApp.getRemainingDailyQuota() });
  } catch (err) { return jsonRelay_(false, 'Error en el relay: ' + err); }
}

// Ejecutar UNA vez desde el editor para autorizar el permiso de correo
// (envía una prueba a la propia cuenta corporativa).
function probarEnvioCorreo() {
  const cuenta = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(cuenta, 'Prueba — relay de correo HRM-System', 'El relay de correo corporativo está autorizado.');
  Logger.log('Prueba enviada a ' + cuenta);
}

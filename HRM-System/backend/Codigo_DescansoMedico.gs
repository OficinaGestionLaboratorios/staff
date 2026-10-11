// ============================================================
// CODIGO_DESCANSOMEDICO.GS — Backend módulo Descanso médico
// ============================================================
// Registra el trámite de descanso médico en BD_DESCANSOS_MEDICOS.
// El correo de gestión se redacta en el navegador. La fotografía
// del descanso médico NO se guarda: solo se registra si se adjuntó
// (CON_FOTO = SI/NO).
// ============================================================
const DESCANSOS_SHEET_NAME = 'BD_DESCANSOS_MEDICOS';
const DESCANSOS_HEADERS = [
  'ID_DESCANSO','FECHA_REGISTRO','CODE','ID_PERSONAL','EMPLEADO','DNI','CARGO',
  'FECHA_INICIO','FECHA_FIN','DIAS','FECHA_OTORGAMIENTO','CON_FOTO','OBSERVACION','USUARIO_REGISTRO'
];

function getDescansosMedicosSheet() {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(DESCANSOS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(DESCANSOS_SHEET_NAME);
    sh.appendRow(DESCANSOS_HEADERS);
    sh.getRange(1,1,1,DESCANSOS_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function generarSiguienteIdDescanso_(data) {
  let max=0;
  for(let i=1;i<data.length;i++){
    const m=String(data[i][0]||'').match(/^DM-(\d+)$/i);
    if(m) max=Math.max(max,parseInt(m[1],10));
  }
  return 'DM-'+String(max+1).padStart(6,'0');
}

function diasDescanso_(inicio, fin) {
  if(!inicio || !fin) return 0;
  const a=parseFechaLocal(inicio), b=parseFechaLocal(fin);
  if(!a || !b) return 0;
  const d=Math.round((b-a)/86400000);
  return d>=0 ? d+1 : 0;
}

function validarDescanso_(p) {
  if(!p.CODE) return {error:'CODE del empleado es requerido'};
  if(!p.FECHA_INICIO || !p.FECHA_FIN) return {error:'Las fechas de inicio y fin son requeridas'};
  if(diasDescanso_(p.FECHA_INICIO,p.FECHA_FIN)<=0) return {error:'El período de incapacidad no es válido'};
  if(!p.FECHA_OTORGAMIENTO) return {error:'La fecha de otorgamiento es requerida'};
  return {ok:true};
}

function createDescansoMedico(params) {
  try {
    const v=validarDescanso_(params); if(v.error) return createJsonResponse(false,v.error);
    const sh=getDescansosMedicosSheet(), data=sh.getDataRange().getValues(), id=generarSiguienteIdDescanso_(data), ahora=new Date();
    sh.appendRow([id,ahora,params.CODE||'',params.ID_PERSONAL||'',params.EMPLEADO||'',params.DNI||'',params.CARGO||'',
      params.FECHA_INICIO||'',params.FECHA_FIN||'',diasDescanso_(params.FECHA_INICIO,params.FECHA_FIN),params.FECHA_OTORGAMIENTO||'',
      String(params.CON_FOTO||'').toUpperCase()==='SI'?'SI':'NO',params.OBSERVACION||'',params.__usuario||'']);
    registrarAuditoria(params.__usuario,'CREAR','Descanso médico',`Descanso médico registrado para ${params.EMPLEADO||params.CODE} — ${params.FECHA_INICIO} al ${params.FECHA_FIN} (${id})`,id);
    return createJsonResponse(true,'Descanso médico registrado correctamente',{ID_DESCANSO:id});
  } catch(e){return createJsonResponse(false,e.toString());}
}

function armarObjetoDescanso_(row) {
  const h=DESCANSOS_HEADERS, get=c=>row[h.indexOf(c)];
  return {
    ID_DESCANSO:get('ID_DESCANSO')||'', FECHA_REGISTRO:get('FECHA_REGISTRO') instanceof Date?get('FECHA_REGISTRO').toISOString():(get('FECHA_REGISTRO')||''),
    CODE:get('CODE')||'', ID_PERSONAL:get('ID_PERSONAL')||'', EMPLEADO:get('EMPLEADO')||'', DNI:get('DNI')||'', CARGO:get('CARGO')||'',
    FECHA_INICIO:formatearFechaSoloDia(get('FECHA_INICIO')), FECHA_FIN:formatearFechaSoloDia(get('FECHA_FIN')), DIAS:get('DIAS')||0,
    FECHA_OTORGAMIENTO:formatearFechaSoloDia(get('FECHA_OTORGAMIENTO')), CON_FOTO:get('CON_FOTO')||'NO', OBSERVACION:get('OBSERVACION')||'', USUARIO_REGISTRO:get('USUARIO_REGISTRO')||''
  };
}

function listDescansosMedicos(params) {
  try {
    const sh=getDescansosMedicosSheet(), data=sh.getDataRange().getValues(), code=getCodeParam(params), out=[];
    for(let i=1;i<data.length;i++){if(!data[i][0])continue;if(code && String(data[i][2])!==String(code))continue;out.push(armarObjetoDescanso_(data[i]));}
    out.sort((a,b)=>String(b.FECHA_INICIO).localeCompare(String(a.FECHA_INICIO)));
    return createJsonResponse(true,'Descansos médicos obtenidos',out);
  } catch(e){return createJsonResponse(false,e.toString());}
}

function getDescansoMedico(params) {
  try {
    const id=params.ID_DESCANSO||params.idDescanso; if(!id)return createJsonResponse(false,'ID_DESCANSO es requerido');
    const sh=getDescansosMedicosSheet(), data=sh.getDataRange().getValues();
    for(let i=1;i<data.length;i++) if(String(data[i][0])===String(id)) return createJsonResponse(true,'Descanso médico obtenido',armarObjetoDescanso_(data[i]));
    return createJsonResponse(false,'No se encontró el descanso médico');
  } catch(e){return createJsonResponse(false,e.toString());}
}

function deleteDescansoMedico(params) {
  try {
    const id=params.ID_DESCANSO||params.idDescanso; if(!id)return createJsonResponse(false,'ID_DESCANSO es requerido');
    const sh=getDescansosMedicosSheet(), data=sh.getDataRange().getValues();
    for(let i=1;i<data.length;i++){
      if(String(data[i][0])===String(id)){
        const o=armarObjetoDescanso_(data[i]);
        sh.deleteRow(i+1);
        registrarAuditoria(params.__usuario,'ELIMINAR','Descanso médico',`Descanso médico eliminado de ${o.EMPLEADO||o.CODE} — ${o.FECHA_INICIO} al ${o.FECHA_FIN} (${id})`,id);
        return createJsonResponse(true,'Descanso médico eliminado correctamente');
      }
    }
    return createJsonResponse(false,'No se encontró el descanso médico a eliminar');
  } catch(e){return createJsonResponse(false,e.toString());}
}

// ============================================================
// ENVÍO DEL CORREO DE GESTIÓN (sin copiar/pegar)
// ============================================================
// Se envía desde la cuenta que despliega la web app (executeAs
// USER_DEPLOYING). Las imágenes van incrustadas en el cuerpo
// (cid:img1, cid:img2…) y los PDF como archivos adjuntos.
// Requiere el permiso script.send_mail (appsscript.json).
const CORREO_REMITENTE_NOMBRE = 'Oficina de Gestión de Laboratorios';

function correosValidos_(txt) {
  const lista = String(txt || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  const malos = lista.filter(c => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c));
  return { lista: lista, malos: malos };
}

function sendDescansoMedicoCorreo(params) {
  try {
    const para = correosValidos_(params.PARA), cc = correosValidos_(params.CC);
    if (!para.lista.length) return createJsonResponse(false, 'Indica al menos un destinatario');
    if (para.malos.length || cc.malos.length) return createJsonResponse(false, 'Correo no válido: ' + para.malos.concat(cc.malos).join(', '));
    if (!params.ASUNTO || !params.HTML) return createJsonResponse(false, 'Faltan el asunto o el cuerpo del correo');

    const imagenes = Array.isArray(params.IMAGENES) ? params.IMAGENES : [];
    const pdfs = Array.isArray(params.PDFS) ? params.PDFS : [];

    // Modo corporativo: si el Sheets/script está en otra cuenta, el correo se envía a través
    // del servicio de correo desplegado en la cuenta corporativa (ver backend/relay-correo-corporativo).
    // Se activa con las propiedades de script RELAY_URL y RELAY_CLAVE.
    const props = PropertiesService.getScriptProperties();
    const relayUrl = props.getProperty('RELAY_URL');
    if (relayUrl) {
      const resp = UrlFetchApp.fetch(relayUrl, {
        method: 'post', contentType: 'text/plain;charset=utf-8', followRedirects: true, muteHttpExceptions: true,
        payload: JSON.stringify({ CLAVE: props.getProperty('RELAY_CLAVE') || '', PARA: para.lista.join(','), CC: cc.lista.join(','),
          ASUNTO: params.ASUNTO, HTML: params.HTML, TEXTO: params.TEXTO || '', IMAGENES: imagenes, PDFS: pdfs, REMITENTE: CORREO_REMITENTE_NOMBRE })
      });
      let r;
      try { r = JSON.parse(resp.getContentText()); } catch (err) {
        return createJsonResponse(false, 'El servicio de correo corporativo no respondió bien. Revisa RELAY_URL y que esté desplegado con acceso "Cualquier persona".');
      }
      if (!r.success) return createJsonResponse(false, r.message || 'No se pudo enviar el correo corporativo');
      registrarAuditoria(params.__usuario, 'ENVIAR', 'Descanso médico',
        `Correo de gestión enviado (cuenta corporativa) a ${para.lista.join(', ')}${cc.lista.length ? ' (CC: ' + cc.lista.join(', ') + ')' : ''} — ${params.ASUNTO} · ${imagenes.length} imagen(es), ${pdfs.length} PDF`,
        params.ID_DESCANSO || '');
      return createJsonResponse(true, 'Correo enviado correctamente', r.data || {});
    }

    const inline = {}, adjuntos = [];
    imagenes.forEach(function (im, i) {
      inline['img' + (i + 1)] = Utilities.newBlob(Utilities.base64Decode(im.base64), 'image/jpeg', im.name || ('foto' + (i + 1) + '.jpg'));
    });
    pdfs.forEach(function (p) {
      adjuntos.push(Utilities.newBlob(Utilities.base64Decode(p.base64), 'application/pdf', p.name || 'descanso_medico.pdf'));
    });

    const opciones = { htmlBody: params.HTML, name: CORREO_REMITENTE_NOMBRE };
    if (cc.lista.length) opciones.cc = cc.lista.join(',');
    if (imagenes.length) opciones.inlineImages = inline;
    if (adjuntos.length) opciones.attachments = adjuntos;

    MailApp.sendEmail(para.lista.join(','), params.ASUNTO, params.TEXTO || '', opciones);

    registrarAuditoria(params.__usuario, 'ENVIAR', 'Descanso médico',
      `Correo de gestión enviado a ${para.lista.join(', ')}${cc.lista.length ? ' (CC: ' + cc.lista.join(', ') + ')' : ''} — ${params.ASUNTO} · ${imagenes.length} imagen(es), ${adjuntos.length} PDF`,
      params.ID_DESCANSO || '');
    return createJsonResponse(true, 'Correo enviado correctamente', { RESTANTES_HOY: MailApp.getRemainingDailyQuota() });
  } catch (e) {
    const msg = e.toString();
    if (/authoriz|permission|permiso|script\.send_mail/i.test(msg)) {
      return createJsonResponse(false, 'Falta autorizar el envío de correo. En Apps Script ejecuta una vez la función probarEnvioCorreo, acepta los permisos y crea una nueva versión de la implementación.');
    }
    return createJsonResponse(false, 'No se pudo enviar el correo: ' + msg);
  }
}

// ------------------------------------------------------------
// PRUEBA Y AUTORIZACIÓN (se ejecuta UNA vez desde el editor de Apps Script)
// Menú superior: elegir "probarEnvioCorreo" → Ejecutar → aceptar permisos.
// Envía un correo de prueba a la cuenta que ejecuta el script
// (la cuenta corporativa con la que se publica la web app).
// ------------------------------------------------------------
function probarEnvioCorreo() {
  const cuenta = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(cuenta, 'Prueba de envío — HRM-System (Descanso médico)',
    'Si recibes este correo, el envío desde HRM-System está autorizado.',
    { htmlBody: '<p>Si recibes este correo, el envío desde <b>HRM-System</b> (Descanso médico) está autorizado.</p>', name: CORREO_REMITENTE_NOMBRE });
  Logger.log('Correo de prueba enviado a ' + cuenta + '. Envíos restantes hoy: ' + MailApp.getRemainingDailyQuota());
}

// ============================================================
// CODIGO_LICENCIAS.GS — Backend módulo Licencias
// ============================================================
// Registra solicitudes en BD_LICENCIAS. El documento Word se genera
// en el navegador a partir de la plantilla oficial proporcionada.
// ============================================================
const LICENCIAS_SHEET_NAME = 'BD_LICENCIAS';
const LICENCIAS_HEADERS = [
  'ID_LICENCIA','FECHA_REGISTRO','CODE','ID_PERSONAL','EMPLEADO','DNI',
  'DIRECCION','EMAIL','TELEFONO','CARGO','AREA','FECHA_SOLICITUD',
  'TIPO_LICENCIA','FECHA_INICIO','FECHA_FIN','DIAS','MOTIVO','ANEXOS',
  'USUARIO_REGISTRO'
];

function getLicenciasSheet() {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(LICENCIAS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(LICENCIAS_SHEET_NAME);
    sh.appendRow(LICENCIAS_HEADERS);
    sh.getRange(1,1,1,LICENCIAS_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function generarSiguienteIdLicencia_(data) {
  let max=0;
  for(let i=1;i<data.length;i++){
    const m=String(data[i][0]||'').match(/^LC-(\d+)$/i);
    if(m) max=Math.max(max,parseInt(m[1],10));
  }
  return 'LC-'+String(max+1).padStart(6,'0');
}

function diasLicencia_(inicio, fin) {
  if(!inicio || !fin) return 0;
  const a=parseFechaLocal(inicio), b=parseFechaLocal(fin);
  if(!a || !b) return 0;
  const d=Math.round((b-a)/86400000);
  return d>=0 ? d+1 : 0;
}

function validarLicencia_(p) {
  if(!p.CODE) return {error:'CODE del empleado es requerido'};
  if(!p.FECHA_SOLICITUD) return {error:'La fecha de solicitud es requerida'};
  if(!p.FECHA_INICIO || !p.FECHA_FIN) return {error:'Las fechas de inicio y fin son requeridas'};
  if(diasLicencia_(p.FECHA_INICIO,p.FECHA_FIN)<=0) return {error:'El rango de fechas de la licencia no es válido'};
  if(!p.MOTIVO) return {error:'El motivo de la solicitud es requerido'};
  return {ok:true};
}

function filaLicencia_(id, ahora, p) {
  return [id,ahora,p.CODE||'',p.ID_PERSONAL||'',p.EMPLEADO||'',p.DNI||'',p.DIRECCION||'',p.EMAIL||'',p.TELEFONO||'',p.CARGO||'',p.AREA||'',p.FECHA_SOLICITUD||'',p.TIPO_LICENCIA||'Licencia sin goce de haber por motivos personales',p.FECHA_INICIO||'',p.FECHA_FIN||'',diasLicencia_(p.FECHA_INICIO,p.FECHA_FIN),p.MOTIVO||'',p.ANEXOS||'',p.__usuario||''];
}

function createLicencia(params) {
  try {
    const v=validarLicencia_(params); if(v.error) return createJsonResponse(false,v.error);
    const sh=getLicenciasSheet(), data=sh.getDataRange().getValues(), id=generarSiguienteIdLicencia_(data), ahora=new Date();
    sh.appendRow(filaLicencia_(id,ahora,params));
    registrarAuditoria(params.__usuario,'CREAR','Licencias',`Solicitud de licencia registrada para ${params.EMPLEADO||params.CODE} — ${params.FECHA_INICIO} al ${params.FECHA_FIN} (${id})`,id);
    return createJsonResponse(true,'Solicitud de licencia registrada correctamente',{ID_LICENCIA:id});
  } catch(e){return createJsonResponse(false,e.toString());}
}

function armarObjetoLicencia_(row) {
  const h=LICENCIAS_HEADERS, get=c=>row[h.indexOf(c)];
  return {
    ID_LICENCIA:get('ID_LICENCIA')||'', FECHA_REGISTRO:get('FECHA_REGISTRO') instanceof Date?get('FECHA_REGISTRO').toISOString():(get('FECHA_REGISTRO')||''),
    CODE:get('CODE')||'', ID_PERSONAL:get('ID_PERSONAL')||'', EMPLEADO:get('EMPLEADO')||'', DNI:get('DNI')||'', DIRECCION:get('DIRECCION')||'', EMAIL:get('EMAIL')||'', TELEFONO:get('TELEFONO')||'', CARGO:get('CARGO')||'', AREA:get('AREA')||'',
    FECHA_SOLICITUD:formatearFechaSoloDia(get('FECHA_SOLICITUD')), TIPO_LICENCIA:get('TIPO_LICENCIA')||'', FECHA_INICIO:formatearFechaSoloDia(get('FECHA_INICIO')), FECHA_FIN:formatearFechaSoloDia(get('FECHA_FIN')), DIAS:get('DIAS')||0, MOTIVO:get('MOTIVO')||'', ANEXOS:get('ANEXOS')||'', USUARIO_REGISTRO:get('USUARIO_REGISTRO')||''
  };
}

function listLicencias(params) {
  try {
    const sh=getLicenciasSheet(), data=sh.getDataRange().getValues(), code=getCodeParam(params), out=[];
    for(let i=1;i<data.length;i++){if(!data[i][0])continue;if(code && String(data[i][2])!==String(code))continue;out.push(armarObjetoLicencia_(data[i]));}
    out.sort((a,b)=>String(b.FECHA_SOLICITUD).localeCompare(String(a.FECHA_SOLICITUD)));
    return createJsonResponse(true,'Solicitudes de licencia obtenidas',out);
  } catch(e){return createJsonResponse(false,e.toString());}
}

function getLicencia(params) {
  try {
    const id=params.ID_LICENCIA||params.idLicencia; if(!id)return createJsonResponse(false,'ID_LICENCIA es requerido');
    const sh=getLicenciasSheet(), data=sh.getDataRange().getValues();
    for(let i=1;i<data.length;i++) if(String(data[i][0])===String(id)) return createJsonResponse(true,'Solicitud obtenida',armarObjetoLicencia_(data[i]));
    return createJsonResponse(false,'No se encontró la solicitud de licencia');
  } catch(e){return createJsonResponse(false,e.toString());}
}

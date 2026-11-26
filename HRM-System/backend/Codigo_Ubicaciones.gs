// ============================================================
// UBICACIONES (AMBIENTES DE LABORATORIO) — lectura desde Google Sheets
// ============================================================
// Devuelve el contenido de la hoja LISTA_LABORATORIOS _011026
// (columnas: N°, Programa de Estudio, Acronimo, LABORATORIO O TALLER,
// AMBIENTE, SEDE) para el selector «Seleccionar Ubicaciones».
//
// Se lee desde el servidor para que funcione aunque la hoja NO sea
// pública y sin problemas de CORS en el navegador. La cuenta que
// despliega el script debe tener acceso a la hoja.
//
// Acción: ?action=listUbicaciones (exige sesión iniciada, como el resto).
const UBICACIONES_SHEET_ID = '1QfWm7SiMxBba-3Kmzaaj_aTtRZFVIk996vjnok96fRA';
const UBICACIONES_SHEET_TAB = ''; // nombre de la pestaña; vacío = primera pestaña

function listUbicaciones(params) {
  try {
    const ss = SpreadsheetApp.openById(UBICACIONES_SHEET_ID);
    const sh = UBICACIONES_SHEET_TAB ? ss.getSheetByName(UBICACIONES_SHEET_TAB) : ss.getSheets()[0];
    if (!sh) throw new Error('No se encontró la pestaña «' + UBICACIONES_SHEET_TAB + '» en la hoja de ubicaciones');
    // Se envían los valores tal como se ven (matriz de texto); el frontend
    // localiza las columnas por su encabezado.
    const valores = sh.getDataRange().getDisplayValues();
    return createJsonResponse(true, 'Ubicaciones obtenidas', valores);
  } catch (e) {
    return createJsonResponse(false, 'No se pudo leer la hoja de ubicaciones: ' + e.toString());
  }
}

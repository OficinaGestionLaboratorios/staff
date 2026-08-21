// ============================================================
// SOLICITUD-HORARIO.JS — Generar y descargar la Solicitud de
// cambio de horario (Excel o PDF) desde la ficha del empleado
// ============================================================
// Sigue el mismo patrón que horario-export.js (window.toast,
// window.AUTH.request, descarga vía Blob + <a download>), solo que
// aquí el archivo llega como base64 desde el servidor porque es
// binario (xlsx/pdf), no texto plano como el CSV.
// Cargar este archivo en index.html DESPUÉS de core/auth.js y
// js/api.js, junto a los demás módulos de js/horarios/.
// ============================================================

// descargarArchivo() (en horario-export.js) arma el Blob con un
// BOM de texto UTF-8 — sirve para CSV, pero corrompería un xlsx/pdf
// binario. Por eso este helper separado, a partir de un base64.
window.descargarArchivoBinario = function(nombre, base64, mimeType) {
  const bytes = Utilities_atobToBytes(base64);
  const blob = new Blob([bytes], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = nombre;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

function Utilities_atobToBytes(base64) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

// formato: 'pdf' (default, para imprimir/firmar) o 'xlsx' (para
// seguir editando en Excel/Sheets antes de imprimir).
window.generarSolicitudHorario = async function(code, formato = 'pdf') {
  if (!code) {
    window.toast('⚠️ Selecciona un empleado primero', 'warning');
    return;
  }

  window.toast('⏳ Generando solicitud...', 'info');

  const url = window.API_URL
    + '?action=generarSolicitudHorario'
    + '&code=' + encodeURIComponent(code)
    + '&formato=' + encodeURIComponent(formato);

  const result = await window.AUTH.request(url);

  if (!result.success) {
    window.toast('⚠️ ' + (result.message || 'No se pudo generar la solicitud'), 'warning');
    return;
  }

  const { filename, mimeType, base64 } = result.data;
  window.descargarArchivoBinario(filename, base64, mimeType);
  window.toast('📥 Solicitud generada — completa a mano las fechas/motivo/sustento antes de firmar', 'success');
};

// Los botones que llaman a esta función viven en HRM-System/index.html,
// junto al botón "Exportar" del panel de horarios del empleado.

# v146 – Sello de la OGL en la boleta de Permisos

- La boleta de permiso (Word, 2 copias) ahora lleva el **sello de la Oficina de Gestión de Laboratorios** al costado de
  "Firma y sello del Jefe que autoriza", en ambas copias.
- El sello se incrusta en el .docx (fondo transparente, ~2 cm) y va **flotante**: no agrega altura, así que las 2 copias
  siguen entrando en **una sola hoja A4**. Si el sello no carga, la boleta sale igual que antes.
- El bloque de firmas pasó a 3 columnas (Trabajador | Jefe que autoriza | espacio del sello).
- Archivos: js/permisos/permisos-sello.js (nuevo, sello en base64), js/permisos/permisos-export-docx.js,
  app.html (carga el nuevo script), img/sello_ogl.png (copia del sello con fondo transparente, de respaldo).
- Para cambiar el sello: reemplazar la cadena base64 de permisos-sello.js (y su proporción alto/ancho).
- Sin cambios en backend (.gs): no hay que volver a desplegar nada en Apps Script.

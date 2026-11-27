# v145 – Permisos: duración en hh:mm (ya no sale como fecha)

**Causa:** Google Sheets convertía la duración guardada como texto decimal (p. ej. "2.08") en una fecha (2-ago-2026),
y la boleta imprimía "2026-08-02T05:00:00.000Z h".

**Corrección**
- La duración ya no depende de lo guardado en la hoja: se recalcula siempre con las horas de salida y retorno
  (también con las horas "(no registro)"), por eso se corrigen también las boletas ya registradas.
- Se muestra en formato **hh:mm** (2.08 h → `02:05 h`) en la boleta Word, la lista de permisos, el detalle y la vista previa del formulario.
- Si falta alguna hora y no hay horario ese día, sigue la línea horizontal de "sin registro".
- Backend: `Codigo_Permisos.gs` (listados e informes ya reciben la duración decimal correcta). Hay que volver a desplegarlo en Apps Script;
  aun sin desplegarlo, la boleta y la lista ya salen bien porque recalculan en pantalla.
- Archivos: permisos-model.js, permisos-ui.js, permisos.js, permisos-export-docx.js, Codigo_Permisos.gs.

# v132 — Horarios separados en pestañas: Permanente y Temporal

## Qué cambió (módulo Horarios)
- Arriba del módulo hay un resumen: total de horarios, permanente vigente y temporal en curso.
- Dos pestañas, con contador: **Permanente** y **Temporal**. Cada una tiene su propia lista y su propio formulario;
  al cambiar de pestaña se sale del modo edición y se limpia el formulario.
- El campo "Tipo de horario" ya no se elige: lo fija la pestaña. Al editar un horario se abre su pestaña.
- **Permanente**: sin fecha de fin (la cierra el inicio del siguiente). Si un permanente ya cerrado se edita, la fecha se ve en solo lectura.
- **Temporal**: fecha de fin obligatoria y máximo **6 días corridos** (inicio y fin incluidos), validado al guardar y limitado en el calendario.
  En la lista sus estados se leen "En curso" y "Terminado". Al terminar rige otra vez el último permanente (regla ya existente).
- **Rotativo**: se quitó de la pantalla. No se borra nada del backend ni de la hoja.

## Sin cambios
- Backend (Apps Script), tabla semanal, Solicitud (Excel), exportar, correo y reglas de anticipación.
- El portal de propuestas del personal (portal-propuestas.js) no se tocó en esta versión.

## Archivos
app.html, css/styles.css, js/horarios/horario-model.js, horario-ui.js, horario-validacion.js, horarios.js.
Solo sitio; no hace falta tocar Apps Script.

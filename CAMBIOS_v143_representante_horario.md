# v143 – Representante que firma la modificación de horarios

- Horarios (permanente y temporal, mismo formulario): nuevo campo obligatorio
  "Representante que firma la modificación del horario", junto a la fecha de la solicitud.
- Mismo comportamiento y mismos nombres que "Funcionario que la expide" de Permisos:
  Wilfredo G. Leon Gonzales / Jose Luis Plasencia Carranza / Otro (escribir).
  Al elegir "Otro" el campo se borra y se escribe a mano; al elegir un nombre predefinido se oculta el texto.
- El nombre se guarda en la columna JEFE_DEPENDENCIA de BD_HORARIOS y sale en la celda B11 del
  Excel "Solicitud (Excel)". Al editar un horario se vuelve a cargar el representante guardado.
- Archivos: app.html, js/horarios/{horario-ui,horario-model,horarios,horario-validacion}.js.
- Backend sin cambios (ya escribía JEFE_DEPENDENCIA en B11).

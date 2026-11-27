# v142 — Correo de descanso compensatorio: sin tabla de sobretiempo

- Se quitó la tabla "HORAS SOBRETIEMPO" (mostraba solo la parte tomada y parecía una mala suma).
- Nuevo párrafo: "El trabajador ha generado un total de H:MM horas de sobretiempo (fecha, de HH:MM a HH:MM), de las cuales
  se toman H:MM horas para el descanso compensatorio, distribuidas de la siguiente manera:". Con varias fechas de origen se
  listan separadas por ";" y se suma el total generado. Si se toma todo: "las cuales se toman en su totalidad".
- Queda solo la tabla DESCANSO COMPENSATORIO (por día, con total).
- Aplica también al texto plano.
- La selección del banco ahora lleva las horas generadas de cada fecha (sobretiempo-ui.js).

Servidor: sin cambios.

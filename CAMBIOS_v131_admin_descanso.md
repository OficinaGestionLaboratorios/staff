# v131 — Plataforma administrativa: el total del descanso sale de las fechas

## Qué cambió (Sobretiempo > Usar banco de horas)
- Se quitó el campo "Horas a utilizar" y el botón "Usar todo". Igual que en el portal del personal desde la v130.
- El total a descontar del banco es la **suma de las horas de las fechas de descanso** (ingreso, refrigerio opcional y salida).
- Debajo de las fechas se ve en vivo: "Total de horas de descanso: X h · Saldo disponible: Y h" (verde si alcanza,
  rojo si supera el saldo o falta el horario de alguna fecha).
- La confirmación al generar la solicitud muestra el total a descontar, no el detalle por fecha.

## Sin cambios por dentro
- El reparto del total entre las fechas generadas (de la más antigua a la más reciente) sigue siendo interno,
  para el registro de origen del banco, el correo y la función Anular (ver v129).
- El backend no cambia respecto a la v130.

## Para desplegar
Solo archivos del sitio (app.html y js/sobretiempo/*). No hace falta tocar Apps Script.

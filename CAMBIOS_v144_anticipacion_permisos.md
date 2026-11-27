# v144 – Anticipación solo advierte + Permisos con hora de la jornada

## 1. Anticipación mínima: ya no bloquea, solo advierte
- **Horarios (administrador):** la anticipación (3 días calendario; 10 en cambio unilateral de más de 1 h) pasó de error
  a alerta con confirmación junto con las demás alertas del procedimiento. Se puede registrar de todos modos.
  (horario-validacion.js → avisoAnticipacion, horarios.js)
- **Sobretiempo (portal del personal):** se quitó el bloqueo en pantalla y en el servidor (Codigo_Propuestas.gs).
  Ahora, si la fecha no cumple 1 día hábil (lunes a viernes, INS-DRH-P-30), el portal avisa y pregunta
  "¿Enviar de todos modos?". Mismo criterio que el registro del administrador (antes el portal usaba "mañana").
- **Propuestas de horario (portal):** nuevo aviso (no bloquea) si el inicio no cumple 3 días calendario (INS-DRH-P-28, 6.2).
- Sobretiempo del administrador: sin cambios (ya advertía sin bloquear).
- La propuesta NO se marca como "fuera de plazo" para quien la evalúa: solo se advierte al presentarla.
- Permisos, Vacaciones, Licencias, Descanso médico y Contratos: sin cambios (no tienen esta regla).

## 2. Permisos: hora no marcada = hora de la jornada de ese día
- Sin hora de **salida** → se toma la hora de **ingreso** de la jornada de ese día.
- Sin hora de **retorno** → se toma la hora de **salida** de la jornada de ese día.
- Se guarda y se imprime como `08:00 (no registro)` / `17:00 (no registro)` y la **duración se suma** con esa hora.
- La jornada sale del horario efectivo del trabajador en esa fecha (temporal sobre permanente, igual que el módulo Horarios).
- Si ese día el trabajador no tiene horario, o las horas quedan incoherentes (retorno ≤ ingreso de jornada), no se inventa nada:
  en el primer caso se mantiene el comportamiento anterior ("sin registro", con confirmación); en el segundo se pide corregir.
- Aplica al registro del administrador, a la aprobación de propuestas de permiso y al formulario del portal (que ahora avisa
  que la hora se tomará de la jornada al aprobar). La duración se previsualiza en el formulario del administrador.
- Al editar una boleta con hora "(no registro)", el campo queda vacío y se vuelve a derivar al guardar.
- Backend: Codigo_corregido.gs (formatearHoraSoloHHMM conserva la marca) y Codigo_Propuestas.gs (acepta la marca al aprobar).
- Archivos: app.html, permisos-model/ui/permisos/export-docx.js, propuestas.js, portal-propuestas.js, horarios.js, horario-validacion.js.
- Importante: hay que volver a desplegar los .gs (Codigo_corregido.gs y Codigo_Propuestas.gs) en Apps Script.

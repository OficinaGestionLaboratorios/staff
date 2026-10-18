# Plataforma OGL v85 — notas de la versión

## Cómo publicar
Solo frontend: sube TODO el contenido de `Plataforma-OGL_v85/` a tu hosting reemplazando la v84. No hay cambios de backend (no hace falta republicar Apps Script).

## Cambios
- **Aviso de consulta / sin registros** en Horarios, Sobretiempo, Vacaciones, Permisos, Licencias y Descansos médicos. Al abrir el módulo de un trabajador aparece de inmediato «Consultando <Módulo> en la base de datos…» (con la lista del trabajador anterior oculta, para que no se vea información ajena mientras llega la nueva). Al terminar:
  - sin registros → «No se encontraron registros de <Módulo> en la base de datos.»
  - con registros → el aviso desaparece y se muestra la lista como siempre
  - si la consulta falla (sin conexión, etc.) → «No se pudo consultar <Módulo>. Revisa tu conexión e inténtalo nuevamente.» (antes un error se veía igual que «no hay nada»)
- El aviso también se actualiza al guardar/eliminar: si se elimina el último registro, aparece el mensaje de sin registros.

## Archivos añadidos
js/core/estado-carga.js, css/estado-carga.css, NOTAS_v85.md

## Archivos modificados
app.html; js/horarios/horarios.js; js/sobretiempo/sobretiempo.js; js/vacaciones/vacaciones.js; js/permisos/permisos.js; js/licencias/licencias.js; js/descansomedico/descanso.js (los modificados llevan `?v=85`)

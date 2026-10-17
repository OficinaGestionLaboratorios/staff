# Plataforma OGL v84 — notas de la versión

## Cómo publicar
1. **Frontend**: sube TODO el contenido de `Plataforma-OGL_v84/` a tu hosting (GitHub Pages, etc.), reemplazando la v83. Los scripts modificados llevan `?v=84` para evitar caché.
2. **Backend (obligatorio para la base de correos y las ediciones nuevas)**: en Apps Script copia/reemplaza estos archivos de `HRM-System/backend/`:
   - `Codigo_corregido.gs` (reemplazar) — rutas, permisos y WRITE_ACTIONS nuevos
   - `Codigo_Correos.gs` (**archivo nuevo**) — hoja `BD_CORREOS` (se crea sola)
   - `Codigo_Licencias.gs`, `Codigo_DescansoMedico.gs`, `Codigo_Sobretiempo.gs` (reemplazar)
   Luego **Implementar → Administrar implementaciones → Editar → Nueva versión**. La URL no cambia.
   Sin republicar el backend, el sistema sigue funcionando; solo no guardará/recuperará correos ni editará licencias, descansos médicos y solicitudes de descanso.

## Cambios
- Horarios: se quitó la columna «Observación» por día; hay una **observación general** (se guarda en la columna OBSERVACION de BD_HORARIOS en cada fila, sin cambiar el backend). Los horarios antiguos con observaciones por día se consolidan al abrirlos («Lun: … · Mar: …») y no se pierde nada hasta que se guarde.
- Base de correos persistente (`BD_CORREOS`): se llena con cada envío y con **Importar Excel**; administrador en el menú Horarios → «Base de correos» y botón en el modal de correo. Para/CC son campos de un correo por línea: 1.ª línea = correo institucional del trabajador; luego los asociados al trabajador/área; autocompletado por correo, nombre o área; chips de sugeridos; sin duplicados.
- Vacaciones: botón «1. Registrar período vacacional» sin borde (azul uniforme, con hover/clic/foco); eliminado el «Registrar goce» duplicado de la fila (se conserva la etapa 2 completa).
- Cinco acciones con iconos y tooltips (Editar, Exportar, Copiar, Correo, Eliminar) en Horarios, Sobretiempo, Descansos (solicitudes de descanso compensatorio), Vacaciones, Permisos, Licencias y Descanso médico. Componente compartido: `js/core/acciones-registro.js` + `css/acciones-registro.css`.
- Nuevo en backend: `updateLicencia`, `updateDescansoMedico` (permiso = «crear» del módulo), `updateSolicitudDescansoBanco` y `deleteSolicitudDescansoBanco` (solo solicitudes PENDIENTES; eliminar devuelve las horas al banco).

## Archivos añadidos
js/core/acciones-registro.js, js/core/correos-db.js, js/core/base-correos.js, css/acciones-registro.css, backend/Codigo_Correos.gs, NOTAS_v84.md

## Archivos modificados
app.html; css (nuevo link); js/core/correo-modal.js; js/horarios/{horario-ui,horario-model,horarios,horario-export}.js; js/vacaciones/{vacaciones,vacaciones-ui}.js; js/permisos/{permisos,permisos-ui}.js; js/licencias/{licencias,licencias-ui,licencias-api}.js; js/descansomedico/{descanso,descanso-api}.js; js/sobretiempo/{sobretiempo,sobretiempo-ui,sobretiempo-api}.js; backend/{Codigo_corregido,Codigo_Licencias,Codigo_DescansoMedico,Codigo_Sobretiempo}.gs

## Excel de importación
Columnas reconocidas (cualquier orden; todas las hojas): Correo (puede haber varias columnas «Correo …», p. ej. «Correo jefe»; varias direcciones por celda con ; o ,), Nombre, ID_PERSONAL / DNI / Trabajador (para asociar al trabajador), Área, Tipo (Trabajador/Responsable/Jefatura/Área/Otro), Campo (PARA/CC). Hay plantilla descargable.

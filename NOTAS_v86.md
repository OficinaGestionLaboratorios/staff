# Plataforma OGL v86 — notas de la versión

## Cómo publicar
1. **Backend (OBLIGATORIO):** copia `HRM-System/backend/Codigo_corregido.gs` a tu proyecto de Apps Script y publica una **nueva versión** de la implementación (Implementar > Administrar implementaciones > Editar > Nueva versión). Sin esto el botón nuevo mostrará «Acción no reconocida».
2. **Frontend:** sube TODO el contenido de `Plataforma-OGL_v86/` a tu hosting reemplazando la v85.

## Cambios
- **Usuarios del Sistema → eliminar definitivamente una cuenta** (botón 🗑️ en Acciones).
  - Solo aparece en cuentas **Inactivas** y nunca en la propia. Flujo: desactivar (🚫) y luego eliminar (🗑️).
  - Pide escribir el nombre de usuario exacto para confirmar. Es irreversible (se borra la fila de BD_USUARIOS).
  - El backend (acción `eliminarUsuario`) vuelve a validar todo: sesión admin + API key, no auto-eliminación, cuenta inactiva, confirmación coincidente y que no quede el sistema sin administradores.
  - Queda registrado en Actividad/BD_AUDITORIA como `ELIMINAR_USUARIO`.

## Archivos modificados
HRM-System/backend/Codigo_corregido.gs; HRM-System/js/usuarios/usuarios.js; HRM-System/app.html (usuarios.js?v=86); NOTAS_v86.md

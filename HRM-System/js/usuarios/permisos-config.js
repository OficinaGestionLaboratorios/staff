// ============================================================
// PERMISOS-CONFIG.JS — Catálogo de módulos/acciones para el
// sistema de permisos de acceso granular (checkboxes)
// ============================================================
// Este archivo es la ÚNICA fuente de verdad en el frontend sobre
// qué módulos y qué acciones existen para el sistema de permisos.
// Lo usa usuarios.js para pintar la matriz de checkboxes en el
// formulario de "Usuarios" y app.js/router.js para ocultar del
// sidebar los módulos a los que el usuario logueado no tiene
// acceso ("ver").
//
// IMPORTANTE: esto es solo comodidad visual. La protección real
// vive en el backend (ver ACCIONES_MODULO y tienePermisoAccion_ en
// Codigo_corregido.gs), que vuelve a comprobar el permiso en cada
// petición sin confiar en lo que decida ocultar el navegador — el
// mismo criterio que ya se usa para el rol admin en el resto de la
// app.
//
// Un Administrador (ROL = "admin") SIEMPRE tiene acceso total a
// todo, sin excepción: estos permisos solo aplican a cuentas con
// ROL = "usuario".
// ============================================================

window.ACCIONES_PERMISO = {
    ver: 'Ver',
    crear: 'Crear',
    editar: 'Editar',
    eliminar: 'Eliminar',
    exportar: 'Exportar'
};

window.MODULOS_PERMISOS = [
    { key: 'personal', label: 'Personal', icono: 'fa-users', acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'] },
    { key: 'horarios', label: 'Horarios', icono: 'fa-clock', acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'] },
    { key: 'sobretiempo', label: 'Sobretiempo', icono: 'fa-hourglass-half', acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'] },
    { key: 'vacaciones', label: 'Vacaciones', icono: 'fa-umbrella-beach', acciones: ['ver', 'crear', 'editar', 'exportar'] },
    { key: 'permisos', label: 'Permisos (solicitudes de personal)', icono: 'fa-door-open', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
    { key: 'licencias', label: 'Licencias', icono: 'fa-file-medical-alt', acciones: ['ver', 'crear'] },
    { key: 'auditoria', label: 'Actividad / Auditoría', icono: 'fa-clock-rotate-left', acciones: ['ver'] },
    { key: 'portalPersonal', label: 'Config. Portal del Personal', icono: 'fa-sliders', acciones: ['ver', 'editar'] }
];

// Mapa módulo -> id del botón del sidebar que controla su visibilidad
// (ver app.js: window.iniciarApp aplica esto según los permisos de la
// sesión activa). "usuarios" no aparece aquí a propósito: la gestión
// de usuarios es exclusiva del rol admin y nunca es delegable por
// checkbox.
window.MODULO_A_MENU_ID = {
    personal: 'menuItemPersonal',
    horarios: 'menuItemHorarios',
    sobretiempo: 'menuItemSobretiempo',
    vacaciones: 'menuItemVacaciones',
    permisos: 'menuItemPermisos',
    licencias: 'menuItemLicencias',
    auditoria: 'menuItemActividad',
    portalPersonal: null, // no tiene ítem propio en el sidebar (vive dentro de Personal)
    dashboard: 'menuItemDashboard'
};

// Construye un objeto de permisos "vacío" (todo en false) con la
// forma { modulo: { accion: false, ... }, ... } a partir del catálogo
// de arriba. Se usa como base tanto al crear un usuario nuevo como al
// completar los módulos/acciones que falten en un permiso ya guardado.
window.permisosVacios = function() {
    const permisos = {};
    window.MODULOS_PERMISOS.forEach(m => {
        permisos[m.key] = {};
        m.acciones.forEach(a => { permisos[m.key][a] = false; });
    });
    return permisos;
};

// Combina lo que venga guardado (posiblemente incompleto o de una
// versión anterior del catálogo) con la base vacía, para que la
// matriz siempre pinte todos los módulos/acciones actuales.
window.normalizarPermisosFrontend = function(permisosGuardados) {
    const base = window.permisosVacios();
    if (!permisosGuardados || typeof permisosGuardados !== 'object') return base;
    Object.keys(base).forEach(modulo => {
        if (permisosGuardados[modulo]) {
            Object.keys(base[modulo]).forEach(accion => {
                base[modulo][accion] = permisosGuardados[modulo][accion] === true;
            });
        }
    });
    return base;
};

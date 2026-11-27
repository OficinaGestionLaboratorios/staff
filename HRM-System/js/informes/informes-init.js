// ============================================================
// INFORMES-INIT.JS — Se carga DESPUÉS de app.js. Sin modificar
// app.js: envuelve window.iniciarApp para mostrar el ítem del menú
// solo a quien tenga permiso "ver" de Personal (el módulo lee
// Personal; cada sección además respeta el permiso de su propio
// módulo), y expone el acceso directo desde otros módulos.
// ============================================================
(function () {
    const original = window.iniciarApp;
    window.iniciarApp = function () {
        if (original) original.apply(this, arguments);
        const btn = document.getElementById('menuItemInformes');
        if (btn) btn.style.display = window.AUTH.tienePermiso('personal', 'ver') ? '' : 'none';
    };
    // Clic en el menú lateral = volver a la pantalla de consultas rápidas.
    document.getElementById('menuItemInformes')?.addEventListener('click', () => { if (window.InformesEstado) { window.InformesEstado.vista = 'inicio'; window.InformesEstado.consulta = null; } }, true);
    // Abre la ficha de un trabajador (p. ej. desde el modal de Horarios).
    window.abrirFichaInforme = function (code, tab) {
        if (!code) { window.toast('Selecciona primero un trabajador', 'warning'); return; }
        window.cerrarModalHorarios?.();
        window.InformesEstado.vista = 'ficha'; window.InformesEstado.code = String(code); window.InformesEstado.tab = tab || 'resumen';
        window.InformesFicha.reset();
        window.Router.cambiarVista('informes');
    };
})();

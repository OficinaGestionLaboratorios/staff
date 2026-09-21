// ============================================================
// USUARIOS DEL SISTEMA (solo administradores)
// ============================================================
// Módulo NUEVO e independiente (no toca personal.js / horarios.js /
// modal.js) para el ítem "Usuarios" del sidebar, que solo se muestra
// si la sesión activa tiene ROL = "admin" (ver window.iniciarApp en
// app.js). Lista las cuentas de BD_USUARIOS y permite crear cuentas
// nuevas, editar nombre/rol, activar/desactivar el acceso y
// restablecer la contraseña de otra cuenta.
//
// Habla con el backend por las acciones listUsuarios / crearUsuario
// / actualizarUsuario (ver Codigo_corregido.gs) usando
// window.AUTH.request(), igual que el resto del panel — el backend
// vuelve a comprobar por su cuenta que la sesión sea de un admin,
// así que ocultar el menú en el frontend es solo comodidad visual,
// no la protección real.
// ============================================================

let usuariosCache = [];
let usuarioEnEdicion = null; // null = creando una cuenta nueva; string = editando ese "usuario"

// ------------------------------------------------------------
// Comprobación de permiso de la sesión activa para este módulo.
// La gestión de "Usuarios" es exclusiva de ROL = "admin" (no tiene
// checkboxes en la matriz de permisos, ver permisos-config.js), así
// que aquí el permiso es binario: admin sí, cualquier otro rol no.
//
// El botón "Usuarios" del sidebar ya se oculta para quien no es admin
// (ver app.js), pero eso es solo comodidad visual: estas funciones
// están colgadas de window y podrían invocarse igual desde la consola
// del navegador. Por eso cada acción vuelve a comprobar el permiso
// aquí antes de ejecutarse, y el backend lo comprueba una tercera vez
// (requerirAdmin_ en Codigo_corregido.gs) sin confiar en el frontend.
// ------------------------------------------------------------
function tienePermisoUsuarios() {
    return window.AUTH.getRol() === 'admin';
}

function bloquearSinPermisoUsuarios() {
    window.toast?.('⛔ No tienes permiso para gestionar usuarios', 'error');
}

// ------------------------------------------------------------
// Matriz de permisos de acceso (checkboxes) — ver permisos-config.js
// para el catálogo de módulos/acciones. Solo se muestra y se envía
// cuando el rol seleccionado es "usuario"; un "admin" siempre tiene
// acceso total y no se restringe con esta matriz.
// ------------------------------------------------------------

function contarPermisosActivos(permisos) {
    if (!permisos || typeof permisos !== 'object') return 0;
    let n = 0;
    Object.values(permisos).forEach(acciones => {
        Object.values(acciones || {}).forEach(v => { if (v === true) n++; });
    });
    return n;
}

function renderMatrizPermisos(permisosActuales) {
    const tabla = document.getElementById('usuarioFormPermisosTabla');
    if (!tabla) return;

    const permisos = window.normalizarPermisosFrontend(permisosActuales);
    const columnas = Object.keys(window.ACCIONES_PERMISO);

    let thead = '<thead><tr><th>Módulo</th>';
    columnas.forEach(accion => {
        thead += `<th title="Marcar/desmarcar toda la columna \u201c${window.esc(window.ACCIONES_PERMISO[accion])}\u201d">
            <label class="permisos-col-toggle">
                <input type="checkbox" onclick="window.alternarColumnaPermisos('${accion}', this.checked)">
                ${window.esc(window.ACCIONES_PERMISO[accion])}
            </label>
        </th>`;
    });
    thead += '</tr></thead>';

    let tbody = '<tbody>';
    window.MODULOS_PERMISOS.forEach(modulo => {
        tbody += `<tr data-modulo-row="${modulo.key}">
            <td class="permisos-modulo-nombre">
                <label class="permisos-col-toggle">
                    <input type="checkbox" onclick="window.alternarFilaPermisos('${modulo.key}', this.checked)">
                    <i class="fas ${modulo.icono}"></i> ${window.esc(modulo.label)}
                </label>
            </td>`;
        columnas.forEach(accion => {
            if (modulo.acciones.includes(accion)) {
                const marcado = permisos[modulo.key][accion] ? 'checked' : '';
                tbody += `<td><input type="checkbox" data-permiso-modulo="${modulo.key}" data-permiso-accion="${accion}" ${marcado}></td>`;
            } else {
                tbody += '<td class="permisos-na" title="No aplica para este módulo">—</td>';
            }
        });
        tbody += '</tr>';
    });
    tbody += '</tbody>';

    tabla.innerHTML = thead + tbody;
}

window.alternarFilaPermisos = function(moduloKey, marcado) {
    document.querySelectorAll(`input[data-permiso-modulo="${moduloKey}"]`).forEach(cb => { cb.checked = marcado; });
};

window.alternarColumnaPermisos = function(accion, marcado) {
    document.querySelectorAll(`input[data-permiso-accion="${accion}"]`).forEach(cb => { cb.checked = marcado; });
};

function leerMatrizPermisos() {
    const permisos = window.permisosVacios();
    document.querySelectorAll('#usuarioFormPermisosTabla input[data-permiso-modulo]').forEach(cb => {
        const modulo = cb.dataset.permisoModulo;
        const accion = cb.dataset.permisoAccion;
        if (permisos[modulo]) permisos[modulo][accion] = cb.checked;
    });
    return permisos;
}

// Muestra la matriz de permisos solo cuando el rol elegido es
// "usuario"; con "admin" se oculta y se explica por qué (acceso
// total automático, sin checkboxes que configurar).
window.actualizarVisibilidadPermisosUsuario = function() {
    const rol = document.getElementById('usuarioFormRol')?.value;
    const wrapPermisos = document.getElementById('usuarioFormPermisosWrap');
    const notaAdmin = document.getElementById('usuarioFormPermisosAdminNota');
    const esAdmin = rol === 'admin';
    if (wrapPermisos) wrapPermisos.style.display = esAdmin ? 'none' : '';
    if (notaAdmin) notaAdmin.style.display = esAdmin ? '' : 'none';
};

window.abrirModalUsuarios = async function() {
    // Reintento del permiso: no basta con que el botón del sidebar
    // esté oculto para quien no es admin (ver comentario arriba).
    if (!tienePermisoUsuarios()) { bloquearSinPermisoUsuarios(); return; }

    const modal = document.getElementById('modalUsuarios');
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    mostrarVistaListaUsuarios();
    await window.cargarUsuarios();
};

window.cerrarModalUsuarios = function() {
    const modal = document.getElementById('modalUsuarios');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
};

window.cargarUsuarios = async function() {
    if (!tienePermisoUsuarios()) { bloquearSinPermisoUsuarios(); return; }

    const btnNuevo = document.getElementById('btnNuevoUsuario');
    if (btnNuevo) btnNuevo.disabled = false; // sesión admin confirmada: el botón puede quedar habilitado

    const tbody = document.getElementById('usuariosTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">Cargando...</td></tr>';

    const result = await window.AUTH.request(window.API_URL + '?action=listUsuarios');

    if (!result.success) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">${window.esc(result.message || 'No se pudo cargar la lista de usuarios.')}</td></tr>`;
        return;
    }

    usuariosCache = result.data || [];
    renderTablaUsuarios();
};

window.usuariosFiltrar = function() {
    renderTablaUsuarios();
};

function renderTablaUsuarios() {
    const tbody = document.getElementById('usuariosTbody');
    if (!tbody) return;

    const q = (document.getElementById('usuariosFiltroBuscar')?.value || '').toLowerCase().trim();
    const lista = usuariosCache.filter(u =>
        !q || u.usuario.toLowerCase().includes(q) || (u.nombre || '').toLowerCase().includes(q)
    );

    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">Sin usuarios que coincidan.</td></tr>';
        return;
    }

    const miUsuario = (window.AUTH.getUsuario() || '').toLowerCase();
    // Botones de fila (Editar / Activar-Desactivar): si por algún motivo
    // esta tabla se pintara para una sesión sin permiso, quedan
    // deshabilitados y no solo ocultos (ver tienePermisoUsuarios arriba).
    const permitido = tienePermisoUsuarios();
    const disabledAttr = permitido ? '' : 'disabled';

    tbody.innerHTML = lista.map(u => `
        <tr>
            <td>${window.esc(u.usuario)}${u.usuario.toLowerCase() === miUsuario ? ' <span class="text-muted" style="font-size:11px;">(tú)</span>' : ''}</td>
            <td>${window.esc(u.nombre || '')}</td>
            <td>${u.rol === 'admin'
                ? '<span class="badge-mini">Administrador</span><br><span class="text-muted" style="font-size:11px;">Acceso total</span>'
                : `Usuario<br><span class="text-muted" style="font-size:11px;">${contarPermisosActivos(u.permisos)} permiso(s) activo(s)</span>`}</td>
            <td>${u.activo ? '<span style="color:#16A34A;font-weight:600;">Activo</span>' : '<span style="color:#94A3B8;">Inactivo</span>'}</td>
            <td>${window.esc(formatearFechaUsuario(u.ultimoAcceso))}</td>
            <td style="white-space:nowrap;">
                <button type="button" class="action-btn" title="Editar" ${disabledAttr} onclick="window.abrirFormUsuario('${window.esc(u.usuario)}')">✏️</button>
                <button type="button" class="action-btn" title="${u.activo ? 'Desactivar' : 'Activar'}" ${disabledAttr} onclick="window.alternarEstadoUsuario('${window.esc(u.usuario)}', ${u.activo})">${u.activo ? '🚫' : '♻️'}</button>
            </td>
        </tr>
    `).join('');
}

function formatearFechaUsuario(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function mostrarVistaListaUsuarios() {
    document.getElementById('usuariosListaWrap').style.display = '';
    document.getElementById('usuariosFormWrap').style.display = 'none';
    document.getElementById('usuariosFooterLista').style.display = '';
    document.getElementById('usuariosFooterForm').style.display = 'none';
}

// Cambia solo el texto de la etiqueta "Contraseña" / "Nueva
// contraseña...", dejando intacto el <span class="required"> del
// asterisco (usar labelPassword.textContent lo borraría por completo).
function setTextoLabelPassword(texto) {
    const label = document.getElementById('usuarioFormPasswordLabel');
    if (!label) return;
    const nodoTexto = Array.from(label.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
    if (nodoTexto) {
        nodoTexto.textContent = texto + ' ';
    } else {
        label.insertBefore(document.createTextNode(texto + ' '), label.firstChild);
    }
}

function mostrarVistaFormUsuario() {
    document.getElementById('usuariosListaWrap').style.display = 'none';
    document.getElementById('usuariosFormWrap').style.display = '';
    document.getElementById('usuariosFooterLista').style.display = 'none';
    document.getElementById('usuariosFooterForm').style.display = '';
}

window.abrirFormUsuario = function(usuario) {
    if (!tienePermisoUsuarios()) { bloquearSinPermisoUsuarios(); return; }

    usuarioEnEdicion = usuario || null;

    const errorEl = document.getElementById('usuarioFormError');
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
    camposRequeridosUsuario().forEach(id => document.getElementById(id)?.classList.remove('input-error'));
    document.getElementById('usuarioFormPassword')?.classList.remove('input-error');

    const campoTitulo = document.getElementById('usuarioFormTitulo');
    const campoUsuario = document.getElementById('usuarioFormUsuario');
    const campoNombre = document.getElementById('usuarioFormNombre');
    const campoRol = document.getElementById('usuarioFormRol');
    const campoActivo = document.getElementById('usuarioFormActivo');
    const campoPassword = document.getElementById('usuarioFormPassword');
    const labelPassword = document.getElementById('usuarioFormPasswordLabel');

    if (usuarioEnEdicion) {
        const u = usuariosCache.find(x => x.usuario === usuarioEnEdicion);
        if (campoTitulo) campoTitulo.textContent = 'Editar usuario';
        campoUsuario.value = u ? u.usuario : usuarioEnEdicion;
        campoUsuario.disabled = true; // el nombre de acceso no se cambia una vez creada la cuenta
        campoNombre.value = u ? u.nombre : '';
        campoRol.value = u ? u.rol : 'usuario';
        campoActivo.checked = u ? !!u.activo : true;
        campoPassword.value = '';
        // Se cambia solo el texto (no con .textContent, que borraría el
        // <span> del asterisco): al editar, la contraseña es opcional,
        // así que el asterisco de obligatorio se oculta aquí.
        setTextoLabelPassword('Nueva contraseña (déjalo vacío para no cambiarla)');
        document.getElementById('usuarioFormPasswordAsterisco')?.style.setProperty('display', 'none');
        renderMatrizPermisos(u ? u.permisos : null);
    } else {
        if (campoTitulo) campoTitulo.textContent = 'Nuevo usuario';
        campoUsuario.value = '';
        campoUsuario.disabled = false;
        campoNombre.value = '';
        campoRol.value = 'usuario';
        campoActivo.checked = true;
        campoPassword.value = '';
        setTextoLabelPassword('Contraseña');
        document.getElementById('usuarioFormPasswordAsterisco')?.style.removeProperty('display');
        renderMatrizPermisos(null);
    }

    window.actualizarVisibilidadPermisosUsuario();
    mostrarVistaFormUsuario();
    setTimeout(() => (usuarioEnEdicion ? campoNombre : campoUsuario).focus(), 50);
};

window.cancelarFormUsuario = function() {
    mostrarVistaListaUsuarios();
};

window.alternarEstadoUsuario = async function(usuario, activoActual) {
    if (!tienePermisoUsuarios()) { bloquearSinPermisoUsuarios(); return; }

    const accion = activoActual ? 'desactivar' : 'activar';
    if (!confirm(`¿Seguro que deseas ${accion} al usuario "${usuario}"?`)) return;

    const url = window.API_URL + '?action=actualizarUsuario'
        + '&key=' + encodeURIComponent(window.API_KEY)
        + '&usuario=' + encodeURIComponent(usuario)
        + '&activo=' + (!activoActual);

    const result = await window.AUTH.request(url);

    if (!result.success) {
        window.toast?.('❌ ' + (result.message || 'No se pudo actualizar el usuario.'), 'error');
        return;
    }

    window.toast?.(`✅ Usuario ${activoActual ? 'desactivado' : 'activado'}`, 'success');
    window.cargarUsuarios();
};

// Campos obligatorios del formulario de usuario. La contraseña solo
// es obligatoria al crear una cuenta nueva (al editar, vacío = "no
// cambiarla"), así que se agrega/quita de la lista según el modo.
function camposRequeridosUsuario() {
    const base = ['usuarioFormUsuario', 'usuarioFormNombre', 'usuarioFormRol'];
    if (!usuarioEnEdicion) base.push('usuarioFormPassword');
    return base;
}

// Marca en rojo los campos obligatorios vacíos sin cerrar el
// formulario ni perder lo ya escrito (mismo patrón que
// window.validarRequeridos en personal/modal.js).
function validarFormUsuario() {
    const requeridos = camposRequeridosUsuario();
    let primerCampo = null;
    let huboVacio = false;

    requeridos.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('input-error');
        const valor = (el.value || '').trim();
        if (valor === '') {
            el.classList.add('input-error');
            huboVacio = true;
            if (!primerCampo) primerCampo = el;
        }
    });

    if (huboVacio) {
        const errorEl = document.getElementById('usuarioFormError');
        if (errorEl) { errorEl.textContent = '⚠️ Complete los campos obligatorios marcados con (*).'; errorEl.style.display = ''; }
        primerCampo?.focus();
        return false;
    }
    return true;
}

window.guardarUsuario = async function() {
    if (!tienePermisoUsuarios()) { bloquearSinPermisoUsuarios(); return; }

    const btn = document.getElementById('btnGuardarUsuario');
    const errorEl = document.getElementById('usuarioFormError');
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

    const usuario = document.getElementById('usuarioFormUsuario').value.trim();
    const nombre = document.getElementById('usuarioFormNombre').value.trim();
    const rol = document.getElementById('usuarioFormRol').value;
    const activo = document.getElementById('usuarioFormActivo').checked;
    const password = document.getElementById('usuarioFormPassword').value;

    if (!validarFormUsuario()) return;

    if (!usuarioEnEdicion && password.length < 6) {
        if (errorEl) { errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres'; errorEl.style.display = ''; }
        document.getElementById('usuarioFormPassword')?.classList.add('input-error');
        return;
    }
    if (password && password.length < 6) {
        if (errorEl) { errorEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; errorEl.style.display = ''; }
        document.getElementById('usuarioFormPassword')?.classList.add('input-error');
        return;
    }

    // Un "admin" siempre tiene acceso total: se guarda un objeto de
    // permisos vacío (el backend lo ignora igualmente para ese rol,
    // ver tienePermisoAccion_ en Codigo_corregido.gs) para no dejar
    // "pegados" permisos de una edición anterior si más adelante ese
    // usuario cambia de admin a usuario normal.
    const permisos = (rol === 'admin') ? window.permisosVacios() : leerMatrizPermisos();
    const permisosJSON = JSON.stringify(permisos);

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

    let url;
    if (usuarioEnEdicion) {
        url = window.API_URL + '?action=actualizarUsuario'
            + '&key=' + encodeURIComponent(window.API_KEY)
            + '&usuario=' + encodeURIComponent(usuarioEnEdicion)
            + '&nombre=' + encodeURIComponent(nombre)
            + '&rol=' + encodeURIComponent(rol)
            + '&activo=' + activo
            + '&permisos=' + encodeURIComponent(permisosJSON)
            + (password ? '&passwordNueva=' + encodeURIComponent(password) : '');
    } else {
        url = window.API_URL + '?action=crearUsuario'
            + '&key=' + encodeURIComponent(window.API_KEY)
            + '&usuario=' + encodeURIComponent(usuario)
            + '&nombre=' + encodeURIComponent(nombre)
            + '&rol=' + encodeURIComponent(rol)
            + '&activo=' + activo
            + '&permisos=' + encodeURIComponent(permisosJSON)
            + '&password=' + encodeURIComponent(password);
    }

    const result = await window.AUTH.request(url);

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar'; }

    if (!result.success) {
        if (errorEl) { errorEl.textContent = result.message || 'No se pudo guardar el usuario.'; errorEl.style.display = ''; }
        return;
    }

    window.toast?.(usuarioEnEdicion ? '✅ Usuario actualizado' : '✅ Usuario creado', 'success');
    mostrarVistaListaUsuarios();
    window.cargarUsuarios();
};

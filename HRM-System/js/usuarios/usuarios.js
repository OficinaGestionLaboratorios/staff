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

window.abrirModalUsuarios = async function() {
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

    tbody.innerHTML = lista.map(u => `
        <tr>
            <td>${window.esc(u.usuario)}${u.usuario.toLowerCase() === miUsuario ? ' <span class="text-muted" style="font-size:11px;">(tú)</span>' : ''}</td>
            <td>${window.esc(u.nombre || '')}</td>
            <td>${u.rol === 'admin' ? '<span class="badge-mini">Administrador</span>' : 'Usuario'}</td>
            <td>${u.activo ? '<span style="color:#16A34A;font-weight:600;">Activo</span>' : '<span style="color:#94A3B8;">Inactivo</span>'}</td>
            <td>${window.esc(formatearFechaUsuario(u.ultimoAcceso))}</td>
            <td style="white-space:nowrap;">
                <button type="button" class="action-btn" title="Editar" onclick="window.abrirFormUsuario('${window.esc(u.usuario)}')">✏️</button>
                <button type="button" class="action-btn" title="${u.activo ? 'Desactivar' : 'Activar'}" onclick="window.alternarEstadoUsuario('${window.esc(u.usuario)}', ${u.activo})">${u.activo ? '🚫' : '♻️'}</button>
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

function mostrarVistaFormUsuario() {
    document.getElementById('usuariosListaWrap').style.display = 'none';
    document.getElementById('usuariosFormWrap').style.display = '';
    document.getElementById('usuariosFooterLista').style.display = 'none';
    document.getElementById('usuariosFooterForm').style.display = '';
}

window.abrirFormUsuario = function(usuario) {
    usuarioEnEdicion = usuario || null;

    const errorEl = document.getElementById('usuarioFormError');
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

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
        labelPassword.textContent = 'Nueva contraseña (déjalo vacío para no cambiarla)';
    } else {
        if (campoTitulo) campoTitulo.textContent = 'Nuevo usuario';
        campoUsuario.value = '';
        campoUsuario.disabled = false;
        campoNombre.value = '';
        campoRol.value = 'usuario';
        campoActivo.checked = true;
        campoPassword.value = '';
        labelPassword.textContent = 'Contraseña';
    }

    mostrarVistaFormUsuario();
    setTimeout(() => (usuarioEnEdicion ? campoNombre : campoUsuario).focus(), 50);
};

window.cancelarFormUsuario = function() {
    mostrarVistaListaUsuarios();
};

window.alternarEstadoUsuario = async function(usuario, activoActual) {
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

window.guardarUsuario = async function() {
    const btn = document.getElementById('btnGuardarUsuario');
    const errorEl = document.getElementById('usuarioFormError');
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

    const usuario = document.getElementById('usuarioFormUsuario').value.trim();
    const nombre = document.getElementById('usuarioFormNombre').value.trim();
    const rol = document.getElementById('usuarioFormRol').value;
    const activo = document.getElementById('usuarioFormActivo').checked;
    const password = document.getElementById('usuarioFormPassword').value;

    if (!usuario || !nombre) {
        if (errorEl) { errorEl.textContent = 'Usuario y nombre son requeridos'; errorEl.style.display = ''; }
        return;
    }
    if (!usuarioEnEdicion && password.length < 6) {
        if (errorEl) { errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres'; errorEl.style.display = ''; }
        return;
    }
    if (password && password.length < 6) {
        if (errorEl) { errorEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; errorEl.style.display = ''; }
        return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

    let url;
    if (usuarioEnEdicion) {
        url = window.API_URL + '?action=actualizarUsuario'
            + '&key=' + encodeURIComponent(window.API_KEY)
            + '&usuario=' + encodeURIComponent(usuarioEnEdicion)
            + '&nombre=' + encodeURIComponent(nombre)
            + '&rol=' + encodeURIComponent(rol)
            + '&activo=' + activo
            + (password ? '&passwordNueva=' + encodeURIComponent(password) : '');
    } else {
        url = window.API_URL + '?action=crearUsuario'
            + '&key=' + encodeURIComponent(window.API_KEY)
            + '&usuario=' + encodeURIComponent(usuario)
            + '&nombre=' + encodeURIComponent(nombre)
            + '&rol=' + encodeURIComponent(rol)
            + '&activo=' + activo
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

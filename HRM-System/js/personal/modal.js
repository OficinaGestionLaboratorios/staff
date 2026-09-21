// ============================================================
// PERSONAL - CRUD, MODALES Y FORMULARIO
// ============================================================

// ===== ACTIVAR / INACTIVAR =====
// Reemplaza al antiguo "Eliminar": la persona nunca se borra de la
// base de datos, solo se marca como Inactiva (campo ESTADO) y por
// eso deja de aparecer en el listado y en los selectores de los
// demás módulos (Horarios, Sobretiempo, Licencias, Permisos), salvo
// que se active el checkbox "Mostrar inactivos". Reactivar hace
// exactamente lo contrario.
window.toggleEstadoPersonal = async function(data) {
    const activo = window.esPersonalActivo(data);
    const nombre = `${data.NOMBRES || ''} ${data.APE_PATERNO || ''}`.trim();
    const confirmacion = activo
        ? `¿Marcar a "${nombre}" como inactivo?\n\nSus datos NO se borran: solo dejará de aparecer en el listado y en los demás módulos. Podrás reactivarlo cuando quieras.`
        : `¿Reactivar a "${nombre}"?\n\nVolverá a aparecer en el listado y podrá seleccionarse en los demás módulos.`;
    if (!confirm(confirmacion)) return;

    const nuevoEstado = activo ? 'Inactivo' : 'Activo';
    const row = document.querySelector(`tr button[data-code="${CSS.escape(data.CODE)}"]`)?.closest('tr');
    if (row) { row.style.opacity = '0.5'; row.style.transition = 'opacity 0.3s'; }

    window.toast(activo ? 'Marcando como inactivo...' : 'Reactivando...', 'info');

    try {
        const result = await window.API.save({ ...data, ESTADO: nuevoEstado }, true, data.CODE);
        if (result.success) {
            const datos = window.API.getDatos();
            const item = datos.find(i => i.CODE === data.CODE);
            if (item) item.ESTADO = nuevoEstado;
            window.API.setDatos(datos);
            window.buscarPersonal();
            window.actualizarContadoresGenerales();
            if (window.Router.getVistaActual() === 'dashboard') window.actualizarDashboard();

            // Si el modal de detalle está abierto mostrando este mismo
            // registro, refresca su badge de estado sin cerrarlo.
            if (window.currentDetail && window.currentDetail.CODE === data.CODE) {
                window.currentDetail.ESTADO = nuevoEstado;
                const badge = document.getElementById('profileEstadoBadge');
                const toggleBtn = document.getElementById('profileToggleEstadoBtn');
                const eliminarBtn = document.getElementById('profileEliminarDefinitivoBtn');
                const activoAhora = window.esPersonalActivo(window.currentDetail);
                if (badge) {
                    badge.textContent = activoAhora ? 'Activo' : 'Inactivo';
                    badge.className = 'badge-estado ' + (activoAhora ? 'badge-estado-activo' : 'badge-estado-inactivo');
                }
                if (toggleBtn) {
                    toggleBtn.title = activoAhora ? 'Marcar como inactivo' : 'Reactivar';
                    toggleBtn.innerHTML = `<i class="fas ${activoAhora ? 'fa-user-slash' : 'fa-user-check'}"></i>`;
                }
                if (eliminarBtn) eliminarBtn.style.display = activoAhora ? 'none' : '';
            }

            window.toast(activo ? '✅ Marcado como inactivo' : '✅ Reactivado', 'success');
        } else {
            window.toast('❌ ' + (result.message || 'Error'), 'error');
            if (row) row.style.opacity = '1';
        }
    } catch (e) {
        window.toast('❌ ' + e.message, 'error');
        if (row) row.style.opacity = '1';
    }
};

// ===== INICIALES DE AVATAR (fallback cuando no hay foto) =====
window.generarIniciales = function(nombres, apePaterno) {
    const n = String(nombres || '').trim().charAt(0);
    const a = String(apePaterno || '').trim().charAt(0);
    const iniciales = (n + a).toUpperCase();
    return iniciales || '?';
};

// Paleta de colores estable según las iniciales, para que cada persona
// tenga siempre el mismo color de fondo
window.colorPorIniciales = function(texto) {
    const colores = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#EF4444', '#6366F1'];
    let hash = 0;
    for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
    return colores[Math.abs(hash) % colores.length];
};

window.mostrarInicialesAvatar = function(imgEl) {
    const data = window.currentDetail || {};
    const iniciales = window.generarIniciales(data.NOMBRES, data.APE_PATERNO);
    const color = window.colorPorIniciales(iniciales);
    imgEl.parentElement.innerHTML = `<div class="avatar-iniciales" style="background:${color};">${window.esc(iniciales)}</div>`;
    imgEl.parentElement.style.background = 'transparent';
};

// ===== DETALLE =====
window.verDetalle = function(data) {
    window.currentDetail = data;
    const container = document.getElementById('detalleContent');
    const chipsContainer = document.getElementById('detalleChips');
    const fullName = `${data.NOMBRES || ''} ${data.APE_PATERNO || ''} ${data.APE_MATERNO || ''}`.trim() || 'Sin nombre';

    document.getElementById('profileFullName').textContent = fullName;
    document.getElementById('profileId').textContent = data.ID_PERSONAL || '---';

    const idBadgeEstado = document.getElementById('profileEstadoBadge');
    const toggleBtn = document.getElementById('profileToggleEstadoBtn');
    const eliminarBtn = document.getElementById('profileEliminarDefinitivoBtn');
    if (idBadgeEstado) {
        const activo = window.esPersonalActivo(data);
        idBadgeEstado.textContent = activo ? 'Activo' : 'Inactivo';
        idBadgeEstado.className = 'badge-estado ' + (activo ? 'badge-estado-activo' : 'badge-estado-inactivo');
        if (toggleBtn) {
            toggleBtn.title = activo ? 'Marcar como inactivo' : 'Reactivar';
            toggleBtn.innerHTML = `<i class="fas ${activo ? 'fa-user-slash' : 'fa-user-check'}"></i>`;
        }
        if (eliminarBtn) eliminarBtn.style.display = activo ? 'none' : '';
    }

    const avatarContainer = document.getElementById('profileAvatar');
    const idPersonal = data.ID_PERSONAL || '';
    const iniciales = window.generarIniciales(data.NOMBRES, data.APE_PATERNO);
    const colorIniciales = window.colorPorIniciales(iniciales);

    if (idPersonal) {
        const fotoURL = `img/fotos/${idPersonal}.jpg`;
        avatarContainer.innerHTML = `<img src="${fotoURL}" alt="${window.esc(fullName)}" onerror="window.mostrarInicialesAvatar(this)">`;
    } else {
        avatarContainer.style.background = 'transparent';
        avatarContainer.innerHTML = `<div class="avatar-iniciales" style="background:${colorIniciales};">${window.esc(iniciales)}</div>`;
    }

    const camposPrincipales = [
        { key: 'ID_PERSONAL', label: 'ID Personal', icon: 'fa-id-badge' },
        { key: 'DNI', label: 'DNI', icon: 'fa-id-card' },
        { key: 'FEC_NACIMIENTO', label: 'Fecha de Nac.', icon: 'fa-calendar-alt', formatter: window.formatearFecha },
        { key: 'SEXO', label: 'Sexo', icon: 'fa-venus-mars' },
        { key: 'TELEFONO', label: 'Teléfono', icon: 'fa-phone' },
        { key: 'DIRECCION', label: 'Dirección', icon: 'fa-home' },
        { key: 'EMAIL_INSTITUCIONAL', label: 'Email Institucional', icon: 'fa-envelope' },
        { key: 'PROFESION', label: 'Profesión', icon: 'fa-graduation-cap' },
        { key: 'PROGRAMA', label: 'Programa', icon: 'fa-book-open' },
        { key: 'CARGO', label: 'Cargo', icon: 'fa-user-tie' },
        { key: 'LUGAR_TRABAJO', label: 'Lugar de Trabajo', icon: 'fa-building' },
        { key: 'TIPO_LABORATORIO', label: 'Tipo de Laboratorio', icon: 'fa-flask' },
    ];

    container.innerHTML = camposPrincipales.map(campo => {
        let valor = data[campo.key] || '';
        if (campo.formatter) valor = campo.formatter(valor);
        if (!valor) return '';
        const valorEsc = window.esc(valor);
        return `<div class="info-item"><div class="info-icon"><i class="fas ${campo.icon}"></i></div><div class="info-text"><div class="info-label">${campo.label}</div><div class="info-value" title="${valorEsc}">${valorEsc}</div></div></div>`;
    }).filter(html => html).join('');

    if (!container.innerHTML.trim()) {
        container.innerHTML = `<div class="info-item" style="grid-column:1/-1;justify-content:center;background:transparent;border:none;"><div class="info-value" style="color:#94A3B8;">No hay información adicional disponible</div></div>`;
    }

    const chipsData = [
        { label: 'Tipo Contrato', value: data.TIPO_CONTRATO, icon: 'fa-file-contract' },
        { label: 'Fecha Vinculación', value: window.formatearFecha(data.FECHA_VINCULACION), icon: 'fa-calendar-plus' },
        { label: 'Inicio Período', value: window.formatearFecha(data.INICIO_PERIODO), icon: 'fa-calendar-day' },
        { label: 'Cese Período', value: window.formatearFecha(data.CESE_PERIODO), icon: 'fa-calendar-times' },
        { label: 'Cant. Períodos', value: data.CANT_PERIODO, icon: 'fa-hashtag' },
    ];

    chipsContainer.innerHTML = chipsData.filter(chip => chip.value).map(chip =>
        `<span class="detail-chip"><i class="fas ${chip.icon}"></i><span class="chip-label">${chip.label}:</span><span class="chip-value">${window.esc(chip.value)}</span></span>`
    ).join('') || '<span class="detail-chip" style="color:#94A3B8;">Sin información laboral adicional</span>';

    const modal = document.getElementById('modalDetalle');
    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
};

// ===== ELIMINAR DEFINITIVAMENTE =====
// Borrado real e irreversible en la base de datos. A propósito solo
// está disponible para registros que YA están Inactivos (no se puede
// saltar el paso de inactivar), y pide escribir el nombre exacto
// como confirmación reforzada, porque a diferencia de "Marcar como
// inactivo" esto no se puede deshacer.
window.eliminarDefinitivo = async function(data) {
    const nombre = `${data.NOMBRES || ''} ${data.APE_PATERNO || ''}`.trim();

    if (window.esPersonalActivo(data)) {
        window.toast('⚠️ Primero debe estar marcado como inactivo', 'error');
        return;
    }

    const escrito = prompt(
        `Esta acción borra PERMANENTEMENTE a "${nombre}" de la base de datos. No se puede deshacer.\n\n` +
        `Para confirmar, escribe exactamente su nombre completo:\n${nombre}`
    );
    if (escrito === null) return;
    if (escrito.trim().toUpperCase() !== nombre.toUpperCase()) {
        window.toast('❌ El nombre no coincide. No se eliminó nada.', 'error');
        return;
    }

    const row = document.querySelector(`tr button[data-code="${CSS.escape(data.CODE)}"]`)?.closest('tr');
    if (row) { row.style.opacity = '0.5'; row.style.transition = 'opacity 0.3s'; }

    window.toast('Eliminando definitivamente...', 'info');

    try {
        const result = await window.API.delete(data.CODE);
        if (result.success) {
            const datos = window.API.getDatos();
            const index = datos.findIndex(item => item.CODE === data.CODE);
            if (index !== -1) datos.splice(index, 1);
            window.API.setDatos(datos);
            window.buscarPersonal();
            window.actualizarContadoresGenerales();
            if (window.Router.getVistaActual() === 'dashboard') window.actualizarDashboard();
            if (window.currentDetail && window.currentDetail.CODE === data.CODE) window.cerrarDetalle?.();
            window.toast('✅ Registro eliminado definitivamente', 'success');
        } else {
            window.toast('❌ ' + (result.message || 'Error'), 'error');
            if (row) row.style.opacity = '1';
        }
    } catch (e) {
        window.toast('❌ ' + e.message, 'error');
        if (row) row.style.opacity = '1';
    }
};


window.editarRegistro = function(data) {
    sessionStorage.setItem('editData', JSON.stringify(data));
    sessionStorage.setItem('editMode', 'true');
    window.Router.cambiarVista('registro');
};

// ===== FORMULARIO DE REGISTRO =====
window.renderRegistro = async function() {
    const isEdit = sessionStorage.getItem('editMode') === 'true';
    const editData = isEdit ? JSON.parse(sessionStorage.getItem('editData') || '{}') : null;

    // Restaurar ubicaciones seleccionadas. Las ubicaciones ahora se
    // cargan de data/ubicaciones.json bajo demanda (ver personal.js),
    // así que si estamos editando un registro que ya tiene
    // LUGAR_TRABAJO, hay que asegurarnos de tenerlas cargadas antes
    // de intentar hacer el match.
    if (isEdit && editData && editData.LUGAR_TRABAJO) {
        await window.cargarUbicaciones();
        const valores = editData.LUGAR_TRABAJO.split(',').map(s => s.trim()).filter(s => s);
        window.ubicacionesSeleccionadas = window.ubicacionesLaboratorio.filter(u => 
            valores.some(v => v.includes(u.ubicacion) || v.includes(u.nombre))
        );
    } else {
        window.ubicacionesSeleccionadas = [];
    }

    const main = document.getElementById('mainContent');
    main.innerHTML = `
        <div class="topbar">
            <h1><i class="fas fa-${isEdit ? 'user-edit' : 'user-plus'}"></i> ${isEdit ? 'Editar' : 'Registro de'} Personal</h1>
            <div class="topbar-actions">
                <button class="btn btn-secondary" onclick="window.Router.cambiarVista('listado')"><i class="fas fa-arrow-left"></i> Volver</button>
            </div>
        </div>
        <div class="form-container">
            <div class="subtitle">${isEdit ? 'Modificando datos existentes' : 'Ingreso de datos para Google Sheets'}</div>
            <form onsubmit="return false;">
                <div class="form-grid">
                    <div class="section-title">📋 Identificación</div>
                    <div class="form-group"><label>CODE</label><input type="text" id="CODE" readonly style="background:#f1f5f9;"></div>
                    <div class="form-group"><label>ID_PERSONAL <span class="required">*</span></label><input type="text" id="ID_PERSONAL" placeholder="ID Personal"></div>
                    <div class="form-group"><label>APE_PATERNO <span class="required">*</span></label><input type="text" id="APE_PATERNO" placeholder="Apellido Paterno"></div>
                    <div class="form-group"><label>APE_MATERNO</label><input type="text" id="APE_MATERNO" placeholder="Apellido Materno"></div>
                    <div class="form-group"><label>NOMBRES <span class="required">*</span></label><input type="text" id="NOMBRES" placeholder="Nombres"></div>
                    <div class="form-group"><label>DNI <span class="required">*</span></label><input type="text" id="DNI" maxlength="8" placeholder="DNI"></div>
                    <div class="section-title">👤 Personales</div>
                    <div class="form-group"><label>FEC_NACIMIENTO</label><input type="date" id="FEC_NACIMIENTO"></div>
                    <div class="form-group"><label>SEXO</label><select id="SEXO"><option value="">Seleccionar</option><option>Masculino</option><option>Femenino</option></select></div>
                    <div class="form-group"><label>TELEFONO</label><input type="text" id="TELEFONO" placeholder="Teléfono"></div>
                    <div class="form-group"><label>DIRECCION</label><input type="text" id="DIRECCION" placeholder="Dirección"></div>
                    <div class="section-title">🎓 Académica</div>
                    <div class="form-group"><label>PROFESION</label><input type="text" id="PROFESION" placeholder="Profesión"></div>
                    <div class="section-title">💼 Laboral</div>
                    <div class="form-group"><label>PROGRAMA</label>
                        <select id="PROGRAMA">
                            <option value="">Seleccione un programa</option>
                            <option value="ADMI">ADMINISTRACIÓN</option>
                            <option value="ADMA">ADMINISTRACION Y MARKETING</option>
                            <option value="ARQU">ARQUITECTURA</option>
                            <option value="CCOM">CIENCIAS DE LA COMUNICACIÓN</option>
                            <option value="COMD">COMUNIC Y MEDIOS DIGITALES</option>
                            <option value="CONT">CONTABILIDAD</option>
                            <option value="COFI">CONTABILIDAD Y FINANZAS</option>
                            <option value="DERE">DERECHO</option>
                            <option value="ECFI">ECONOMÍA Y FINANZAS</option>
                            <option value="EMNI">ECONOMÍA Y NEGOCIOS INTERNAC.</option>
                            <option value="EDUC">EDUCACIÓN INICIAL</option>
                            <option value="ENFE">ENFERMERÍA</option>
                            <option value="ESTO">ESTOMATOLOGÍA</option>
                            <option value="IAAE">ING AGRONOMA Y AGROEXPORTAC</option>
                            <option value="ICSI">ING. COMPUTACIÓN Y SIST.</option>
                            <option value="IEME">ING ELECTRON Y MECATRONICA</option>
                            <option value="ISIA">ING SISTEM E INTELIG ARTIFIC</option>
                            <option value="INAG">INGENIERÍA AGRÓNOMA</option>
                            <option value="INCI">INGENIERÍA CIVIL</option>
                            <option value="ELEC">INGENIERÍA ELECTRÓNICA</option>
                            <option value="IIND">INGENIERÍA INDUSTRIAL</option>
                            <option value="IIAL">ING.INDUSTRIAS ALIMENT.</option>
                            <option value="MEHU">MEDICINA HUMANA</option>
                            <option value="MVZO">MEDIC.VETERINARIA Y ZOOTECNIA</option>
                            <option value="OBST">OBSTETRICIA</option>
                            <option value="PSIC">PSICOLOGÍA</option>
                        </select>
                    </div>
                    <div class="form-group"><label>CARGO</label>
                        <select id="CARGO">
                            <option value="">Seleccionar</option>
                            <option>Técnico de laboratorio 1</option>
                            <option>Técnico de laboratorio 2</option>
                        </select>
                    </div>
                    <div class="form-group" style="grid-column:1/-1; margin-bottom:0;">
                        <label>LUGAR_TRABAJO</label>
                        <div style="display:flex; gap:6px; align-items:center; flex-wrap:nowrap;">
                            <input type="text" id="LUGAR_TRABAJO" placeholder="Selecciona ubicaciones..." readonly style="flex:1; cursor:pointer; background:#f8fafc; padding:8px 10px; font-size:13px; min-width:0;" onclick="window.abrirModalUbicaciones()">
                            <button type="button" class="btn btn-secondary" style="padding:6px 12px; font-size:12px; white-space:nowrap;" onclick="window.abrirModalUbicaciones()"><i class="fas fa-building"></i> Elegir</button>
                            <button type="button" class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="window.limpiarUbicacionesSeleccionadas()" title="Limpiar selección"><i class="fas fa-times"></i></button>
                        </div>
                        <div id="etiquetasUbicaciones" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; min-height:18px;"></div>
                        <small style="color:#94A3B8; font-size:11px; margin-top:2px;">Haz clic para seleccionar una o más ubicaciones</small>
                    </div>
                    <div class="form-group"><label>TIPO_CONTRATO</label>
                        <select id="TIPO_CONTRATO">
                            <option value="">Seleccionar</option>
                            <option>Permanente</option>
                            <option>Temporal</option>
                        </select>
                    </div>
                    <div class="form-group"><label>EMAIL_INSTITUCIONAL <span class="required">*</span></label><input type="email" id="EMAIL_INSTITUCIONAL" placeholder="correo@institucion.com"></div>
                    <div class="form-group"><label>TIPO_LABORATORIO</label>
                        <select id="TIPO_LABORATORIO">
                            <option value="">Seleccionar</option>
                            <option>Medicina y Ciencias de la Salud</option>
                            <option>Generales</option>
                        </select>
                    </div>
                    <div class="section-title">📅 Períodos</div>
                    <div class="form-group"><label>FECHA_VINCULACION</label><input type="date" id="FECHA_VINCULACION"></div>
                    <div class="form-group"><label>INICIO_PERIODO</label><input type="date" id="INICIO_PERIODO"></div>
                    <div class="form-group"><label>CESE_PERIODO</label><input type="date" id="CESE_PERIODO"></div>
                    <div class="form-group"><label>CANT_PERIODO</label><input type="number" id="CANT_PERIODO" placeholder="Cantidad de períodos"></div>
                </div>
                <div class="button-group">
                    <button type="button" class="btn btn-primary" onclick="window.guardarRegistro()"><i class="fas fa-save"></i> ${isEdit ? 'Actualizar' : 'Guardar'}</button>
                    <button type="button" class="btn btn-warning" onclick="window.limpiarFormulario()"><i class="fas fa-eraser"></i> Limpiar</button>
                    <button type="button" class="btn btn-secondary" onclick="window.cargarEjemplo()"><i class="fas fa-code"></i> Ejemplo</button>
                    <button type="button" class="btn btn-secondary" onclick="window.Router.cambiarVista('listado')"><i class="fas fa-arrow-left"></i> Volver</button>
                </div>
            </form>
            <div id="loadingReg" class="loading"><div class="spinner"></div><p>Enviando...</p></div>
        </div>
    `;

    // Restaurar ubicaciones seleccionadas
    const etiquetas = document.getElementById('etiquetasUbicaciones');
    const input = document.getElementById('LUGAR_TRABAJO');
    if (window.ubicacionesSeleccionadas.length > 0) {
        const valores = window.ubicacionesSeleccionadas.map(u => `${u.nombre} (${u.ubicacion})`);
        input.value = valores.join(', ');
        etiquetas.innerHTML = window.ubicacionesSeleccionadas.map(u => 
            `<span class="etiqueta-ubicacion">${window.esc(u.nombre)} (${window.esc(u.ubicacion)})<button class="btn-remove" onclick="window.eliminarUbicacionSeleccionada('${u.ubicacion}')">&times;</button></span>`
        ).join('');
    } else {
        input.value = '';
        etiquetas.innerHTML = '';
    }

    // Si es edición, cargar datos
    if (isEdit && editData) {
        window.editMode = true;
        window.editCode = editData.CODE;
        // Se conserva el ESTADO actual del registro (Activo/Inactivo) para
        // reenviarlo junto con el resto de los campos al "Actualizar" (ver
        // obtenerDatosForm), aunque el formulario no tenga un campo visible
        // para editarlo — eso se hace desde la lista o la vista de detalle.
        window.editEstadoActual = editData.ESTADO || 'Activo';
        document.getElementById('CODE').value = editData.CODE || '';
        const fields = ['ID_PERSONAL','APE_PATERNO','APE_MATERNO','NOMBRES','FEC_NACIMIENTO','SEXO','DNI','TELEFONO','DIRECCION','PROFESION','PROGRAMA','CARGO','TIPO_CONTRATO','EMAIL_INSTITUCIONAL','TIPO_LABORATORIO','FECHA_VINCULACION','INICIO_PERIODO','CESE_PERIODO','CANT_PERIODO'];
        fields.forEach(key => {
            const el = document.getElementById(key);
            if (el && editData[key] !== undefined) el.value = editData[key] || '';
        });
        window.toast('📝 Editando', 'info');
    } else {
        window.editMode = false;
        window.editCode = null;
        window.editEstadoActual = null;
    }
};

// ===== VALIDAR REQUERIDOS =====
window.validarRequeridos = function() {
    const requeridos = ['ID_PERSONAL', 'APE_PATERNO', 'NOMBRES', 'DNI', 'EMAIL_INSTITUCIONAL'];
    let camposVacios = [];
    let primerCampo = null;

    requeridos.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('input-error');
        const valor = el.value ? el.value.trim() : '';
        if (valor === '') {
            camposVacios.push(id);
            el.classList.add('input-error');
            if (!primerCampo) primerCampo = el;
        }
    });

    if (camposVacios.length > 0) {
        window.toast(`⚠️ Los siguientes campos son obligatorios:\n• ${camposVacios.join('\n• ')}`, 'error');
        if (primerCampo) {
            primerCampo.focus();
            primerCampo.style.borderColor = '#EF4444';
            setTimeout(() => { primerCampo.style.borderColor = ''; }, 3000);
        }
        return false;
    }

    const dni = document.getElementById('DNI');
    if (dni && dni.value.trim() && !/^\d{8}$/.test(dni.value.trim())) {
        window.toast('⚠️ El DNI debe tener exactamente 8 dígitos', 'error');
        dni.focus();
        dni.style.borderColor = '#EF4444';
        setTimeout(() => { dni.style.borderColor = ''; }, 3000);
        return false;
    }

    const email = document.getElementById('EMAIL_INSTITUCIONAL');
    if (email && email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        window.toast('⚠️ Ingrese un email institucional válido', 'error');
        email.focus();
        email.style.borderColor = '#EF4444';
        setTimeout(() => { email.style.borderColor = ''; }, 3000);
        return false;
    }

    return true;
};

// ===== OBTENER DATOS DEL FORMULARIO =====
window.obtenerDatosForm = function() {
    const campos = ['ID_PERSONAL','APE_PATERNO','APE_MATERNO','NOMBRES','FEC_NACIMIENTO','SEXO','DNI','TELEFONO','DIRECCION','PROFESION','PROGRAMA','CARGO','LUGAR_TRABAJO','TIPO_CONTRATO','EMAIL_INSTITUCIONAL','TIPO_LABORATORIO','FECHA_VINCULACION','INICIO_PERIODO','CESE_PERIODO','CANT_PERIODO'];
    const data = {};
    campos.forEach(c => {
        const el = document.getElementById(c);
        if (el) data[c] = el.value || '';
    });
    if (window.editMode && window.editCode) {
        data.CODE = window.editCode;
        data.ESTADO = window.editEstadoActual || 'Activo';
    }
    return data;
};

// ===== GUARDAR REGISTRO =====
window.guardarRegistro = async function() {
    if (!window.validarRequeridos()) return;

    const loading = document.getElementById('loadingReg');
    if (loading) loading.classList.add('active');

    const data = window.obtenerDatosForm();
    const action = window.editMode ? 'update' : 'create';

    try {
        const result = await window.API.save(data, window.editMode, window.editCode);
        if (result.success) {
            window.toast(window.editMode ? '✅ Actualizado' : '✅ Guardado', 'success');
            sessionStorage.removeItem('editData');
            sessionStorage.removeItem('editMode');
            await window.refrescarDatos();
            window.Router.cambiarVista('listado');
        } else {
            window.toast('❌ ' + (result.message || 'Error'), 'error');
        }
    } catch (e) {
        window.toast('❌ ' + e.message, 'error');
    } finally {
        if (loading) loading.classList.remove('active');
    }
};

// ===== LIMPIAR FORMULARIO =====
window.limpiarFormulario = function() {
    const campos = ['ID_PERSONAL','APE_PATERNO','APE_MATERNO','NOMBRES','FEC_NACIMIENTO','SEXO','DNI','TELEFONO','DIRECCION','PROFESION','PROGRAMA','CARGO','LUGAR_TRABAJO','TIPO_CONTRATO','EMAIL_INSTITUCIONAL','TIPO_LABORATORIO','FECHA_VINCULACION','INICIO_PERIODO','CESE_PERIODO','CANT_PERIODO'];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('CODE').value = '';
    const etiquetas = document.getElementById('etiquetasUbicaciones');
    if (etiquetas) etiquetas.innerHTML = '';
    window.ubicacionesSeleccionadas = [];
    window.toast('🧹 Limpiado', 'info');
};

// ===== CARGAR EJEMPLO =====
window.cargarEjemplo = function() {
    const ej = {
        ID_PERSONAL: '2024001',
        APE_PATERNO: 'GARCIA',
        APE_MATERNO: 'PEREZ',
        NOMBRES: 'JUAN CARLOS',
        FEC_NACIMIENTO: '1990-05-15',
        SEXO: 'Masculino',
        DNI: '12345678',
        TELEFONO: '987654321',
        DIRECCION: 'Av. Principal 123',
        PROFESION: 'INGENIERO',
        PROGRAMA: 'ICSI',
        CARGO: 'Técnico de laboratorio 1',
        LUGAR_TRABAJO: '',
        TIPO_CONTRATO: 'Permanente',
        EMAIL_INSTITUCIONAL: 'juan@laboratorio.edu',
        TIPO_LABORATORIO: 'Medicina y Ciencias de la Salud',
        FECHA_VINCULACION: '2020-01-15',
        INICIO_PERIODO: '2024-01-01',
        CESE_PERIODO: '2024-12-31',
        CANT_PERIODO: '12'
    };
    Object.entries(ej).forEach(([k, v]) => {
        const el = document.getElementById(k);
        if (el) el.value = v;
    });
    const etiquetas = document.getElementById('etiquetasUbicaciones');
    if (etiquetas) etiquetas.innerHTML = '';
    window.ubicacionesSeleccionadas = [];
    window.toast('📋 Ejemplo cargado', 'info');
};

// ===== DASHBOARD =====
window.renderDashboard = function() {
    const main = document.getElementById('mainContent');
    main.innerHTML = `
        <div class="topbar">
            <h1><i class="fas fa-chart-pie" style="color:#3B82F6;"></i> Dashboard de Personal</h1>
            <div class="topbar-actions">
                <button class="btn btn-secondary" onclick="window.Router.cambiarVista('listado')"><i class="fas fa-arrow-left"></i> Volver</button>
                <button class="btn btn-outline" onclick="window.refrescarDatos()"><i class="fas fa-sync-alt"></i> Actualizar</button>
            </div>
        </div>
        <div id="loadingDash" class="loading"><div class="spinner"></div><p>Cargando...</p></div>
        <div class="dashboard-grid" id="dashboardGrid">
            <div class="dash-card"><div class="card-header"><i class="fas fa-calendar-day" style="color:#22C55E;"></i><h3>👥 Asisten</h3></div><div class="asisten-controles" id="asistenControles"><input type="date" id="asistenFechaSel" onchange="window.actualizarAsistenciaDia()"><div class="asisten-turno-opciones sobretiempo-tipo-opciones" id="asistenTurnoOpciones"><label class="sobretiempo-tipo-opcion checked"><input type="checkbox" id="filtroTurnoManana" checked> 🌅 06:45–14:00</label><label class="sobretiempo-tipo-opcion checked"><input type="checkbox" id="filtroTurnoTarde" checked> 🌆 14:00–21:45</label></div></div><div class="number" id="asistenHoyCount">0</div><div class="sub-info" id="asistenHoyFecha"></div><div class="list-items-scroll" id="listaAsistenHoy"></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-birthday-cake" style="color:#EC4899;"></i><h3>🎂 Cumpleaños del Mes</h3></div><div class="number" id="cumpleanosMes">0</div><div class="list-items-scroll" id="listaCumpleanos"></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-venus-mars" style="color:#8B5CF6;"></i><h3>Distribución por Género</h3></div><div class="list-items"><div class="item"><span class="label">👨 Hombres</span><span class="value" id="totalHombres">0</span></div><div class="item"><span class="label">👩 Mujeres</span><span class="value" id="totalMujeres">0</span></div></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-user-tie" style="color:#F59E0B;"></i><h3>Cargos Técnicos</h3></div><div class="list-items"><div class="item"><span class="label">🔬 Técnico Lab 1</span><span class="value" id="tecnico1">0</span></div><div class="item"><span class="label">🧪 Técnico Lab 2</span><span class="value" id="tecnico2">0</span></div></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-file-contract" style="color:#10B981;"></i><h3>Tipo de Contrato</h3></div><div class="list-items"><div class="item"><span class="label">📌 Permanente</span><span class="value" id="contratoPermanente">0</span></div><div class="item"><span class="label">⏳ Temporal</span><span class="value" id="contratoTemporal">0</span></div></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-flask" style="color:#06B6D4;"></i><h3>Tipo de Laboratorio</h3></div><div class="list-items-scroll" id="listaLaboratorios"></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-calendar-times" style="color:#EF4444;"></i><h3>📅 Ceses del Mes</h3></div><div class="number" id="cesesMes">0</div><div class="list-items-scroll" id="listaCeses"></div></div>
        </div>
    `;

    window.API.list().then(() => window.actualizarDashboard());
};

window.actualizarDashboard = function() {
    // El Dashboard refleja al personal activo (igual que el listado
    // por defecto), para que los totales/estadísticas -incluido el
    // aviso de "Ceses del Mes"- no se mezclen con gente que ya cesó
    // y fue marcada como inactiva.
    const data = (window.API.getDatos() || []).filter(window.esPersonalActivo);
    if (!data.length) {
        document.querySelectorAll('.number').forEach(el => el.textContent = '0');
        return;
    }

    const mes = new Date().getMonth() + 1;
    const mesStr = String(mes).padStart(2, '0');

    // Cumpleaños
    const cumples = data.filter(item => {
        if (!item.FEC_NACIMIENTO) return false;
        try {
            const d = new Date(item.FEC_NACIMIENTO);
            if (!isNaN(d)) return d.getMonth() + 1 === mes;
        } catch (e) {}
        const f = String(item.FEC_NACIMIENTO);
        return f.includes('/' + mesStr + '/') || f.includes('/' + mes + '/') || f.includes('-' + mesStr + '-');
    });
    document.getElementById('cumpleanosMes').textContent = cumples.length;
    document.getElementById('listaCumpleanos').innerHTML = cumples.length ?
        cumples.map(item => `<div class="item"><span class="label">${window.esc(item.NOMBRES||'')} ${window.esc(item.APE_PATERNO||'')}</span><span class="value">${window.formatearFecha(item.FEC_NACIMIENTO)}</span></div>`).join('') :
        '<div class="item"><span class="label" style="color:#94A3B8;">Sin cumpleaños este mes</span></div>';

    // Género
    const gen = { h: 0, m: 0 };
    data.forEach(item => {
        const s = String(item.SEXO || '').toUpperCase().trim();
        if (s === 'M' || s === 'MASCULINO' || s === 'MASC') gen.h++;
        else if (s === 'F' || s === 'FEMENINO' || s === 'FEM') gen.m++;
    });
    document.getElementById('totalHombres').textContent = gen.h;
    document.getElementById('totalMujeres').textContent = gen.m;

    // Cargos
    const car = { t1: 0, t2: 0 };
    data.forEach(item => {
        const c = String(item.CARGO || '').toUpperCase().trim();
        if (c.includes('TÉCNICO DE LABORATORIO 1') || c.includes('TECNICO DE LABORATORIO 1')) car.t1++;
        else if (c.includes('TÉCNICO DE LABORATORIO 2') || c.includes('TECNICO DE LABORATORIO 2')) car.t2++;
    });
    document.getElementById('tecnico1').textContent = car.t1;
    document.getElementById('tecnico2').textContent = car.t2;

    // Contratos
    const cont = { p: 0, t: 0 };
    data.forEach(item => {
        const c = String(item.TIPO_CONTRATO || '').toUpperCase().trim();
        if (c.includes('PERMANENTE') || c.includes('FIJO') || c.includes('PLANILLA')) cont.p++;
        else if (c.includes('TEMPORAL') || c.includes('EVENTUAL') || c.includes('CAS') || c.includes('LOCACIÓN')) cont.t++;
    });
    document.getElementById('contratoPermanente').textContent = cont.p;
    document.getElementById('contratoTemporal').textContent = cont.t;

    // Laboratorios
    const labCount = {};
    data.forEach(item => {
        const lab = String(item.TIPO_LABORATORIO || '').trim();
        if (lab) { labCount[lab] = (labCount[lab] || 0) + 1; }
    });
    const labEntries = Object.entries(labCount).sort((a, b) => b[1] - a[1]);
    document.getElementById('listaLaboratorios').innerHTML = labEntries.length ?
        labEntries.map(([lab, count]) => `<div class="item"><span class="label">${window.esc(lab)}</span><span class="value"><span class="badge-mini">${count}</span></span></div>`).join('') :
        '<div class="item"><span class="label" style="color:#94A3B8;">Sin datos</span></div>';

    // Ceses
    const ceses = data.filter(item => {
        if (!item.CESE_PERIODO) return false;
        try {
            const d = new Date(item.CESE_PERIODO);
            if (!isNaN(d)) return d.getMonth() + 1 === mes;
        } catch (e) {}
        const f = String(item.CESE_PERIODO);
        return f.includes('/' + mesStr + '/') || f.includes('/' + mes + '/') || f.includes('-' + mesStr + '-');
    });
    document.getElementById('cesesMes').textContent = ceses.length;
    document.getElementById('listaCeses').innerHTML = ceses.length ?
        ceses.map(item => `<div class="item"><span class="label">${window.esc(item.NOMBRES||'')} ${window.esc(item.APE_PATERNO||'')}</span><span class="value">${window.formatearFecha(item.CESE_PERIODO)}</span></div>`).join('') :
        '<div class="item"><span class="label" style="color:#94A3B8;">Sin ceses este mes</span></div>';

    // Asisten [día] (no bloquea el resto del Dashboard: pide los
    // horarios aparte y se pinta sola cuando responde).
    window._dashPersonalActivo = data;
    window.inicializarControlesAsistencia();
    window.actualizarAsistenciaDia();
};

// Deja el <input type="date"> en la fecha actualmente elegida (hoy la
// primera vez que se abre el Dashboard) y engancha el resaltado de los
// chips de turno (mismo patrón que los chips de "Tipo de trabajo" de
// Sobretiempo: la clase "checked" sigue al checkbox real).
window.inicializarControlesAsistencia = function() {
    const fechaInput = document.getElementById('asistenFechaSel');
    if (fechaInput && !fechaInput.value) {
        const hoy = new Date();
        fechaInput.value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    }
    const cont = document.getElementById('asistenTurnoOpciones');
    if (cont && !cont.dataset.listo) {
        cont.addEventListener('change', () => {
            cont.querySelectorAll('.sobretiempo-tipo-opcion').forEach(label => {
                const chk = label.querySelector('input[type="checkbox"]');
                label.classList.toggle('checked', !!chk?.checked);
            });
            window.actualizarAsistenciaDia();
        });
        cont.dataset.listo = '1';
    }
};

// Clasifica un turno por su hora de ingreso: antes de las 14:00 se
// considera Mañana (06:45–14:00), de ahí en adelante Tarde
// (14:00–21:45). Sirve para el filtro de chips de la card "Asisten".
function turnoDeHorario(ingreso) {
    const min = window.HorarioModel.horaAMinutos(ingreso);
    if (min === null) return null;
    return min < window.HorarioModel.horaAMinutos('14:00') ? 'manana' : 'tarde';
}

// Cruza BD_HORARIOS (todos los grupos, de todo el personal) con la
// fecha elegida en #asistenFechaSel (por defecto, hoy), para mostrar
// quién tiene horario asignado ese día. Un empleado "asiste" ese día
// cuando:
//   1) tiene un grupo de horario cuyo rango [FECHA_INICIO, FECHA_FIN]
//      cubre la fecha elegida (FECHA_FIN vacío = sigue vigente), y
//   2) ese grupo tiene el día de la semana correspondiente entre sus
//      DIAS (recordar: DIAS solo trae los días marcados como activos).
// Si un empleado tiene más de un grupo que cumple ambas condiciones
// para esa fecha (horarios que se solapan mientras uno reemplaza al
// otro), se usa el horario más reciente: el de FECHA_INICIO más
// cercana a la fecha elegida (mismo criterio de "vigente" que usa el
// resto del módulo de Horarios, vía HorarioModel.ordenarGruposPorFechaInicio).
// También se descarta a cualquiera que ya no figure como personal
// activo (mismo criterio que el resto del Dashboard), por si su
// horario no se hubiera limpiado al darlo de baja. Por último, se
// puede acotar la lista por turno con los chips "🌅 Mañana" / "🌆 Tarde".
window.actualizarAsistenciaDia = async function() {
    const numEl = document.getElementById('asistenHoyCount');
    const fechaEl = document.getElementById('asistenHoyFecha');
    const cont = document.getElementById('listaAsistenHoy');
    const fechaInput = document.getElementById('asistenFechaSel');
    const filtroManana = document.getElementById('filtroTurnoManana');
    const filtroTarde = document.getElementById('filtroTurnoTarde');
    if (!numEl || !cont) return;

    const personalActivo = window._dashPersonalActivo || [];
    const DIAS_JS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const hoy = new Date();
    const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const fechaSelISO = (fechaInput && fechaInput.value) ? fechaInput.value : hoyISO;
    const [y, m, d] = fechaSelISO.split('-').map(Number);
    const fechaSel = new Date(y, (m || 1) - 1, d || 1);
    const diaSel = DIAS_JS[fechaSel.getDay()];
    const esHoy = fechaSelISO === hoyISO;
    const verManana = !filtroManana || filtroManana.checked;
    const verTarde = !filtroTarde || filtroTarde.checked;

    if (fechaEl) {
        const etiquetaFecha = `${diaSel} ${String(fechaSel.getDate()).padStart(2, '0')}/${String(fechaSel.getMonth() + 1).padStart(2, '0')}/${fechaSel.getFullYear()}`;
        fechaEl.textContent = esHoy ? `Hoy ${etiquetaFecha}` : etiquetaFecha;
    }

    cont.innerHTML = '<div class="item"><span class="label" style="color:#94A3B8;">Cargando horarios...</span></div>';

    try {
        const result = await window.HorarioAPI.listar();
        const grupos = (result && result.success && Array.isArray(result.data)) ? result.data : [];
        const codesActivos = new Set(personalActivo.map(p => p.CODE));

        // Grupos vigentes en la fecha elegida por rango [FECHA_INICIO,
        // FECHA_FIN] — todavía SIN mirar si trabajan ese día de la
        // semana. Esto es a propósito: primero hay que saber cuál es
        // el horario de cada técnico en esa fecha (el más reciente),
        // y recién con ESE horario particular se revisa si le toca
        // trabajar ese día. Si se filtrara por día antes de elegir el
        // más reciente, un horario viejo que sí trabaje ese día podría
        // colarse aunque ya haya sido reemplazado por uno más nuevo
        // que no lo trabaje.
        const vigentesEnFecha = grupos.filter(g => {
            if (g.CODE && !codesActivos.has(g.CODE)) return false; // ya no es personal activo
            const inicio = String(g.FECHA_INICIO || '').slice(0, 10);
            const fin = String(g.FECHA_FIN || '').slice(0, 10);
            if (!inicio || inicio > fechaSelISO) return false;     // aún no empieza
            if (fin && fin < fechaSelISO) return false;            // ya terminó
            return true;
        });

        // Por cada técnico, de todos sus horarios vigentes en esa
        // fecha (puede haber más de uno si se solapan por un registro
        // duplicado o en transición) se usa SOLO el más reciente por
        // FECHA_INICIO — nunca uno más antiguo, aunque ese sí incluya
        // el día elegido y el más reciente no.
        const porEmpleado = {};
        vigentesEnFecha.forEach(g => {
            const clave = g.CODE || g.ID_PERSONAL || g.EMPLEADO;
            if (!clave) return;
            if (!porEmpleado[clave]) porEmpleado[clave] = [];
            porEmpleado[clave].push(g);
        });

        const asisten = [];
        Object.entries(porEmpleado).forEach(([clave, gs]) => {
            const masReciente = window.HorarioModel.ordenarGruposPorFechaInicio(gs, 'desc')[0];
            const diaEntry = (masReciente.DIAS || []).find(dd => dd.dia === diaSel);
            if (!diaEntry) return; // el horario más reciente de este técnico no trabaja ese día

            const turno = turnoDeHorario(diaEntry.ingreso);
            if (turno === 'manana' && !verManana) return;
            if (turno === 'tarde' && !verTarde) return;
            if (turno === null && !verManana && !verTarde) return;

            asisten.push({
                nombre: masReciente.EMPLEADO || clave || '(sin nombre)',
                ingreso: diaEntry.ingreso || '',
                salida: diaEntry.salida || ''
            });
        });

        asisten.sort((a, b) => (a.ingreso || '99:99').localeCompare(b.ingreso || '99:99'));

        numEl.textContent = asisten.length;
        cont.innerHTML = asisten.length ?
            asisten.map(a => `<div class="item"><span class="label">${window.esc(a.nombre)}</span><span class="value">${window.esc(a.ingreso)}${a.salida ? ' – ' + window.esc(a.salida) : ''}</span></div>`).join('') :
            `<div class="item"><span class="label" style="color:#94A3B8;">Nadie tiene horario registrado para ${esHoy ? 'hoy' : 'ese día'} (${window.esc(diaSel)})</span></div>`;
    } catch (e) {
        numEl.textContent = '–';
        cont.innerHTML = '<div class="item"><span class="label" style="color:#EF4444;">No se pudo cargar la asistencia</span></div>';
    }
};
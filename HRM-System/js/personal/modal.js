// ============================================================
// PERSONAL - CRUD, MODALES Y FORMULARIO
// ============================================================

// ===== ELIMINAR =====
window.eliminarRegistro = async function(code) {
    if (!confirm('⚠️ ¿Eliminar permanentemente?')) return;

    const row = document.querySelector(`tr button[onclick*="eliminarRegistro('${code}')"]`)?.closest('tr');
    if (row) { row.style.opacity = '0.5'; row.style.transition = 'opacity 0.3s'; }

    window.toast('Eliminando...', 'info');

    try {
        const result = await window.API.delete(code);
        if (result.success) {
            const datos = window.API.getDatos();
            const index = datos.findIndex(item => item.CODE === code);
            if (index !== -1) {
                datos.splice(index, 1);
                if (window.datosFiltrados) {
                    const idx = window.datosFiltrados.findIndex(item => item.CODE === code);
                    if (idx !== -1) window.datosFiltrados.splice(idx, 1);
                }
                window.API.setDatos(datos);
                window.renderTabla(window.datosFiltrados || datos);
                window.actualizarContadoresGenerales();
                if (window.Router.getVistaActual() === 'dashboard') window.actualizarDashboard();
                window.toast('✅ Registro eliminado', 'success');
            }
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
        return `<div class="info-item"><div class="info-icon"><i class="fas ${campo.icon}"></i></div><div><div class="info-label">${campo.label}</div><div class="info-value">${window.esc(valor)}</div></div></div>`;
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

// ===== EDITAR =====
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
                    <div class="form-group"><label>DNI</label><input type="text" id="DNI" maxlength="8" placeholder="DNI"></div>
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
                    <div class="form-group"><label>EMAIL_INSTITUCIONAL</label><input type="email" id="EMAIL_INSTITUCIONAL" placeholder="correo@institucion.com"></div>
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
    }
};

// ===== VALIDAR REQUERIDOS =====
window.validarRequeridos = function() {
    const requeridos = ['ID_PERSONAL', 'APE_PATERNO', 'NOMBRES'];
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
    if (window.editMode && window.editCode) data.CODE = window.editCode;
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
            <div class="dash-card"><div class="card-header"><i class="fas fa-birthday-cake" style="color:#EC4899;"></i><h3>🎂 Cumpleaños del Mes</h3></div><div class="number" id="cumpleanosMes">0</div><div class="list-items-scroll" id="listaCumpleanos"></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-venus-mars" style="color:#8B5CF6;"></i><h3>Distribución por Género</h3></div><div class="list-items"><div class="item"><span class="label">👨 Hombres</span><span class="value" id="totalHombres">0</span></div><div class="item"><span class="label">👩 Mujeres</span><span class="value" id="totalMujeres">0</span></div></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-user-tie" style="color:#F59E0B;"></i><h3>Cargos Técnicos</h3></div><div class="list-items"><div class="item"><span class="label">🔬 Técnico Lab 1</span><span class="value" id="tecnico1">0</span></div><div class="item"><span class="label">🧪 Técnico Lab 2</span><span class="value" id="tecnico2">0</span></div></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-file-contract" style="color:#10B981;"></i><h3>Tipo de Contrato</h3></div><div class="list-items"><div class="item"><span class="label">📌 Permanente</span><span class="value" id="contratoPermanente">0</span></div><div class="item"><span class="label">⏳ Temporal</span><span class="value" id="contratoTemporal">0</span></div></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-flask" style="color:#06B6D4;"></i><h3>Tipo de Laboratorio</h3></div><div class="list-items-scroll" id="listaLaboratorios"></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-calendar-times" style="color:#EF4444;"></i><h3>📅 Ceses del Mes</h3></div><div class="number" id="cesesMes">0</div><div class="list-items-scroll" id="listaCeses"></div></div>
            <div class="dash-card"><div class="card-header"><i class="fas fa-graduation-cap" style="color:#8B5CF6;"></i><h3>🎓 Profesiones</h3></div><div class="number" id="totalProfesiones">0</div><div class="list-items-scroll" id="listaProfesiones"></div></div>
            <div class="dash-card" style="background:linear-gradient(135deg,#EFF6FF,#FFFFFF);"><div class="card-header"><i class="fas fa-users" style="background:#3B82F6;color:#fff;"></i><h3>Resumen General</h3></div><div class="number" id="totalPersonalDash">0</div><div class="sub-info">Total de personal registrado</div><div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;"><span class="badge badge-blue" id="badgeHombres">Hombres: 0</span><span class="badge badge-pink" id="badgeMujeres">Mujeres: 0</span><span class="badge badge-orange" id="badgeTecnicos">Técnicos: 0</span></div></div>
        </div>
    `;

    window.API.list().then(() => window.actualizarDashboard());
};

window.actualizarDashboard = function() {
    const data = window.API.getDatos() || [];
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
    document.getElementById('badgeHombres').textContent = `Hombres: ${gen.h}`;
    document.getElementById('badgeMujeres').textContent = `Mujeres: ${gen.m}`;

    // Cargos
    const car = { t1: 0, t2: 0 };
    data.forEach(item => {
        const c = String(item.CARGO || '').toUpperCase().trim();
        if (c.includes('TÉCNICO DE LABORATORIO 1') || c.includes('TECNICO DE LABORATORIO 1')) car.t1++;
        else if (c.includes('TÉCNICO DE LABORATORIO 2') || c.includes('TECNICO DE LABORATORIO 2')) car.t2++;
    });
    document.getElementById('tecnico1').textContent = car.t1;
    document.getElementById('tecnico2').textContent = car.t2;
    document.getElementById('badgeTecnicos').textContent = `Técnicos: ${car.t1 + car.t2}`;

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

    // Profesiones
    const profCount = {};
    data.forEach(item => {
        const prof = String(item.PROFESION || '').trim();
        if (prof) {
            let key = prof;
            if (key.toLowerCase().includes('técnico') || key.toLowerCase().includes('tecnico')) {
                if (key.toLowerCase().includes('laboratorio') || key.toLowerCase().includes('análisis')) key = 'Técnico en Laboratorio Clínico / Análisis';
                else if (key.toLowerCase().includes('electrónico')) key = 'Técnico Electrónico / Electromecánico';
                else if (key.toLowerCase().includes('computación')) key = 'Técnico en Computación / Sistemas';
                else key = 'Técnico (otros)';
            }
            if (key.toLowerCase().includes('ingeniero') || key.toLowerCase().includes('ingenier')) {
                if (key.toLowerCase().includes('industrial')) key = 'Ingeniero Industrial';
                else if (key.toLowerCase().includes('civil')) key = 'Ingeniero Civil';
                else if (key.toLowerCase().includes('sistemas') || key.toLowerCase().includes('computación')) key = 'Ingeniero de Sistemas/Computación';
                else key = 'Ingeniero (otros)';
            }
            profCount[key] = (profCount[key] || 0) + 1;
        }
    });
    const profEntries = Object.entries(profCount).sort((a, b) => b[1] - a[1]);
    document.getElementById('totalProfesiones').textContent = profEntries.length;
    document.getElementById('listaProfesiones').innerHTML = profEntries.length ?
        profEntries.map(([prof, count]) => `<div class="item"><span class="label">${window.esc(prof)}</span><span class="value"><span class="badge-mini">${count}</span></span></div>`).join('') :
        '<div class="item"><span class="label" style="color:#94A3B8;">Sin datos</span></div>';

    document.getElementById('totalPersonalDash').textContent = data.length;
};
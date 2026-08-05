// ============================================================
// PERSONAL - LISTADO Y DASHBOARD
// ============================================================

window.renderListado = async function() {
    const main = document.getElementById('mainContent');
    const data = window.API.getDatos() || [];

    main.innerHTML = `
        <div class="topbar">
            <h1>Lista de Personal</h1>
            <div class="total-badge"><i class="fas fa-users"></i> Total <span id="totalPersonalListado">${data.length}</span></div>
        </div>
        <div class="action-bar">
            <div class="search-box">
                <i class="fas fa-search"></i>
                <input type="text" id="buscarDash" placeholder="Buscar por Nombres, Apellido Paterno o ID..." oninput="window.buscarPersonal()">
            </div>
            <button class="btn btn-primary" onclick="window.Router.cambiarVista('registro')"><i class="fas fa-plus"></i> Nuevo</button>
            <button class="btn btn-outline" onclick="window.Router.cambiarVista('dashboard')"><i class="fas fa-chart-pie"></i> Dashboard</button>
            <button class="btn btn-success" onclick="window.exportarCSV()"><i class="fas fa-file-csv"></i> CSV</button>
            <button class="btn btn-secondary" onclick="window.refrescarDatos()" title="Sincronizar con servidor"><i class="fas fa-sync-alt"></i></button>
            <span class="sync-indicator"><i class="fas fa-check-circle"></i> Sincronizado</span>
        </div>
        <div class="contadores">
            <span class="contador-item">📊 Mostrando: <strong id="totalFiltrado">${data.length}</strong> registros</span>
        </div>
        <div id="loadingListado" class="loading"><div class="spinner"></div><p>Cargando...</p></div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>ID Personal</th>
                        <th>Apellido Paterno</th>
                        <th>Apellido Materno</th>
                        <th>Nombres</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="tbodyListado"></tbody>
            </table>
        </div>
    `;

    await window.API.list();
    window.renderTabla(window.API.getDatos());
    window.actualizarContadoresGenerales();
};

window.renderTabla = function(data) {
    const tbody = document.getElementById('tbodyListado');
    const total = document.getElementById('totalPersonalListado');
    const filtrado = document.getElementById('totalFiltrado');
    const mostrar = data || window.API.getDatos() || [];

    if (total) total.textContent = mostrar.length;
    if (filtrado) filtrado.textContent = mostrar.length;

    if (!tbody) return;

    if (!mostrar || mostrar.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:24px;">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = mostrar.map(item => `
        <tr class="fade-in">
            <td>${window.esc(item.ID_PERSONAL)}</td>
            <td>${window.esc(item.APE_PATERNO)}</td>
            <td>${window.esc(item.APE_MATERNO)}</td>
            <td>${window.esc(item.NOMBRES)}</td>
            <td>
                <button class="action-btn btn-view" onclick='window.verDetalle(${JSON.stringify(item).replace(/'/g,"&#39;")})' title="Ver">👁️</button>
                <button class="action-btn btn-edit" onclick='window.editarRegistro(${JSON.stringify(item).replace(/'/g,"&#39;")})' title="Editar">✏️</button>
                <button class="action-btn btn-delete" onclick='window.eliminarRegistro("${window.esc(item.CODE)}")' title="Eliminar">🗑️</button>
                <button class="action-btn btn-copy" onclick='window.copiarDatos(${JSON.stringify(item).replace(/'/g,"&#39;")})' title="Copiar">📋</button>
            </td>
        </tr>
    `).join('');
};

window.buscarPersonal = function() {
    const busqueda = document.getElementById('buscarDash')?.value.toLowerCase().trim() || '';
    const datos = window.API.getDatos() || [];

    if (!busqueda) {
        window.datosFiltrados = null;
        window.renderTabla(datos);
        window.actualizarContadoresGenerales();
        return;
    }

    window.datosFiltrados = datos.filter(item => {
        const texto = `${item.NOMBRES||''} ${item.APE_PATERNO||''} ${item.ID_PERSONAL||''}`.toLowerCase();
        return texto.includes(busqueda);
    });

    window.renderTabla(window.datosFiltrados);
    window.actualizarContadoresGenerales();
};

window.actualizarContadoresGenerales = function() {
    const mostrar = window.datosFiltrados || window.API.getDatos() || [];
    const totalPersonal = document.getElementById('totalPersonalListado');
    const totalFiltrado = document.getElementById('totalFiltrado');
    const totalBadge = document.querySelector('.total-badge span');

    if (totalPersonal) totalPersonal.textContent = mostrar.length;
    if (totalFiltrado) totalFiltrado.textContent = mostrar.length;
    if (totalBadge) totalBadge.textContent = window.API.getDatos().length;

    if (window.Router.getVistaActual() === 'dashboard') window.actualizarDashboard();
};

window.refrescarDatos = async function() {
    if (window.actualizando) return;
    window.actualizando = true;
    const indicator = document.querySelector('.sync-indicator');
    if (indicator) {
        indicator.className = 'sync-indicator syncing';
        indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
    }

    try {
        await window.API.list(true);
        if (window.Router.getVistaActual() === 'listado') {
            window.renderTabla(window.API.getDatos());
            window.actualizarContadoresGenerales();
        } else if (window.Router.getVistaActual() === 'dashboard') {
            window.actualizarDashboard();
        }
        if (indicator) {
            indicator.className = 'sync-indicator success';
            indicator.innerHTML = '<i class="fas fa-check-circle"></i> Actualizado';
            setTimeout(() => {
                if (indicator) {
                    indicator.className = 'sync-indicator';
                    indicator.innerHTML = '<i class="fas fa-check-circle"></i> Sincronizado';
                }
            }, 3000);
        }
        window.toast('✅ Datos actualizados', 'success');
    } catch (e) {
        window.toast('❌ Error: ' + e.message, 'error');
        if (indicator) {
            indicator.className = 'sync-indicator error';
            indicator.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
        }
    } finally {
        window.actualizando = false;
    }
};

window.exportarCSV = function() {
    const data = window.datosFiltrados || window.API.getDatos() || [];
    if (!data?.length) { window.toast('⚠️ Sin datos', 'error'); return; }

    try {
        const headers = Object.keys(data[0]);
        let csv = '\uFEFF' + headers.join(',') + '\n';
        csv += data.map(item => headers.map(h => {
            let v = item[h] || '';
            if (typeof v === 'string') {
                v = v.replace(/"/g, '""');
                if (v.includes(',') || v.includes('"') || v.includes('\n')) v = `"${v}"`;
            }
            return v;
        }).join(',')).join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `personal_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        window.toast(`📊 ${data.length} registros`, 'success');
    } catch (e) {
        window.toast('❌ Error: ' + e.message, 'error');
    }
};

window.copiarDatos = function(data) {
    const texto = `${data.NOMBRES||''} ${data.APE_PATERNO||''} ${data.APE_MATERNO||''} (Id: ${data.ID_PERSONAL||''})`;
    window.copiarTexto(texto);
};
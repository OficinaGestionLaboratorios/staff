// ============================================================
// LICENCIAS-UI.JS — Pintado y lectura del modal
// ============================================================
window.LicenciasUI = (function () {
    function setValue(id, value) { const el = document.getElementById(id); if (el) el.value = value ?? ''; }

    function limpiar() {
        setValue('licenciaFechaSolicitud', new Date().toISOString().slice(0,10));
        setValue('licenciaFechaInicio', '');
        setValue('licenciaFechaFin', '');
        setValue('licenciaMotivo', '');
        setValue('licenciaAnexos', '');
        setValue('licenciaArea', '');
        setValue('licenciaAreaOtro', '');
        const otro = document.getElementById('licenciaAreaOtro'); if (otro) otro.style.display = 'none';
        const msg = document.getElementById('licenciaMsg'); if (msg) msg.textContent = '';
        actualizarDias();
    }

    function cargarPersonal(personal) {
        setValue('licenciaEmpleado', window.formatearPersonalSeleccionado(personal));
        setValue('licenciaIdPersonal', personal?.ID_PERSONAL || '');
        setValue('licenciaDni', personal?.DNI || '');
        setValue('licenciaDireccion', personal?.DIRECCION || '');
        setValue('licenciaEmail', personal?.EMAIL_INSTITUCIONAL || '');
        setValue('licenciaTelefono', personal?.TELEFONO || '');
        setValue('licenciaCargo', personal?.CARGO || '');
        setValue('licenciaArea', '');
        setValue('licenciaAreaOtro', '');
        const otro = document.getElementById('licenciaAreaOtro'); if (otro) otro.style.display = 'none';
    }

    function leer() {
        const areaSelect = document.getElementById('licenciaArea')?.value || '';
        const areaOtro = document.getElementById('licenciaAreaOtro')?.value?.trim() || '';
        return {
            area: areaSelect === 'Otros' ? areaOtro : areaSelect,
            areaSeleccionada: areaSelect,
            fechaSolicitud: document.getElementById('licenciaFechaSolicitud')?.value || '',
            fechaInicio: document.getElementById('licenciaFechaInicio')?.value || '',
            fechaFin: document.getElementById('licenciaFechaFin')?.value || '',
            motivo: document.getElementById('licenciaMotivo')?.value || '',
            anexos: document.getElementById('licenciaAnexos')?.value || ''
        };
    }


    function cambiarArea() {
        const select = document.getElementById('licenciaArea');
        const otro = document.getElementById('licenciaAreaOtro');
        if (!select || !otro) return;
        const mostrar = select.value === 'Otros';
        otro.style.display = mostrar ? 'block' : 'none';
        if (!mostrar) otro.value = '';
        if (mostrar) otro.focus();
    }

    function actualizarDias() {
        const d = window.LicenciasModel.calcularDias(document.getElementById('licenciaFechaInicio')?.value, document.getElementById('licenciaFechaFin')?.value);
        const out = document.getElementById('licenciaDias'); if (out) out.textContent = d ? `${d} día${d === 1 ? '' : 's'}` : '—';
    }

    function renderLista(registros) {
        const wrap = document.getElementById('licenciasListaWrap');
        const cont = document.getElementById('licenciasLista');
        if (!wrap || !cont) return;
        if (!registros.length) { wrap.style.display = 'none'; cont.innerHTML = ''; return; }
        wrap.style.display = 'block';
        cont.innerHTML = registros.map(r => `
            <div class="horario-grupo-item">
                <div>
                    <strong>${window.esc(r.FECHA_INICIO)} → ${window.esc(r.FECHA_FIN)}</strong>
                    <small>${window.esc(r.TIPO_LICENCIA || 'Licencia')} · ${window.esc(String(r.DIAS || ''))} día(s)</small>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <span class="badge-estado estado-programado"><i class="fas fa-file-alt"></i> Registrada</span>
                    <button class="action-btn btn-download-uniform" data-licencia-id="${window.esc(r.ID_LICENCIA)}" title="Descargar documento Word"><i class="fas fa-download"></i></button>
                </div>
            </div>`).join('');
    }

    function mostrarError(texto) { const el = document.getElementById('licenciaMsg'); if (el) el.textContent = texto || ''; }
    return { limpiar, cargarPersonal, leer, cambiarArea, actualizarDias, renderLista, mostrarError };
})();

// ============================================================
// LICENCIAS.JS — Orquestador del módulo Licencias
// Flujo: seleccionar personal → Licencias → modal → registrar → Word.
// ============================================================
let licenciaIdActual = null;
let licenciasRegistros = [];

window.abrirModalLicencias = async function () {
    if (!window.personalSeleccionado) {
        window.toast('⚠️ Primero selecciona un empleado en la Lista de Personal', 'warning');
        return;
    }
    const modal = document.getElementById('modalLicencias');
    if (!modal) return;
    licenciaIdActual = null;
    window.LicenciasUI.cargarPersonal(window.personalSeleccionado);
    window.LicenciasUI.limpiar();
    modal.style.display = 'flex'; modal.classList.add('active'); document.body.style.overflow='hidden';
    await window.licenciasCargarLista();
};

window.cerrarModalLicencias = function () {
    const modal = document.getElementById('modalLicencias');
    if (modal) { modal.classList.remove('active'); modal.style.display='none'; }
    document.body.style.overflow=''; licenciaIdActual=null;
};

window.licenciasCargarLista = async function () {
    const r = await window.LicenciasAPI.listar(window.personalSeleccionado?.CODE);
    licenciasRegistros = (r.success && Array.isArray(r.data)) ? r.data : [];
    window.LicenciasUI.renderLista(licenciasRegistros);
    document.getElementById('licenciasLista')?.querySelectorAll('[data-licencia-id]').forEach(btn => {
        btn.addEventListener('click', () => window.licenciaGenerarWord(btn.dataset.licenciaId));
    });
};

window.licenciaNueva = function () {
    licenciaIdActual=null; window.LicenciasUI.limpiar(); window.LicenciasUI.mostrarError('');
    document.getElementById('licenciaFormTitulo').textContent='Nueva solicitud de licencia';
    document.getElementById('licenciaBtnGuardar').disabled=false;
};

window.guardarLicencia = async function () {
    window.LicenciasUI.mostrarError('');
    if (!window.personalSeleccionado) { window.toast('⚠️ No hay empleado seleccionado','error'); return; }
    const datos = window.LicenciasUI.leer();
    const errores = window.LicenciasValidacion.validar({ personal:window.personalSeleccionado, ...datos });
    if (errores.length) { const t='Falta completar: '+errores.join('; '); window.LicenciasUI.mostrarError(t); window.toast('⚠️ '+t,'error'); return; }
    const payload = window.LicenciasModel.construirPayload({ personal:window.personalSeleccionado, ...datos });
    const btn=document.getElementById('licenciaBtnGuardar'); if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Guardando...';}
    try {
        const r=await window.LicenciasAPI.crear(payload);
        if(!r.success){window.toast('❌ '+(r.message||'No se pudo registrar la licencia'),'error');return;}
        window.toast('✅ Solicitud de licencia registrada en el historial','success');
        await window.licenciasCargarLista();
        const id=r.data?.ID_LICENCIA;
        if(id){
            const r2=await window.LicenciasAPI.obtener(id);
            if(r2.success && r2.data) await window.LicenciasExportDOCX.generar(r2.data);
        }
        window.LicenciasUI.limpiar();
    } finally { if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Guardar y generar Word';} }
};

window.licenciaGenerarWord = async function(id) {
    const r=await window.LicenciasAPI.obtener(id);
    if(!r.success || !r.data){window.toast('❌ No se encontró la solicitud','error');return;}
    await window.LicenciasExportDOCX.generar(r.data);
};

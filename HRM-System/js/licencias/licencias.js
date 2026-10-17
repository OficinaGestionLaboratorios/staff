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
    const bg0=document.getElementById('licenciaBtnGuardar'); if(bg0) bg0.innerHTML='<i class="fas fa-save"></i> Guardar y generar Word';
    const tt0=document.getElementById('licenciaFormTitulo'); if(tt0) tt0.textContent='Nueva solicitud de licencia';
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
    const porId = id => licenciasRegistros.find(r => String(r.ID_LICENCIA) === String(id));
    window.AccionesRegistro.enlazar(document.getElementById('licenciasLista'), {
        editar: id => window.licenciaEditar(id),
        exportar: id => window.licenciaGenerarWord(id),
        copiar: id => { const r = porId(id); if (r) window.AccionesRegistro.copiar(window.licenciaTexto(r)); },
        correo: id => { const r = porId(id); if (r) window.licenciaAbrirCorreo(r); },
        eliminar: id => window.licenciaEliminar(id)
    });
};

window.licenciaFilas = function(r) {
    const f = window.LicenciasModel.fechaTexto;
    return [
        ['Trabajador', r.EMPLEADO], ['ID Personal', r.ID_PERSONAL], ['DNI', r.DNI], ['Cargo', r.CARGO], ['Área / programa', r.AREA],
        ['Tipo de licencia', r.TIPO_LICENCIA], ['Fecha de solicitud', f(r.FECHA_SOLICITUD)],
        ['Inicio', f(r.FECHA_INICIO)], ['Fin', f(r.FECHA_FIN)], ['Duración', r.DIAS ? `${r.DIAS} día(s)` : ''],
        ['Motivo / sustento', r.MOTIVO], ['Anexos', r.ANEXOS]
    ];
};
window.licenciaTexto = r => window.AccionesRegistro.filasATexto(`Licencia ${r.ID_LICENCIA} — ${r.EMPLEADO || ''}`, window.licenciaFilas(r));
window.licenciaAbrirCorreo = function(r) {
    window.AccionesRegistro.abrirCorreoRegistro({
        clave: 'licencias', titulo: 'Correo de licencia',
        asunto: `Solicitud de licencia ${window.LicenciasModel.fechaTexto(r.FECHA_INICIO)} – ${r.EMPLEADO || ''}`.trim(),
        intro: 'Por medio del presente, remito el detalle de la solicitud de licencia sin goce de haber:', filas: window.licenciaFilas(r)
    });
};

// Editar: carga la solicitud en el formulario; «Guardar» actualiza el mismo registro.
window.licenciaEditar = function (id) {
    const r = licenciasRegistros.find(x => String(x.ID_LICENCIA) === String(id));
    if (!r) { window.toast('❌ No se encontró la solicitud', 'error'); return; }
    licenciaIdActual = r.ID_LICENCIA;
    window.LicenciasUI.pintarRegistro(r);
    window.LicenciasUI.mostrarError('');
    document.getElementById('licenciaFormTitulo').textContent = `Editando solicitud ${r.ID_LICENCIA}`;
    const btn = document.getElementById('licenciaBtnGuardar'); if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Actualizar y generar Word';
    window.toast(`✏️ Editando licencia ${r.ID_LICENCIA}`, 'success');
};

window.licenciaEliminar = async function (id) {
    if (!id) return;
    const reg = licenciasRegistros.find(r => String(r.ID_LICENCIA) === String(id));
    const detalle = reg ? ` (${reg.FECHA_INICIO} → ${reg.FECHA_FIN})` : '';
    if (!confirm(`¿Eliminar la solicitud de licencia ${id}${detalle}? Esta acción no se puede deshacer.`)) return;
    const r = await window.LicenciasAPI.eliminar(id);
    if (!r.success) { window.toast('❌ ' + (r.message || 'No se pudo eliminar la licencia'), 'error'); return; }
    window.toast('🗑️ Solicitud de licencia eliminada', 'success');
    await window.licenciasCargarLista();
};

window.licenciaNueva = function () {
    licenciaIdActual=null; window.LicenciasUI.limpiar(); window.LicenciasUI.mostrarError('');
    document.getElementById('licenciaFormTitulo').textContent='Nueva solicitud de licencia';
    const bg=document.getElementById('licenciaBtnGuardar'); bg.disabled=false; bg.innerHTML='<i class="fas fa-save"></i> Guardar y generar Word';
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
        const editando=licenciaIdActual;
        const r=editando ? await window.LicenciasAPI.actualizar(editando,payload) : await window.LicenciasAPI.crear(payload);
        if(!r.success){window.toast('❌ '+(r.message||'No se pudo registrar la licencia'),'error');return;}
        window.toast(editando ? '✅ Solicitud de licencia actualizada' : '✅ Solicitud de licencia registrada en el historial','success');
        await window.licenciasCargarLista();
        const id=editando || r.data?.ID_LICENCIA;
        if(id){
            const r2=await window.LicenciasAPI.obtener(id);
            if(r2.success && r2.data) await window.LicenciasExportDOCX.generar(r2.data);
        }
        licenciaIdActual=null; document.getElementById('licenciaFormTitulo').textContent='Nueva solicitud de licencia';
        window.LicenciasUI.limpiar();
    } finally { if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> '+(licenciaIdActual?'Actualizar y generar Word':'Guardar y generar Word');} }
};

window.licenciaGenerarWord = async function(id) {
    const r=await window.LicenciasAPI.obtener(id);
    if(!r.success || !r.data){window.toast('❌ No se encontró la solicitud','error');return;}
    await window.LicenciasExportDOCX.generar(r.data);
};

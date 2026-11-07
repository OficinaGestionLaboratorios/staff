// ============================================================
// BASE-CORREOS.JS — Administrador de la base de correos (BD_CORREOS)
// Ver, buscar, agregar, editar, eliminar e IMPORTAR desde Excel.
// ============================================================
window.BaseCorreos = (function () {
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let editandoId = '';
    const DB = () => window.CorreosDB;
    const fechaCorta = v => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('es-PE'); };

    async function abrir() {
        const m = $('modalBaseCorreos'); if (!m) return;
        m.style.display = 'flex'; m.classList.add('active'); document.body.style.overflow = 'hidden';
        $('bcTipo').innerHTML = DB().TIPOS.map(t => `<option>${t}</option>`).join('');
        limpiarForm(); $('bcBuscar').value = '';
        $('bcTabla').innerHTML = '<tr><td colspan="8">Cargando…</td></tr>';
        await DB().cargar(true);
        if (!DB().estaDisponible()) window.toast('⚠️ La base de correos no está activa en el backend: publica el Apps Script actualizado', 'warning');
        pintar();
    }
    function cerrar() {
        const m = $('modalBaseCorreos'); if (m) { m.classList.remove('active'); m.style.display = 'none'; }
        document.body.style.overflow = document.querySelector('.modal.active') ? 'hidden' : '';
    }
    function limpiarForm() {
        editandoId = '';
        ['bcEmail', 'bcNombre', 'bcTrabajador', 'bcArea'].forEach(i => { $(i).value = ''; });
        $('bcTipo').value = 'Otro'; $('bcCampo').value = 'PARA'; $('bcGuardarTxt').textContent = 'Agregar';
    }
    function pintar() {
        const q = ($('bcBuscar').value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        const lista = DB().todos().filter(i => !q || `${i.EMAIL} ${i.NOMBRE} ${i.TRABAJADOR} ${i.AREA} ${i.TIPO}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q))
            .sort((a, b) => b.USOS - a.USOS || a.EMAIL.localeCompare(b.EMAIL));
        $('bcContador').textContent = `${lista.length} correo(s)`;
        $('bcTabla').innerHTML = lista.length ? lista.map(i => `<tr>
            <td>${esc(i.EMAIL)}</td><td>${esc(i.NOMBRE)}</td><td>${esc(i.TRABAJADOR)}</td><td>${esc(i.AREA)}</td><td>${esc(i.TIPO)}</td><td>${esc(i.CAMPO)}</td>
            <td title="Último uso: ${esc(fechaCorta(i.ULTIMO_USO))}">${i.USOS}</td>
            <td>${window.AccionesRegistro.html(i.ID_CORREO, { mostrar: ['editar', 'eliminar'] })}</td></tr>`).join('')
            : '<tr><td colspan="8" style="text-align:center;color:#64748B;">Sin correos. Se llenará con tus envíos o con «Importar Excel».</td></tr>';
        window.AccionesRegistro.enlazar($('bcTabla'), { editar: editar, eliminar: eliminar });
    }
    function editar(id) {
        const i = DB().todos().find(x => x.ID_CORREO === id); if (!i) return;
        editandoId = id; $('bcEmail').value = i.EMAIL; $('bcNombre').value = i.NOMBRE; $('bcTrabajador').value = i.TRABAJADOR;
        $('bcArea').value = i.AREA; $('bcTipo').value = i.TIPO; $('bcCampo').value = i.CAMPO; $('bcGuardarTxt').textContent = 'Actualizar';
        $('bcEmail').focus();
    }
    async function eliminar(id) {
        const i = DB().todos().find(x => x.ID_CORREO === id);
        if (!confirm(`¿Quitar ${i ? i.EMAIL : id} de la base de correos?`)) return;
        const r = await DB().eliminar(id);
        window.toast(r.success ? '🗑️ Correo eliminado de la base' : '❌ ' + (r.message || 'No se pudo eliminar'), r.success ? 'success' : 'error');
        pintar();
    }
    async function guardar() {
        const email = ($('bcEmail').value || '').trim();
        if (!DB().esValido(email)) { window.toast('⚠️ Escribe un correo válido', 'warning'); return; }
        const trabTxt = $('bcTrabajador').value.trim();
        const lista = (window.API && window.API.getDatos && window.API.getDatos()) || [];
        const p = trabTxt ? lista.find(x => DB().nombrePersonal(x).toLowerCase() === trabTxt.toLowerCase() || String(x.ID_PERSONAL) === trabTxt) : null;
        const reg = { EMAIL: email, NOMBRE: $('bcNombre').value.trim(), TRABAJADOR: p ? DB().nombrePersonal(p) : trabTxt, CODE: p ? String(p.CODE || '') : '',
            ID_PERSONAL: p ? String(p.ID_PERSONAL || '') : '', AREA: $('bcArea').value.trim() || (p ? DB().areaDe(p) : ''), TIPO: $('bcTipo').value, CAMPO: $('bcCampo').value };
        if (editandoId) reg.ID_CORREO = editandoId;
        const r = await DB().guardar(reg);
        window.toast(r.success ? '✅ ' + (r.message || 'Guardado') : '❌ ' + (r.message || 'No se pudo guardar'), r.success ? 'success' : 'error');
        if (r.success) { limpiarForm(); pintar(); }
    }
    async function importar(input) {
        const f = input.files && input.files[0]; input.value = ''; if (!f) return;
        try {
            window.toast('⏳ Leyendo Excel…', 'info');
            const r = await DB().leerExcel(f);
            if (!r.items.length) { window.toast(`⚠️ No se encontraron correos válidos (${r.total} fila(s) leída(s)). Revisa que haya una columna «Correo».`, 'warning'); return; }
            if (!confirm(`Se importarán ${r.items.length} correo(s) desde ${r.total} fila(s)` + (r.invalidos ? ` (${r.invalidos} dato(s) omitido(s) por no ser válidos)` : '') + '.\nLos que ya existen se actualizan, sin duplicar.\n\n¿Continuar?')) return;
            const res = await DB().importarItems(r.items);
            window.toast(res.success ? `✅ Importación: ${res.nuevos} nuevo(s), ${res.actualizados} actualizado(s)` : '❌ ' + (res.message || 'Falló la importación'), res.success ? 'success' : 'error');
            pintar();
        } catch (e) { window.toast('❌ ' + e.message, 'error'); }
    }
    return { abrir, cerrar, pintar, guardar, importar, limpiarForm };
})();

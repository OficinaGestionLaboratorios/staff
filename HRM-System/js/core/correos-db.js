// ============================================================
// CORREOS-DB.JS — Base de datos de correos (persistente en BD_CORREOS)
// ============================================================
// Capa frontend de la hoja BD_CORREOS del backend (Codigo_Correos.gs).
// NO usa localStorage como base de datos: todo se guarda en Google
// Sheets vía Apps Script. En memoria solo se conserva una copia de la
// sesión para que el autocompletado sea instantáneo.
//
//   cargar()            → trae la base (una vez por sesión; force = refrescar)
//   propuesta()         → destinatarios sugeridos para un trabajador/módulo
//   buscar()            → autocompletado por correo, nombre, trabajador o área
//   registrarEnvio()    → guarda los destinatarios de un envío real
//   importarExcel()     → lee un .xlsx/.xls/.csv y lo sube a la base
//   guardar/eliminar    → alta, edición y baja manual (administrador de correos)
//
// Si el backend aún no fue republicado (acción desconocida), todo
// degrada en silencio: el modal de correo sigue funcionando sin la base.
// ============================================================
window.CorreosDB = (function () {
    let items = [];
    let cargado = false;
    let promesa = null;
    let disponible = true;      // false si el backend no reconoce las acciones nuevas
    let ultimoError = '';

    const RE_EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
    const norm = e => String(e || '').trim().toLowerCase();
    const sinTildes = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const esValido = e => RE_EMAIL.test(String(e || '').trim());

    // ---------- Utilidades de texto ----------

    // "Ana <ana@x.com>; luis@x.com\njuan@x.com" → ['ana@x.com','luis@x.com','juan@x.com'] (sin duplicados)
    function extraerEmails(texto) {
        const vistos = new Set(), out = [];
        String(texto || '').split(/[\n\r,;]+/).forEach(parte => {
            const m = parte.match(/<([^>]+)>/);
            const cand = (m ? m[1] : parte).trim();
            if (!cand) return;
            const e = norm(cand);
            if (esValido(e) && !vistos.has(e)) { vistos.add(e); out.push(e); }
        });
        return out;
    }

    // Fragmentos NO vacíos que no son direcciones válidas (para avisar antes de enviar).
    function fragmentosInvalidos(texto) {
        return String(texto || '').split(/[\n\r,;]+/).map(s => s.trim()).filter(Boolean)
            .filter(parte => { const m = parte.match(/<([^>]+)>/); return !esValido(m ? m[1] : parte); });
    }

    function nombrePersonal(p) {
        if (!p) return '';
        return [p.NOMBRES, p.APE_PATERNO, p.APE_MATERNO].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    }
    // Área del trabajador (para asociar y filtrar contactos de área).
    function areaDe(p) { return String((p && (p.PROGRAMA || p.TIPO_LABORATORIO)) || '').trim(); }
    function correoDe(p) { const e = String((p && p.EMAIL_INSTITUCIONAL) || '').trim(); return esValido(e) ? norm(e) : ''; }
    function listaPersonal() { try { return (window.API && window.API.getDatos && window.API.getDatos()) || []; } catch (e) { return []; } }

    // ---------- Carga ----------

    async function cargar(force) {
        if (cargado && !force) return items;
        if (promesa && !force) return promesa;
        promesa = (async () => {
            try {
                const r = await window.AUTH.request(window.API_URL + '?action=listCorreos');
                if (r.success && Array.isArray(r.data)) { items = r.data; cargado = true; disponible = true; ultimoError = ''; }
                else {
                    ultimoError = r.message || 'No se pudo leer la base de correos';
                    if (/no reconocida/i.test(ultimoError)) disponible = false;
                }
            } catch (e) { ultimoError = e.message || String(e); }
            promesa = null;
            return items;
        })();
        return promesa;
    }

    function precargar() { cargar(false).catch(() => {}); }

    // ---------- Propuesta de destinatarios ----------

    const ordenar = (a, b) => (b.USOS - a.USOS) || String(b.ULTIMO_USO || '').localeCompare(String(a.ULTIMO_USO || '')) || String(a.EMAIL).localeCompare(String(b.EMAIL));
    const tieneModulo = (it, modulo) => !!modulo && String(it.MODULOS || '').split(',').map(s => s.trim()).includes(modulo);

    // personal: trabajador al que corresponde el envío. correoTrabajador: opcional (si el módulo ya lo calculó).
    // Devuelve { para:[emails], cc:[emails], sugeridos:[{email,nombre,detalle,campo}] }
    //   · primera línea de «para» = correo institucional del trabajador (si existe)
    //   · después, correos asociados al trabajador (de envíos del mismo módulo, responsables/jefaturas
    //     o importados) y contactos del área
    //   · el resto (otros usados con el trabajador y los más frecuentes) queda como «sugeridos»
    function propuesta(personal, modulo, correoTrabajador) {
        const code = String((personal && personal.CODE) || '');
        const area = areaDe(personal);
        const trab = norm(correoTrabajador) && esValido(correoTrabajador) ? norm(correoTrabajador) : correoDe(personal);
        const usados = new Set(trab ? [trab] : []);
        const para = trab ? [trab] : [], cc = [], sugeridos = [];

        const asociados = items.filter(i => code && String(i.CODE) === code && norm(i.EMAIL) !== trab).sort(ordenar);
        const deArea = items.filter(i => !i.CODE && area && sinTildes(i.AREA) === sinTildes(area)).sort(ordenar);

        const autoIncluir = i => i.TIPO !== 'Otro' || i.ORIGEN === 'IMPORTACION' || tieneModulo(i, modulo);
        const colocar = (i, auto) => {
            const e = norm(i.EMAIL);
            if (!e || usados.has(e)) return;
            usados.add(e);
            if (auto) (i.CAMPO === 'CC' ? cc : para).push(e);
            else sugeridos.push({ email: e, nombre: i.NOMBRE || i.TRABAJADOR || '', detalle: detalleItem(i), campo: i.CAMPO || 'PARA' });
        };
        asociados.forEach(i => colocar(i, autoIncluir(i)));
        deArea.forEach(i => colocar(i, true));

        // Más frecuentes de la base (excluye correos de otros trabajadores)
        items.filter(i => i.TIPO !== 'Trabajador' && i.USOS > 0).sort(ordenar).slice(0, 10).forEach(i => colocar(i, false));
        return { para, cc, sugeridos: sugeridos.slice(0, 12) };
    }

    function detalleItem(i) {
        const partes = [];
        if (i.TIPO && i.TIPO !== 'Otro') partes.push(i.TIPO);
        if (i.TRABAJADOR) partes.push(i.TRABAJADOR);
        if (i.AREA) partes.push(i.AREA);
        if (i.USOS) partes.push(`${i.USOS} envío${i.USOS === 1 ? '' : 's'}`);
        return partes.join(' · ');
    }

    // ---------- Autocompletado ----------

    // Busca por correo, nombre, trabajador o área (cada palabra escrita debe aparecer).
    // También sugiere correos institucionales de la lista de Personal (por nombre).
    function buscar(texto, opciones) {
        const o = opciones || {}, limite = o.limite || 8;
        const excluir = new Set((o.excluir || []).map(norm));
        const q = sinTildes(texto);
        if (q.length < 2) return [];
        const tokens = q.split(' ').filter(Boolean);
        const candidatos = new Map();

        const agregar = (email, nombre, detalle, puntaje) => {
            const e = norm(email);
            if (!esValido(e) || excluir.has(e)) return;
            const pajar = sinTildes(`${e} ${nombre} ${detalle}`);
            if (!tokens.every(t => pajar.includes(t))) return;
            const bonus = e.startsWith(q) ? 50 : (sinTildes(nombre).startsWith(q) ? 30 : 0);
            const previo = candidatos.get(e);
            const total = puntaje + bonus;
            if (!previo || total > previo.puntaje) candidatos.set(e, { email: e, nombre, detalle, puntaje: total });
        };
        items.forEach(i => agregar(i.EMAIL, i.NOMBRE || i.TRABAJADOR || '', detalleItem(i) + ' ' + (i.AREA || ''), 10 + Math.min(i.USOS, 20)));
        listaPersonal().forEach(p => {
            const e = correoDe(p);
            if (e) agregar(e, nombrePersonal(p), ['Trabajador', areaDe(p)].filter(Boolean).join(' · '), 5);
        });
        return Array.from(candidatos.values()).sort((a, b) => b.puntaje - a.puntaje || a.email.localeCompare(b.email)).slice(0, limite);
    }

    // ---------- Historial de envíos ----------

    async function registrarEnvio({ para, cc, personal, modulo }) {
        if (!disponible) return { success: false, message: ultimoError };
        const trab = correoDe(personal);
        const armar = (lista, campo) => (lista || []).map(email => ({ email, campo, tipo: email === trab ? 'Trabajador' : '' }));
        const destinatarios = armar(para, 'PARA').concat(armar(cc, 'CC'));
        if (!destinatarios.length) return { success: true };
        const url = window.API_URL + '?action=registrarCorreosUso&key=' + encodeURIComponent(window.API_KEY);
        const r = await window.AUTH.requestPost(url, {
            DESTINATARIOS_JSON: JSON.stringify(destinatarios),
            CODE: (personal && personal.CODE) || '', ID_PERSONAL: (personal && personal.ID_PERSONAL) || '',
            TRABAJADOR: nombrePersonal(personal), AREA: areaDe(personal), MODULO: modulo || ''
        });
        if (r.success) { cargado = false; cargar(true).catch(() => {}); }
        else if (/no reconocida/i.test(r.message || '')) disponible = false;
        return r;
    }

    // ---------- Alta / edición / baja manual ----------

    async function guardar(reg) {
        const url = window.API_URL + '?action=saveCorreo&key=' + encodeURIComponent(window.API_KEY);
        const r = await window.AUTH.requestPost(url, reg);
        if (r.success) await cargar(true);
        return r;
    }

    async function eliminar(idCorreo) {
        const url = window.API_URL + '?action=deleteCorreo&key=' + encodeURIComponent(window.API_KEY) + '&ID_CORREO=' + encodeURIComponent(idCorreo);
        const r = await window.AUTH.request(url);
        if (r.success) await cargar(true);
        return r;
    }

    // ---------- Importación desde Excel ----------

    const ALIAS = {
        email: ['correo', 'correo electronico', 'email', 'e-mail', 'mail', 'correo institucional', 'direccion de correo'],
        nombre: ['nombre', 'contacto', 'destinatario', 'responsable', 'nombre contacto'],
        trabajador: ['trabajador', 'personal', 'colaborador', 'empleado', 'apellidos y nombres'],
        id: ['id_personal', 'id personal', 'idpersonal', 'id'],
        dni: ['dni', 'documento'],
        area: ['area', 'programa', 'laboratorio', 'oficina', 'dependencia', 'unidad', 'programa de estudio'],
        tipo: ['tipo', 'rol', 'relacion', 'cargo'],
        campo: ['campo', 'para/cc', 'copia', 'cc', 'envio', 'enviar como']
    };

    function inferirTipo(texto) {
        const t = sinTildes(texto);
        if (/jef/.test(t)) return 'Jefatura';
        if (/respons|coordin/.test(t)) return 'Responsable';
        if (/area|oficina|unidad|programa/.test(t)) return 'Área';
        if (/trabaj|institucional|colabor|person|empleado/.test(t)) return 'Trabajador';
        return '';
    }

    function buscarPersonal({ id, dni, trabajador, email }) {
        const lista = listaPersonal();
        if (id) { const p = lista.find(x => String(x.ID_PERSONAL).trim() === String(id).trim()); if (p) return p; }
        if (dni) { const p = lista.find(x => String(x.DNI).trim() === String(dni).trim()); if (p) return p; }
        if (email) { const p = lista.find(x => correoDe(x) === norm(email)); if (p) return p; }
        if (trabajador) {
            const q = sinTildes(trabajador).replace(/\(.*?\)/g, '').trim();
            const p = lista.find(x => sinTildes(nombrePersonal(x)) === q || sinTildes(`${x.APE_PATERNO || ''} ${x.APE_MATERNO || ''} ${x.NOMBRES || ''}`) === q);
            if (p) return p;
        }
        return null;
    }

    // filas: arreglo de objetos {encabezado: valor} (una hoja de Excel). Devuelve { items, invalidos }.
    function mapearFilas(filas) {
        const out = [];
        let invalidos = 0;
        (filas || []).forEach(fila => {
            const claves = Object.keys(fila);
            const porAlias = (lista) => { const k = claves.find(c => lista.includes(sinTildes(c))); return k ? String(fila[k] ?? '').trim() : ''; };
            const id = porAlias(ALIAS.id), dni = porAlias(ALIAS.dni), trabajador = porAlias(ALIAS.trabajador);
            const nombre = porAlias(ALIAS.nombre), area = porAlias(ALIAS.area);
            const tipoCol = porAlias(ALIAS.tipo), campoCol = porAlias(ALIAS.campo);
            // Todas las columnas cuyo encabezado menciona correo/mail producen un contacto
            const colsCorreo = claves.filter(c => /correo|e-?mail|mail/.test(sinTildes(c)));
            if (!colsCorreo.length) { invalidos++; return; }
            let alguno = false;
            colsCorreo.forEach(col => {
                extraerEmailsConInvalidos(fila[col]).forEach(r => {
                    if (!r.ok) { invalidos++; return; }
                    alguno = true;
                    const tipoInferido = inferirTipo(col);
                    const tipo = CATALOGO_TIPOS.includes(tipoCol) ? tipoCol : (inferirTipo(tipoCol) || tipoInferido || 'Otro');
                    const p = buscarPersonal({ id, dni, trabajador, email: tipo === 'Trabajador' || !trabajador ? r.email : '' });
                    const esDelTrabajador = p && correoDe(p) === r.email;
                    out.push({
                        email: r.email,
                        nombre: nombre || (esDelTrabajador ? nombrePersonal(p) : ''),
                        code: p ? String(p.CODE || '') : '',
                        id_personal: p ? String(p.ID_PERSONAL || '') : id,
                        trabajador: p ? nombrePersonal(p) : trabajador,
                        area: area || (p ? areaDe(p) : ''),
                        tipo: esDelTrabajador ? 'Trabajador' : tipo,
                        campo: /^cc/i.test(sinTildes(campoCol)) || /copia|cc/.test(sinTildes(campoCol)) ? 'CC' : 'PARA'
                    });
                });
            });
            if (!alguno && !colsCorreo.some(c => String(fila[c] || '').trim())) invalidos++;
        });
        return { items: out, invalidos };
    }
    const CATALOGO_TIPOS = ['Trabajador', 'Responsable', 'Jefatura', 'Área', 'Otro'];

    function extraerEmailsConInvalidos(valor) {
        return String(valor ?? '').split(/[\n\r,;]+/).map(s => s.trim()).filter(Boolean).map(parte => {
            const m = parte.match(/<([^>]+)>/); const cand = norm(m ? m[1] : parte);
            return { ok: esValido(cand), email: cand };
        });
    }

    function leerArchivo(file) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(new Error('No se pudo leer el archivo'));
            fr.readAsArrayBuffer(file);
        });
    }

    // Lee TODAS las hojas del libro y devuelve { items, invalidos, total }.
    async function leerExcel(file) {
        if (typeof XLSX === 'undefined' || !XLSX.read) throw new Error('No se pudo cargar la librería de Excel (XLSX). Revisa tu conexión.');
        const wb = XLSX.read(await leerArchivo(file), { type: 'array' });
        let filas = [];
        wb.SheetNames.forEach(n => { filas = filas.concat(XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: false })); });
        const r = mapearFilas(filas);
        // Quita duplicados dentro del propio archivo (mismo correo + mismo trabajador)
        const vistos = new Set();
        r.items = r.items.filter(i => { const k = i.email + '|' + i.code; if (vistos.has(k)) return false; vistos.add(k); return true; });
        return { items: r.items, invalidos: r.invalidos, total: filas.length };
    }

    // Sube los items a la base en lotes (el backend evita duplicados por correo + trabajador).
    async function importarItems(lista) {
        const resumen = { nuevos: 0, actualizados: 0, omitidos: 0 };
        const url = window.API_URL + '?action=importarCorreos&key=' + encodeURIComponent(window.API_KEY);
        for (let i = 0; i < lista.length; i += 150) {
            const r = await window.AUTH.requestPost(url, { ITEMS_JSON: JSON.stringify(lista.slice(i, i + 150)) });
            if (!r.success) return { success: false, message: r.message, ...resumen };
            ['nuevos', 'actualizados', 'omitidos'].forEach(k => { resumen[k] += (r.data && r.data[k]) || 0; });
        }
        await cargar(true);
        return { success: true, ...resumen };
    }

    // Plantilla descargable para quien prefiera preparar el Excel a mano.
    function descargarPlantilla() {
        if (typeof XLSX === 'undefined' || !XLSX.utils) { window.toast('⚠️ No se pudo cargar la librería de Excel', 'warning'); return; }
        const filas = [
            ['Correo', 'Nombre', 'ID_PERSONAL', 'Trabajador', 'Área', 'Tipo', 'Campo'],
            ['ejemplo.trabajador@upao.edu.pe', 'Nombre del contacto', 'P001', '', 'Programa o área', 'Trabajador', 'PARA'],
            ['jefatura@upao.edu.pe', 'Jefe del área', '', '', 'Programa o área', 'Jefatura', 'CC']
        ];
        const ws = XLSX.utils.aoa_to_sheet(filas);
        ws['!cols'] = [{ wch: 34 }, { wch: 26 }, { wch: 14 }, { wch: 26 }, { wch: 26 }, { wch: 14 }, { wch: 10 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Correos');
        XLSX.writeFile(wb, 'plantilla_base_correos.xlsx');
    }

    return {
        cargar, precargar, propuesta, buscar, registrarEnvio, guardar, eliminar,
        leerExcel, importarItems, descargarPlantilla, mapearFilas,
        extraerEmails, fragmentosInvalidos, esValido, nombrePersonal, areaDe, correoDe,
        todos: () => items.slice(),
        estaDisponible: () => disponible,
        ultimoError: () => ultimoError,
        TIPOS: CATALOGO_TIPOS
    };
})();

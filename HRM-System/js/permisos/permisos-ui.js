// ============================================================
// PERMISOS-UI.JS — Renderizado y manipulación del DOM del modal
// ============================================================
// Mismo criterio que sobretiempo-ui.js: todo lo que lee/escribe el
// DOM del módulo Permisos vive aquí. permisos.js decide QUÉ hacer;
// este archivo decide CÓMO pintarlo.
//
// Reutiliza a propósito las clases CSS .sobretiempo-tipo-opcion /
// .sobretiempo-tipo-opciones (son puramente visuales — un chip de
// radio button — y ya existen en css/styles.css), así no hace
// falta agregar CSS nuevo para las 6 opciones de "Clase de permiso".
// ============================================================

window.PermisosUI = (function() {
    const M = window.PermisosModel;

    // ---- Panel "Boletas registradas de este empleado" ----

    function renderLista(registros, idActivo) {
        const wrap = document.getElementById('permisosListaWrap');
        const cont = document.getElementById('permisosLista');
        if (!wrap || !cont) return;

        if (!registros || registros.length === 0) {
            wrap.style.display = 'none';
            cont.innerHTML = '';
            return;
        }

        wrap.style.display = 'block';
        cont.innerHTML = registros.map(r => {
            const info = M.ESTADO_INFO[r.ESTADO] || M.ESTADO_INFO['Programado'];
            const activo = r.ID_PERMISO === idActivo;
            return `
                <div class="horario-grupo-item ${activo ? 'activo' : ''}" data-id-permiso="${window.esc(r.ID_PERMISO)}">
                    <div class="horario-grupo-info">
                        <span class="horario-grupo-id">${window.esc(r.ID_PERMISO)}</span>
                        <span class="badge-estado ${info.clase}"><i class="fas ${info.icono}"></i> ${window.esc(r.ESTADO)}</span>
                        <span class="horario-grupo-vigencia">${window.esc(r.CLASE_PERMISO)} · ${window.esc(M.fechaATextoLegible(r.FECHA_PERMISO))}</span>
                        <span class="horario-grupo-horas">${window.esc(r.HORA_SALIDA)}-${window.esc(r.HORA_RETORNO)} · ${window.esc(r.DURACION_TOTAL || '0')}h</span>
                    </div>
                    <div class="horario-grupo-acciones">
                        <button type="button" class="btn-chip" data-accion="editar-permiso" data-id="${window.esc(r.ID_PERMISO)}"><i class="fas fa-pen"></i> Editar</button>
                        <button type="button" class="btn-chip btn-chip-blue" data-accion="exportar-permiso" data-id="${window.esc(r.ID_PERMISO)}" title="Exportar boleta (2 copias)"><i class="fas fa-file-excel"></i> Exportar</button>
                        <button type="button" class="btn-chip btn-chip-danger" data-accion="eliminar-permiso" data-id="${window.esc(r.ID_PERMISO)}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ---- Formulario ----

    function leer() {
        const claseEl = document.querySelector('input[name="permisoClase"]:checked');
        return {
            funcionarioExpide: document.getElementById('permisoFuncionarioExpide')?.value || '',
            cargoFuncionario: document.getElementById('permisoCargoFuncionario')?.value || '',
            dependencia: document.getElementById('permisoDependencia')?.value || '',
            fechaPermiso: document.getElementById('permisoFecha')?.value || '',
            horaSalida: document.getElementById('permisoHoraSalida')?.value || '',
            horaRetorno: document.getElementById('permisoHoraRetorno')?.value || '',
            motivoSalida: document.getElementById('permisoMotivo')?.value || '',
            clasePermiso: claseEl ? claseEl.value : '',
            otraEspecificar: document.getElementById('permisoOtraEspecificar')?.value || '',
            lugarDestino: document.getElementById('permisoLugarDestino')?.value || '',
            capacitacionDetalle: document.getElementById('permisoCapacitacionDetalle')?.value || ''
        };
    }

    function pintar(registro) {
        pintarFuncionario(registro.FUNCIONARIO_EXPIDE, registro.CARGO_FUNCIONARIO);
        // DEPENDENCIA es un valor fijo (ver permisos.js): se ignora lo
        // que traiga el registro y se deja siempre la constante.
        document.getElementById('permisoDependencia').value = 'OFICINA DE GESTIÓN DE LABORATORIO- OGL';
        document.getElementById('permisoFecha').value = registro.FECHA_PERMISO || '';
        document.getElementById('permisoHoraSalida').value = registro.HORA_SALIDA || '';
        document.getElementById('permisoHoraRetorno').value = registro.HORA_RETORNO || '';
        document.getElementById('permisoMotivo').value = registro.MOTIVO_SALIDA || '';
        document.querySelectorAll('input[name="permisoClase"]').forEach(r => {
            r.checked = (r.value === registro.CLASE_PERMISO);
        });
        document.getElementById('permisoOtraEspecificar').value = registro.OTRA_ESPECIFICAR || '';
        document.getElementById('permisoLugarDestino').value = registro.LUGAR_DESTINO || '';
        document.getElementById('permisoCapacitacionDetalle').value = registro.CAPACITACION_DETALLE || '';

        sincronizarClaseChips();
        actualizarCamposCondicionales();
        actualizarDuracion();
    }

    function limpiar() {
        // El "funcionario que expide" (y su Cargo, que depende de él)
        // NO se limpian a propósito: suelen repetirse entre boletas
        // seguidas de la misma sesión (el usuario logueado registrando
        // varias boletas seguidas).
        ['permisoFecha', 'permisoHoraSalida', 'permisoHoraRetorno',
         'permisoMotivo', 'permisoOtraEspecificar', 'permisoLugarDestino', 'permisoCapacitacionDetalle'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.querySelectorAll('input[name="permisoClase"]').forEach(r => r.checked = false);

        sincronizarClaseChips();
        actualizarCamposCondicionales();
        actualizarDuracion();
        mostrarError('');
    }

    function mostrarError(texto) {
        const msg = document.getElementById('permisoMsgValidacion');
        if (msg) msg.textContent = texto;
    }

    function setModo(editando) {
        const titulo = document.getElementById('permisoFormTitulo');
        const btnTexto = document.getElementById('permisoBtnTexto');
        const btnEliminar = document.getElementById('permisoBtnEliminar');
        if (titulo) titulo.textContent = editando ? 'Editar boleta de permiso' : 'Nueva boleta de permiso';
        if (btnTexto) btnTexto.textContent = editando ? 'Actualizar boleta' : 'Guardar boleta';
        if (btnEliminar) btnEliminar.style.display = editando ? 'inline-flex' : 'none';
    }

    // ---- Selector de "Funcionario que la expide" ----
    // 2 nombres predefinidos (autocompletan el Cargo y lo dejan de
    // solo lectura) + "Otro" (permite escribir nombre y cargo
    // libremente). El input de texto #permisoFuncionarioExpide sigue
    // siendo la fuente de verdad que lee leer() — el <select> solo
    // lo controla; así no hace falta tocar leer()/construirPayload.
    function seleccionarFuncionario() {
        const select = document.getElementById('permisoFuncionarioSelect');
        const nombreInput = document.getElementById('permisoFuncionarioExpide');
        const cargoInput = document.getElementById('permisoCargoFuncionario');
        if (!select || !nombreInput || !cargoInput) return;

        if (select.value === '__otro__') {
            nombreInput.style.display = 'block';
            nombreInput.value = '';
            nombreInput.focus();
            cargoInput.value = '';
            cargoInput.readOnly = false;
        } else if (select.value) {
            nombreInput.style.display = 'none';
            nombreInput.value = select.value;
            cargoInput.value = M.FUNCIONARIOS_PREDEFINIDOS[select.value] || '';
            cargoInput.readOnly = true;
        } else {
            nombreInput.style.display = 'none';
            nombreInput.value = '';
            cargoInput.value = '';
            cargoInput.readOnly = true;
        }
    }

    // Reconstruye el estado del selector a partir de un nombre ya
    // guardado (al editar una boleta, o al sugerir el usuario de
    // sesión): si coincide con uno de los predefinidos, lo
    // selecciona y bloquea el cargo; si no, cae en "Otro" con el
    // nombre y cargo escritos a mano.
    function pintarFuncionario(nombre, cargo) {
        const select = document.getElementById('permisoFuncionarioSelect');
        const nombreInput = document.getElementById('permisoFuncionarioExpide');
        const cargoInput = document.getElementById('permisoCargoFuncionario');
        if (!select || !nombreInput || !cargoInput) return;

        if (nombre && M.FUNCIONARIOS_PREDEFINIDOS[nombre] !== undefined) {
            select.value = nombre;
            nombreInput.style.display = 'none';
            nombreInput.value = nombre;
            cargoInput.value = cargo || M.FUNCIONARIOS_PREDEFINIDOS[nombre];
            cargoInput.readOnly = true;
        } else if (nombre) {
            select.value = '__otro__';
            nombreInput.style.display = 'block';
            nombreInput.value = nombre;
            cargoInput.value = cargo || '';
            cargoInput.readOnly = false;
        } else {
            select.value = '';
            nombreInput.style.display = 'none';
            nombreInput.value = '';
            cargoInput.value = '';
            cargoInput.readOnly = true;
        }
    }

    // ---- Chips seleccionables de "Clase de permiso" ----
    let claseChipsListo = false;
    function inicializarClaseChips() {
        if (claseChipsListo) return;
        const cont = document.getElementById('permisoClaseOpciones');
        if (!cont) return;
        cont.addEventListener('change', () => {
            sincronizarClaseChips();
            actualizarCamposCondicionales();
        });
        claseChipsListo = true;
    }
    function sincronizarClaseChips() {
        const cont = document.getElementById('permisoClaseOpciones');
        if (!cont) return;
        cont.querySelectorAll('.sobretiempo-tipo-opcion').forEach(label => {
            const radio = label.querySelector('input[type="radio"]');
            label.classList.toggle('checked', !!radio?.checked);
        });
    }

    // Muestra/oculta "Especificar", "Lugar de destino" y "Detalle de
    // capacitación" según la clase marcada — igual que en la boleta en
    // papel, donde esos campos solo aplican a "Otra", "Comisión de
    // Servicio" y "Capacitación" respectivamente.
    function actualizarCamposCondicionales() {
        const claseEl = document.querySelector('input[name="permisoClase"]:checked');
        const clase = claseEl ? claseEl.value : '';
        const grupoOtra = document.getElementById('permisoGrupoOtra');
        const grupoDestino = document.getElementById('permisoGrupoDestino');
        const grupoCapacitacion = document.getElementById('permisoGrupoCapacitacion');
        if (grupoOtra) grupoOtra.style.display = clase === 'Otra' ? 'block' : 'none';
        if (grupoDestino) grupoDestino.style.display = clase === 'Comisión de Servicio' ? 'block' : 'none';
        if (grupoCapacitacion) grupoCapacitacion.style.display = clase === 'Capacitación' ? 'block' : 'none';
    }

    function actualizarDuracion() {
        const horaSalida = document.getElementById('permisoHoraSalida')?.value || '';
        const horaRetorno = document.getElementById('permisoHoraRetorno')?.value || '';
        const el = document.getElementById('permisoDuracionTotal');
        if (el) el.textContent = (horaSalida && horaRetorno) ? M.calcularDuracion(horaSalida, horaRetorno) + ' h' : '—';
    }

    return {
        renderLista, leer, pintar, limpiar, mostrarError, setModo,
        seleccionarFuncionario, pintarFuncionario,
        inicializarClaseChips, sincronizarClaseChips, actualizarCamposCondicionales, actualizarDuracion
    };
})();

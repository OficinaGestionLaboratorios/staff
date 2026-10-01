// ============================================================
// PORTAL-PERSONAL.JS — Acceso individual, revisión y edición de
// "Mis datos personales".
// ============================================================
// Página independiente: no depende de js/core/auth.js ni de app.js
// (esos son del panel administrativo). Habla directamente con las
// acciones loginPersonal / misDatos / actualizarMisDatos /
// logoutPersonal del backend (Codigo_PortalPersonal.gs).
//
// La sesión vive en sessionStorage bajo una clave propia
// (PORTAL_STORAGE_KEY), separada de "staffHubSesion" que usa el panel
// admin, para que ambas páginas puedan convivir sin pisarse.
// ============================================================

// Debe coincidir con la URL publicada del Apps Script (misma que
// js/api.js del panel admin) y con la API_KEY del backend.
const PORTAL_API_URL = 'https://script.google.com/macros/s/AKfycbyjHYUKCQ20ZeBC1IublSmZiym8qBYcwOTRiGwf7XiLl9kFPtV1hdxNqybwImCFzk1K/exec';
const PORTAL_API_KEY = 'wleong';
const PORTAL_STORAGE_KEY = 'portalPersonalSesion';

let sesionPortal = null; // { token, nombre, expiraEn }
let datosOriginales = null; // último "campos" recibido del backend
let etiquetasCampos = {};
let camposEditables = [];

// ---- Utilidades ----

function $(id) { return document.getElementById(id); }

function mostrarToast(mensaje, tipo = '') {
  const el = $('toast');
  el.textContent = mensaje;
  el.className = 'portal-toast show ' + tipo;
  clearTimeout(mostrarToast._t);
  mostrarToast._t = setTimeout(() => { el.className = 'portal-toast'; }, 3500);
}

function cargarSesionDeStorage() {
  try {
    const raw = sessionStorage.getItem(PORTAL_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.token || !s.expiraEn || Date.now() >= s.expiraEn) {
      sessionStorage.removeItem(PORTAL_STORAGE_KEY);
      return null;
    }
    return s;
  } catch (e) {
    return null;
  }
}

function guardarSesion(s) {
  sesionPortal = s;
  sessionStorage.setItem(PORTAL_STORAGE_KEY, JSON.stringify(s));
}

function limpiarSesion() {
  sesionPortal = null;
  sessionStorage.removeItem(PORTAL_STORAGE_KEY);
}

async function llamarApi(action, params = {}, requiereKey = false) {
  const url = new URL(PORTAL_API_URL);
  url.searchParams.set('action', action);
  if (sesionPortal) url.searchParams.set('token', sesionPortal.token);
  if (requiereKey) url.searchParams.set('key', PORTAL_API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const resp = await fetch(url.toString());
    const texto = await resp.text();
    try {
      return JSON.parse(texto);
    } catch (e) {
      return { success: false, message: 'Respuesta no válida del servidor.' };
    }
  } catch (e) {
    return { success: false, message: 'No se pudo conectar con el servidor. Verifica tu conexión.' };
  }
}

function manejarSesionExpirada(mensaje) {
  limpiarSesion();
  mostrarVista('vistaLogin');
  if (mensaje) mostrarToast(mensaje, 'error');
}

// ---- Navegación entre las 3 pantallas ----

function mostrarVista(id) {
  ['vistaLogin', 'vistaDatos', 'vistaConfirmacion'].forEach(v => {
    $(v).style.display = (v === id) ? '' : 'none';
  });
}

// ---- Pantalla 1: Login ----

$('formLogin').addEventListener('submit', async function (e) {
  e.preventDefault();
  const idPersonal = $('inputIdPersonal').value.trim();
  const dni = $('inputDni').value.trim();
  const errorEl = $('loginError');
  const btn = $('btnLogin');

  errorEl.textContent = '';
  if (!idPersonal || !dni) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';

  const result = await llamarApi('loginPersonal', { idPersonal, dni });

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';

  if (!result.success) {
    // Mensaje genérico también en el frontend: nunca distinguir cuál
    // de los dos campos falló.
    errorEl.textContent = result.message || 'Usuario o clave incorrectos.';
    return;
  }

  guardarSesion({
    token: result.data.token,
    nombre: result.data.nombre,
    expiraEn: Date.now() + (result.data.expiraEnSegundos || 1800) * 1000
  });

  $('inputDni').value = '';
  await cargarMisDatos();
});

// ---- Pantalla 2: Mis datos ----

async function cargarMisDatos() {
  const result = await llamarApi('misDatos');

  if (!result.success) {
    manejarSesionExpirada(result.message);
    return;
  }

  datosOriginales = result.data.campos;
  etiquetasCampos = result.data.etiquetas || {};
  camposEditables = result.data.editables || [];

  $('saludoUsuario').textContent = 'Hola, ' + (sesionPortal.nombre || '');
  pintarBadgeEstado(result.data.estado);
  pintarCampos(datosOriginales);

  mostrarVista('vistaDatos');
}

function pintarBadgeEstado(estado) {
  const badge = $('badgeEstado');
  const mapa = {
    PENDIENTE: { texto: 'Pendiente de revisión', clase: 'pendiente' },
    ACTUALIZADO: { texto: 'Actualizado', clase: 'actualizado' },
    MODIFICADO: { texto: 'Modificado', clase: 'modificado' }
  };
  const info = mapa[estado] || mapa.PENDIENTE;
  badge.textContent = info.texto;
  badge.className = 'portal-badge ' + info.clase;
}

// Orden de exhibición en el formulario (agrupa lo editable primero
// para que el trabajador lo encuentre rápido, luego lo protegido).
// Incluye TODOS los campos posibles: cuáles de ellos llegan realmente
// (result.data.campos) depende de la configuración Editar/Visible
// que el administrador define desde el ícono de ajustes ⚙️ del panel
// (ver getConfigCamposPortal / BD_CONFIG_CAMPOS_PORTAL en el backend)
// — pintarCampos() ya ignora cualquier campo que no venga en la
// respuesta, así que un campo que hoy está "No Visible" simplemente
// no aparece, sin tener que tocar esta lista.
const ORDEN_CAMPOS_VISTA = [
  'APE_PATERNO', 'APE_MATERNO', 'NOMBRES', 'FEC_NACIMIENTO', 'DNI',
  'TELEFONO', 'DIRECCION', 'PROFESION', 'EMAIL_INSTITUCIONAL',
  'CODE', 'ID_PERSONAL', 'SEXO', 'PROGRAMA', 'CARGO',
  'LUGAR_TRABAJO', 'TIPO_CONTRATO', 'TIPO_LABORATORIO',
  'FECHA_VINCULACION', 'INICIO_PERIODO', 'CESE_PERIODO', 'CANT_PERIODO'
];

// Campos de fecha en este formulario: el backend ya los entrega y
// espera siempre en formato dd/mm/aaaa (ver CAMPOS_FECHA_PORTAL en
// Codigo_PortalPersonal.gs) — aquí solo se usa para mostrar una pista
// de formato y una validación simple en el campo editable (DNI de
// nacimiento).
const CAMPOS_FECHA_VISTA = ['FEC_NACIMIENTO', 'FECHA_VINCULACION', 'INICIO_PERIODO', 'CESE_PERIODO'];

function pintarCampos(campos) {
  const cont = $('camposContainer');
  cont.innerHTML = '';

  ORDEN_CAMPOS_VISTA.forEach(nombre => {
    if (!(nombre in campos)) return;
    const esEditable = camposEditables.includes(nombre);
    const esFecha = CAMPOS_FECHA_VISTA.includes(nombre);
    const etiqueta = etiquetasCampos[nombre] || nombre;

    const wrap = document.createElement('div');
    wrap.className = 'portal-campo ' + (esEditable ? 'editable' : 'protegido');

    const label = document.createElement('label');
    label.innerHTML = etiqueta + (esEditable
      ? ' <span class="tag-editable">Editable</span>'
      : ' <span class="tag-protegido">Solo lectura</span>');
    label.setAttribute('for', 'campo_' + nombre);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'campo_' + nombre;
    input.value = campos[nombre] || '';
    input.readOnly = !esEditable;
    input.dataset.campo = nombre;
    if (esFecha && esEditable) {
      input.placeholder = 'dd/mm/aaaa';
      input.pattern = '\\d{2}/\\d{2}/\\d{4}';
      input.title = 'Usa el formato dd/mm/aaaa';
    }

    wrap.appendChild(label);
    wrap.appendChild(input);
    cont.appendChild(wrap);
  });
}

function recolectarCambios() {
  const cambios = {};
  camposEditables.forEach(nombre => {
    const input = $('campo_' + nombre);
    if (!input) return;
    cambios[nombre] = input.value.trim();
  });
  return cambios;
}

$('btnGuardar').addEventListener('click', function () {
  $('modalConfirmarGuardado').classList.add('active');
});

$('btnCancelarGuardado').addEventListener('click', function () {
  $('modalConfirmarGuardado').classList.remove('active');
});

$('btnConfirmarGuardado').addEventListener('click', async function () {
  const btn = $('btnConfirmarGuardado');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const cambios = recolectarCambios();
  const result = await llamarApi('actualizarMisDatos', cambios, true);

  btn.disabled = false;
  btn.textContent = 'Guardar cambios';
  $('modalConfirmarGuardado').classList.remove('active');

  if (!result.success) {
    if (/sesión inválida|sesión expirada/i.test(result.message || '')) {
      manejarSesionExpirada(result.message);
    } else {
      mostrarToast(result.message || 'No se pudo guardar la información.', 'error');
    }
    return;
  }

  $('confirmacionMensaje').textContent = result.message || 'Tu información ha sido actualizada correctamente.';
  $('confirmacionFecha').textContent = (result.data && result.data.fecha) || '—';
  $('confirmacionHora').textContent = (result.data && result.data.hora) || '—';
  mostrarVista('vistaConfirmacion');
});

// ---- Cerrar sesión (desde ambas pantallas) ----

async function cerrarSesion() {
  if (sesionPortal) {
    try { await llamarApi('logoutPersonal'); } catch (e) {}
  }
  limpiarSesion();
  $('formLogin').reset();
  mostrarVista('vistaLogin');
}

$('btnCerrarSesion').addEventListener('click', cerrarSesion);
$('btnCerrarSesion2').addEventListener('click', cerrarSesion);

$('btnVolverDatos').addEventListener('click', async function () {
  if (!sesionPortal) { mostrarVista('vistaLogin'); return; }
  await cargarMisDatos();
});

// ---- Arranque ----

(function init() {
  sesionPortal = cargarSesionDeStorage();
  if (sesionPortal) {
    cargarMisDatos();
  } else {
    mostrarVista('vistaLogin');
    setTimeout(() => $('inputIdPersonal')?.focus(), 50);
  }
})();

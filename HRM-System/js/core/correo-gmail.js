// ============================================================
// CORREO-GMAIL.JS — Prepara el correo (todos los módulos) como BORRADOR en el Gmail
// de la cuenta corporativa de quien usa el sistema (Gmail API, permiso gmail.compose)
// y devuelve el enlace para abrirlo ya armado: asunto, cuerpo y adjuntos.
// El sistema NO envía nada: quien usa la plataforma elige destinatarios y envía en Gmail.
// Condición: tener abierta (con sesión iniciada) su cuenta corporativa de Google en el navegador.
// Requiere window.GOOGLE_CLIENT_ID (ver js/api.js).
// ============================================================
window.CorreoGmail = (function () {
    const SCOPES = 'https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/userinfo.email';
    let gisPromise = null, cliente = null, token = null, expira = 0, cuenta = '';

    function disponible() { return !!window.GOOGLE_CLIENT_ID; }

    // Se llama al abrir la vista previa para que el clic en "Enviar" abra el popup sin demoras.
    function precargar() {
        if (!disponible()) return Promise.resolve();
        if (gisPromise) return gisPromise;
        gisPromise = new Promise((resolve, reject) => {
            if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
            s.onload = () => resolve(); s.onerror = () => { gisPromise = null; reject(new Error('No se pudo cargar Google (revisa tu conexión)')); };
            document.head.appendChild(s);
        });
        return gisPromise;
    }

    // Debe invocarse directamente desde un clic (antes de cualquier await largo).
    function obtenerToken(forzarSeleccion) {
        return new Promise((resolve, reject) => {
            if (token && Date.now() < expira - 30000 && !forzarSeleccion) return resolve(token);
            if (!(window.google && window.google.accounts && window.google.accounts.oauth2)) return reject(new Error('Google aún no cargó; intenta de nuevo en un momento'));
            const opts = { client_id: window.GOOGLE_CLIENT_ID, scope: SCOPES, callback: r => {
                if (r.error) return reject(new Error(r.error === 'access_denied' ? 'No autorizaste el envío con tu cuenta de Google' : 'Google: ' + r.error));
                token = r.access_token; expira = Date.now() + (+r.expires_in || 3600) * 1000; resolve(token);
            }, error_callback: e => reject(new Error(e && e.type === 'popup_closed' ? 'Cerraste la ventana de Google sin autorizar' : 'No se pudo abrir la ventana de Google (¿bloqueador de ventanas emergentes?)')) };
            if (window.CORREO_DOMINIO_PERMITIDO) opts.hd = window.CORREO_DOMINIO_PERMITIDO;
            cliente = window.google.accounts.oauth2.initTokenClient(opts);
            cliente.requestAccessToken({ prompt: forzarSeleccion ? 'select_account' : '' });
        });
    }

    async function conocerCuenta(tk) {
        let r;
        try { r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tk } }); }
        catch (e) { throw new Error('No se pudo consultar tu cuenta en Google (paso 1: userinfo). Revisa tu conexión, bloqueadores/antivirus o proxy que bloqueen googleapis.com.'); }
        const j = await r.json().catch(() => ({}));
        cuenta = j.email || '';
        return cuenta;
    }

    function dominioValido(email) {
        const dom = String(window.CORREO_DOMINIO_PERMITIDO || '').toLowerCase().replace(/^@/, '');
        return !dom || String(email).toLowerCase().endsWith('@' + dom);
    }

    // eml: mensaje RFC 822 completo (ASCII). Crea un BORRADOR en Gmail (no se envía).
    // Devuelve { ok, de, id, url } con la URL que abre ese borrador en la cuenta correcta.
    async function crearBorrador(tk, eml) {
        const email = await conocerCuenta(tk);
        if (!dominioValido(email)) {
            token = null; expira = 0;
            return { ok: false, message: `La cuenta ${email || 'seleccionada'} no es la corporativa (@${String(window.CORREO_DOMINIO_PERMITIDO).replace(/^@/, '')}). Cambia de cuenta e intenta de nuevo.`, cambiarCuenta: true };
        }
        let r;
        const aBase64Url = txt => btoa(txt).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        try {
            // Endpoint estándar de Gmail con JSON { message: { raw } }: es el que mejor admite CORS desde el navegador.
            r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
                method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { raw: aBase64Url(eml) } })
            });
        } catch (e1) {
            try {   // respaldo: carga directa del mensaje RFC 822 (adjuntos pesados)
                r = await fetch('https://www.googleapis.com/upload/gmail/v1/users/me/drafts?uploadType=media', {
                    method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'message/rfc822' }, body: new Blob([eml], { type: 'message/rfc822' })
                });
            } catch (e2) {
                const mb = (eml.length / 1048576).toFixed(1);
                return { ok: false, message: `No se pudo contactar con Gmail (mensaje de ${mb} MB). Lo más probable: Gmail API no está habilitada en el proyecto de Google Cloud del ID de cliente, o una extensión/antivirus/proxy bloquea googleapis.com. Mientras tanto usa «Copiar todo».` };
            }
        }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            if (r.status === 401) { token = null; expira = 0; }
            if (r.status === 403) { token = null; expira = 0; return { ok: false, message: 'Gmail: falta el permiso para crear borradores. Vuelve a intentar y acepta el permiso de Google (si persiste, hay que agregar el alcance gmail.compose en la pantalla de consentimiento de Google Cloud).' }; }
            return { ok: false, message: 'Gmail: ' + ((j.error && j.error.message) || ('error ' + r.status)) };
        }
        const id = (j.message && j.message.id) || '';
        return { ok: true, de: email, id, url: urlBorrador(email, id) };
    }

    // Abre el borrador ya armado en la ventana de redacción de Gmail, en la cuenta indicada.
    // Se usa ?authuser=correo (la forma /mail/u/correo/ da error 404 en Gmail).
    function urlBorrador(email, id) {
        return `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#drafts?compose=${encodeURIComponent(id)}`;
    }

    return { disponible, precargar, obtenerToken, crearBorrador, urlBorrador, tokenVigente: () => !!(token && Date.now() < expira - 30000), cuentaActual: () => cuenta, olvidar: () => { token = null; expira = 0; cuenta = ''; } };
})();

// Alias de compatibilidad con el nombre anterior (módulo Descanso médico).
window.DescansoGmail = window.CorreoGmail;

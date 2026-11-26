// ============================================================
// CORREO-GMAIL.JS — Envío directo con la cuenta institucional individual.
// Gmail API users.messages.send. No crea borradores ni abre Gmail.
// El token OAuth se mantiene solo en memoria (no localStorage/sessionStorage).
// ============================================================
window.CorreoGmail = (function () {
    const SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email';
    let gisPromise = null, cliente = null, token = null, expira = 0, cuenta = '', cuentaVerificada = false;
    // Limpia el token de sesión guardado por la versión anterior (v100).
    try { sessionStorage.removeItem('ogl_gmail_tk'); } catch (e) {}

    function disponible() { return !!window.GOOGLE_CLIENT_ID; }
    function invalidar() { token = null; expira = 0; cuenta = ''; cuentaVerificada = false; }
    const tokenVigente = () => !!(token && Date.now() < expira - 60000);

    function precargar() {
        if (!disponible()) return Promise.reject(new Error('Falta configurar el ID de cliente OAuth de Google.'));
        if (gisPromise) return gisPromise;
        gisPromise = new Promise((resolve, reject) => {
            if (window.google?.accounts?.oauth2) return resolve();
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
            s.onload = () => window.google?.accounts?.oauth2 ? resolve() : reject(new Error('Google Identity Services no está disponible.'));
            s.onerror = () => { gisPromise = null; reject(new Error('No se pudo cargar Google Identity Services.')); };
            document.head.appendChild(s);
        });
        return gisPromise;
    }

    async function obtenerToken(forzarSeleccion) {
        await precargar();
        if (tokenVigente() && !forzarSeleccion) return token;
        return new Promise((resolve, reject) => {
            if (!window.google?.accounts?.oauth2) return reject(new Error('Google aún no está disponible.'));
            const opts = {
                client_id: window.GOOGLE_CLIENT_ID,
                scope: SCOPES,
                callback: r => {
                    if (r.error || !r.access_token) return reject(new Error(r.error === 'access_denied' ? 'No autorizaste el envío.' : 'Google no concedió autorización: ' + (r.error || 'respuesta inválida')));
                    token = r.access_token; expira = Date.now() + (Number(r.expires_in) || 3600) * 1000;
                    cuenta = ''; cuentaVerificada = false; resolve(token);
                },
                error_callback: e => reject(new Error(e?.type === 'popup_closed' ? 'Cerraste la ventana de autorización.' : 'No se pudo abrir la ventana de Google. Revisa el bloqueador de ventanas emergentes.'))
            };
            // hd solo orienta el selector de Google; la validación real se hace con userinfo.
            if (window.CORREO_DOMINIO_PERMITIDO) opts.hd = String(window.CORREO_DOMINIO_PERMITIDO).replace(/^@/, '');
            cliente = window.google.accounts.oauth2.initTokenClient(opts);
            cliente.requestAccessToken({ prompt: forzarSeleccion ? 'select_account' : '' });
        });
    }

    async function conocerCuenta(tk) {
        if (cuenta && cuentaVerificada && tk === token) return cuenta;
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tk } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.email) throw new Error('No se pudo verificar la cuenta autorizada en Google.');
        if (j.email_verified !== true) throw new Error('Google no confirmó que el correo de esta cuenta esté verificado.');
        const email = String(j.email).trim().toLowerCase();
        const dom = String(window.CORREO_DOMINIO_PERMITIDO || '').toLowerCase().replace(/^@/, '');
        if (dom && !email.endsWith('@' + dom)) {
            invalidar();
            throw new Error(`La cuenta ${email} no pertenece al dominio institucional @${dom}. Selecciona tu cuenta UPAO.`);
        }
        cuenta = email; cuentaVerificada = true; return email;
    }

    function normalizarDestinatarios(valor) {
        const lista = String(valor || '').split(/[;,\n]+/).map(x => x.trim()).filter(Boolean);
        const patron = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
        const invalidos = lista.filter(x => !patron.test(x));
        return { lista: [...new Set(lista.map(x => x.toLowerCase()))], invalidos };
    }

    async function enviar(tk, eml) {
        const email = await conocerCuenta(tk);
        const raw = btoa(unescape(encodeURIComponent(eml)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        let r;
        try {
            r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw })
            });
        } catch (e) {
            return { ok: false, message: 'No se pudo conectar con Gmail. Comprueba la conexión y vuelve a intentar. No se puede confirmar si Google recibió el mensaje.' };
        }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            if (r.status === 401) invalidar();
            if (r.status === 403) return { ok: false, message: 'Google denegó el envío. Verifica que Gmail API esté habilitada y que el proyecto OAuth tenga autorizado el permiso gmail.send.' };
            if (r.status === 429) return { ok: false, message: 'Se alcanzó temporalmente el límite de solicitudes de Gmail. Intenta más tarde.' };
            return { ok: false, message: 'Gmail no pudo enviar el mensaje: ' + (j.error?.message || ('error ' + r.status)) };
        }
        return { ok: true, de: email, id: j.id || '', threadId: j.threadId || '' };
    }

    return {
        disponible, precargar, obtenerToken, enviar, verificarCuenta: conocerCuenta, normalizarDestinatarios,
        tokenVigente, cuentaActual: () => cuenta,
        olvidar: invalidar
    };
})();
window.DescansoGmail = window.CorreoGmail;

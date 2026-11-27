// ============================================================
// FORMATO-FECHA-HORA.JS — Fechas dd/mm/aaaa y horas de 24 h en TODOS los módulos
// ============================================================
// Los <input type="date"> y <input type="time"> nativos muestran el formato del
// navegador/sistema (mm/dd/aaaa, AM/PM...) y no se puede cambiar por código.
// Este script los convierte automáticamente (los que ya están en la página y los
// que se agreguen después) en campos de texto con máscara:
//   · fecha → dd/mm/aaaa      · hora → hh:mm (00:00 a 23:59)
// IMPORTANTE: el resto del código NO cambia. Cada campo sigue devolviendo y
// aceptando en .value el valor interno de siempre (aaaa-mm-dd y HH:MM), así que
// guardado, validaciones, cálculos y exportaciones funcionan igual.
// Calendario: clic en el icono del campo de fecha (o doble clic / F4).
// ============================================================
// Horas decimales -> "H:MM" (8.8 -> "8:48"). Solo para MOSTRAR; lo guardado sigue en decimal.
window.horasHM = function (horas) {
    const n = parseFloat(horas);
    const totalMin = Math.round((Number.isNaN(n) ? 0 : n) * 60);
    const a = Math.abs(totalMin);
    return (totalMin < 0 ? '-' : '') + Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0');
};

(function () {
    if (window.FechaHora) return;

    const nativo = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const rawDe = el => nativo.get.call(el);
    const pad = n => String(n).padStart(2, '0');

    // ---------- conversiones ----------
    function formatearFechaEscrita(raw) {
        raw = String(raw || '');
        const partes = raw.split(/[\/\-.]/);
        // Con separadores se respetan las partes (7/3/2026 → 07/03/2026), salvo que
        // alguna se desborde (17/112 → 17/11/2): ahí se reparte por dígitos.
        if (partes.length > 1 && partes.length <= 3 && partes[0].length <= 2 && (partes[1] || '').length <= 2 && (partes[2] || '').length <= 4) {
            const p = partes;
            let d = p[0].replace(/\D/g, '').slice(0, 2);
            let m = (p[1] || '').replace(/\D/g, '').slice(0, 2);
            const y = (p[2] || '').replace(/\D/g, '').slice(0, 4);
            if (p.length > 1 && d.length === 1) d = pad(d);
            if (p.length > 2 && m.length === 1) m = pad(m);
            let out = d;
            if (p.length > 1) out += '/' + m;
            if (p.length > 2) out += '/' + y;
            return out;
        }
        const s = raw.replace(/\D/g, '').slice(0, 8);
        if (s.length <= 2) return s;
        if (s.length <= 4) return s.slice(0, 2) + '/' + s.slice(2);
        return s.slice(0, 2) + '/' + s.slice(2, 4) + '/' + s.slice(4);
    }

    function formatearHoraEscrita(raw) {
        raw = String(raw || '');
        const partes = raw.split(/[:.]/);
        if (partes.length === 2 && partes[0].length <= 2 && partes[1].length <= 2) {
            const p = partes;
            let h = p[0].replace(/\D/g, '').slice(0, 2);
            const m = (p[1] || '').replace(/\D/g, '').slice(0, 2);
            if (p.length > 1 && h.length === 1) h = pad(h);
            return p.length > 1 ? h + ':' + m : h;
        }
        const s = raw.replace(/\D/g, '').slice(0, 4);
        return s.length <= 2 ? s : s.slice(0, 2) + ':' + s.slice(2);
    }

    // 'aaaa-mm-dd...' o 'dd/mm/aaaa' → texto 'dd/mm/aaaa' ('' si no es válido)
    function isoAVista(v) {
        v = String(v || '').trim();
        let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
        if (m) return `${pad(m[1])}/${pad(m[2])}/${m[3]}`;
        return '';
    }
    // texto 'dd/mm/aaaa' completo y real → 'aaaa-mm-dd' ('' si falta o no existe, ej. 31/02)
    function vistaAIso(t) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(formatearFechaEscrita(t));
        if (!m) return '';
        const d = +m[1], mo = +m[2], y = +m[3];
        const f = new Date(y, mo - 1, d);
        if (y < 1000 || f.getFullYear() !== y || f.getMonth() !== mo - 1 || f.getDate() !== d) return '';
        return `${m[3]}-${m[2]}-${m[1]}`;
    }
    // acepta '8:00', '08:00:00', '1:00 PM' → 'HH:MM' de 24 h ('' si no es válida)
    function horaAVista(v) {
        v = String(v || '').trim();
        const m = /(\d{1,2}):(\d{2})/.exec(v);
        if (!m) return '';
        let h = +m[1];
        const mi = +m[2];
        if (/p\.?\s?m/i.test(v) && h < 12) h += 12;
        if (/a\.?\s?m/i.test(v) && h === 12) h = 0;
        if (h > 23 || mi > 59) return '';
        return `${pad(h)}:${pad(mi)}`;
    }
    function vistaAHora(t) {
        const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(formatearHoraEscrita(t));
        return m ? `${m[1]}:${m[2]}` : '';
    }

    // ---------- estilos ----------
    const css = document.createElement('style');
    css.textContent = `
input[data-fh] { font-variant-numeric: tabular-nums; }
input[data-fh="date"] {
    padding-right: 30px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cpath d='M16 2v4M8 2v4M3 10h18'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 8px center; background-size: 16px 16px;
}
input[data-fh="date"]:disabled { background-image: none; padding-right: 8px; }
input.fh-invalid { outline: 2px solid #BB0000 !important; outline-offset: -1px; }`;
    document.head.appendChild(css);

    // ---------- calendario nativo auxiliar (solo para elegir la fecha) ----------
    function abrirCalendario(el) {
        if (el.disabled || el.readOnly) return;
        const r = el.getBoundingClientRect();
        const p = document.createElement('input');
        p.dataset.fhNativo = '1';
        p.type = 'date';
        p.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom}px;width:1px;height:1px;opacity:0;pointer-events:none;`;
        const actual = el.value;
        if (actual) p.value = actual;
        document.body.appendChild(p);
        const quitar = () => { if (p.parentNode) p.parentNode.removeChild(p); };
        p.addEventListener('change', () => {
            if (p.value) {
                el.value = p.value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            quitar();
        });
        p.addEventListener('blur', () => setTimeout(quitar, 250));
        try { p.showPicker(); } catch (e) { p.focus(); p.click(); }
    }

    // ---------- conversión de un campo ----------
    function instalarValor(el, tipo) {
        Object.defineProperty(el, 'value', {
            configurable: true,
            get() { return tipo === 'date' ? vistaAIso(rawDe(this)) : vistaAHora(rawDe(this)); },
            set(v) {
                const s = (v === null || v === undefined || v === '') ? '' : (tipo === 'date' ? isoAVista(v) : horaAVista(v));
                nativo.set.call(this, s);
                this.classList.remove('fh-invalid');
            }
        });
    }

    function mejorar(el) {
        if (!(el instanceof HTMLInputElement) || el.dataset.fhNativo) return;
        let tipo = el.dataset.fh;
        if (!tipo) {
            if (el.type !== 'date' && el.type !== 'time') return;
            tipo = el.type;
            const inicial = nativo.get.call(el);          // valor interno (aaaa-mm-dd / HH:MM)
            el.dataset.fh = tipo;
            el.type = 'text';
            el.setAttribute('inputmode', 'numeric');
            el.setAttribute('autocomplete', 'off');
            el.setAttribute('placeholder', tipo === 'date' ? 'dd/mm/aaaa' : 'hh:mm');
            el.setAttribute('maxlength', tipo === 'date' ? '10' : '5');
            if (!el.title) el.title = tipo === 'date' ? 'Formato dd/mm/aaaa. Clic en el icono (o F4) para abrir el calendario' : 'Formato de 24 horas hh:mm (ej. 08:00, 13:30)';
            instalarValor(el, tipo);
            el.value = inicial;
            enlazar(el, tipo);
        } else if (!Object.prototype.hasOwnProperty.call(el, 'value')) {
            // nodo clonado (cloneNode no copia el comportamiento): se restituye
            const texto = rawDe(el);
            instalarValor(el, tipo);
            nativo.set.call(el, texto);
            enlazar(el, tipo);
        }
    }

    function enlazar(el, tipo) {
        const formatear = tipo === 'date' ? formatearFechaEscrita : formatearHoraEscrita;
        // En captura: se aplica la máscara ANTES que los listeners propios de cada módulo.
        el.addEventListener('input', () => {
            const f = formatear(rawDe(el));
            if (f !== rawDe(el)) nativo.set.call(el, f);
            el.classList.remove('fh-invalid');
        }, true);
        el.addEventListener('blur', () => {
            const t = rawDe(el);
            if (!t) { el.classList.remove('fh-invalid'); return; }
            const ok = el.value !== '';
            el.classList.toggle('fh-invalid', !ok);
            if (ok) nativo.set.call(el, tipo === 'date' ? isoAVista(el.value) : el.value);   // normaliza (ej. 8:00 → 08:00)
        });
        if (tipo === 'date') {
            el.addEventListener('keydown', e => { if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); abrirCalendario(el); } });
            el.addEventListener('dblclick', () => abrirCalendario(el));
            el.addEventListener('click', e => {
                const r = el.getBoundingClientRect();
                if (e.clientX > r.right - 30) abrirCalendario(el);
            });
        }
    }

    function escanear(raiz) {
        if (!raiz) return;
        if (raiz.nodeType === 1) {
            if (raiz.matches && raiz.matches('input')) mejorar(raiz);
            if (raiz.querySelectorAll) raiz.querySelectorAll('input[type="date"], input[type="time"], input[data-fh]').forEach(mejorar);
        } else if (raiz.querySelectorAll) {
            raiz.querySelectorAll('input[type="date"], input[type="time"], input[data-fh]').forEach(mejorar);
        }
    }

    // Texto escrito pero incompleto o inválido (ej. 25:00, 31/02/2026, 08:)
    function incompleto(el) {
        return !!(el && el.dataset && el.dataset.fh && rawDe(el) && el.value === '');
    }

    function iniciar() {
        escanear(document);
        new MutationObserver(muts => {
            muts.forEach(m => {
                if (m.type === 'childList') m.addedNodes.forEach(n => { if (n.nodeType === 1) escanear(n); });
                else if (m.type === 'attributes') mejorar(m.target);
            });
        }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['type'] });
    }

    window.FechaHora = { mejorar, escanear, incompleto, isoAVista, vistaAIso, horaAVista };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();

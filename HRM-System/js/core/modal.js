// ============================================================
// MODALES GLOBALES
// ============================================================

window.cerrarModalUbicaciones = function() {
    const modal = document.getElementById('modalUbicaciones');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
};

window.cerrarDetalle = function() {
    const modal = document.getElementById('modalDetalle');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    window.currentDetail = null;
    document.body.style.overflow = '';
};

window.editarDesdeDetalle = function() {
    if (window.currentDetail && window.editarRegistro) {
        window.editarRegistro(window.currentDetail);
        window.cerrarDetalle();
    }
};

// ============================================================
// SISTEMA DE FOTOS - CON INICIALES COMO FALLBACK
// ============================================================
window.actualizarFotoPerfil = function(idPersonal, nombreCompleto) {
    const avatarContainer = document.getElementById('profileAvatar');
    if (!avatarContainer) return;
    
    if (!idPersonal) {
        // Si no hay ID, mostrar iniciales del nombre
        const iniciales = obtenerIniciales(nombreCompleto || 'Usuario');
        avatarContainer.innerHTML = `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#3B82F6,#2563EB);color:#fff;font-size:36px;font-weight:700;border-radius:50%;">
                ${iniciales}
            </div>
        `;
        avatarContainer.style.background = 'transparent';
        return;
    }
    
    // 1. PRIMERO: Intentar cargar la foto local desde img/fotos/
    const fotoLocal = `img/fotos/${idPersonal}.jpg`;
    const img = document.createElement('img');
    img.src = fotoLocal;
    img.alt = window.esc(nombreCompleto || idPersonal);
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '50%';
    
    // 2. Si la foto local NO existe, mostrar iniciales
    img.onerror = function() {
        // Mostrar iniciales en lugar de foto
        const iniciales = obtenerIniciales(nombreCompleto || idPersonal);
        avatarContainer.innerHTML = `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#3B82F6,#2563EB);color:#fff;font-size:36px;font-weight:700;border-radius:50%;">
                ${iniciales}
            </div>
        `;
        avatarContainer.style.background = 'transparent';
    };
    
    avatarContainer.innerHTML = '';
    avatarContainer.appendChild(img);
    avatarContainer.style.background = 'transparent';
};

// ============================================================
// FUNCIÓN PARA OBTENER INICIALES
// ============================================================
function obtenerIniciales(nombreCompleto) {
    if (!nombreCompleto) return '??';
    
    // Limpiar y dividir el nombre
    const partes = nombreCompleto.trim().split(/\s+/);
    
    // Si solo hay una palabra, tomar las primeras 2 letras
    if (partes.length === 1) {
        return partes[0].substring(0, 2).toUpperCase();
    }
    
    // Tomar la primera letra del primer nombre y la primera del apellido
    let iniciales = '';
    
    // Primera letra del primer nombre
    if (partes[0] && partes[0].length > 0) {
        iniciales += partes[0][0].toUpperCase();
    }
    
    // Primera letra del último apellido (o segundo nombre)
    if (partes.length >= 2) {
        const ultimo = partes[partes.length - 1];
        if (ultimo && ultimo.length > 0) {
            iniciales += ultimo[0].toUpperCase();
        }
    }
    
    // Si solo tenemos una inicial, tomar la segunda letra del primer nombre
    if (iniciales.length === 1 && partes[0] && partes[0].length >= 2) {
        iniciales += partes[0][1].toUpperCase();
    }
    
    // Si aún no tenemos iniciales, usar '??'
    if (iniciales.length === 0) {
        iniciales = '??';
    }
    
    return iniciales;
}
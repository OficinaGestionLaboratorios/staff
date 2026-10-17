// ============================================================
// PERMISOS-VALIDACION.JS — Reglas de negocio del formulario
// ============================================================
// Valida en el navegador ANTES de llamar al backend (que igual
// vuelve a validar, ver Codigo_Permisos.gs), solo para dar
// feedback inmediato al usuario.
// ============================================================

window.PermisosValidacion = (function() {

    function validar({ personal, funcionarioExpide, fechaPermiso, horaSalida, horaRetorno, motivoSalida, clasePermiso, otraEspecificar, lugarDestino, capacitacionDetalle }) {
        const errores = [];

        if (!personal) errores.push('selecciona un empleado');
        if (!funcionarioExpide || !funcionarioExpide.trim()) errores.push('funcionario que expide la boleta');
        if (!fechaPermiso) errores.push('fecha del permiso');
        // Hora de salida y de retorno ya NO son obligatorias: si el
        // usuario las deja vacías, permisos.js le pregunta (confirm)
        // si desea guardar "S/R" en su lugar — ver guardarPermiso().
        if (horaSalida && horaRetorno && horaSalida === horaRetorno) {
            errores.push('la hora de salida y de retorno no pueden ser iguales');
        }
        if (!motivoSalida || !motivoSalida.trim()) errores.push('motivo de la salida');
        if (!clasePermiso) errores.push('clase de permiso');
        if (clasePermiso === 'Otra' && (!otraEspecificar || !otraEspecificar.trim())) {
            errores.push('especificar la clase de permiso ("Otra")');
        }
        if (clasePermiso === 'Comisión de Servicio' && (!lugarDestino || !lugarDestino.trim())) {
            errores.push('lugar de destino de la comisión de servicio');
        }
        if (clasePermiso === 'Capacitación' && (!capacitacionDetalle || !capacitacionDetalle.trim())) {
            errores.push('detalle de la capacitación');
        }

        return errores;
    }

    return { validar };
})();

# Estado del lote

El detalle muestra `active` como **Activo** (estado habitual), `quarantined` como
**En cuarentena** y `finished` como **Finalizado**.

**Cambiar estado**, junto al indicador actual, está disponible para administradores
o usuarios con `flocks.manage` o `flocks.finalize`. Con `flocks.manage` permite
alternar Activo y En cuarentena con un motivo
obligatorio de hasta 500 caracteres. Envía `PATCH /flocks/{id}/status` con `version`,
`status`, `reason` y `Idempotency-Key`. La respuesta pública contiene `data.flock`.
El detalle conserva `is_grouped`, que no forma parte de esa fotografía del API.

Al abrir el selector se marca el estado actual: Activo usa `success`/`success-soft`
(verde) y En cuarentena usa `warning`/`warning-soft` (amarillo). El radio marcado
acompaña al color. Guardar estado se habilita al elegir un estado diferente;
mantener el estado actual no envía una operación.

El selector también permite **Finalizado** desde Activo o En cuarentena para
administradores o usuarios con `flocks.finalize` (independiente de `flocks.manage`).
Exige el motivo y una confirmación explícita de la finalización. Antes de confirmar,
explica que el saldo queda en cero, muestra el egreso de `max(0, current_quantity)`
aves e informa que el backend actualmente impide reabrirlo. Envía
`POST /flocks/{id}/finalization` con `version`, `reason` e `Idempotency-Key`;
la confirmación de interfaz no forma parte del cuerpo público. Conserva cuerpo y
clave para reintentos inciertos. Tras el éxito, aplica la fotografía del servidor,
actualiza las métricas y deshabilita el fraccionamiento.

El botón **Finalizar**, separado de los radios de estado, abre en el mismo diálogo una vista dedicada al cierre:
identidad y estado actual, advertencia roja sobre la reapertura, resumen de aves
antes/después, motivo y confirmación. La casilla siempre comienza desmarcada.
**Volver** regresa al selector con el estado actual marcado, conserva el motivo
y descarta la confirmación. Se bloquea mientras espera
confirmación del servidor. El foco acompaña el cambio de vista y los botones
permanecen visibles mientras el contenido se desplaza en pantallas pequeñas.

Un conflicto requiere actualizar el detalle; una respuesta perdida conserva cuerpo
y clave para confirmar el mismo intento. Mientras espera esa confirmación se bloquean
los campos y el cierre. Cambiar de identidad descarta el motivo y las respuestas pendientes.

## Restricción actual de reapertura

El backend consultado el 29/10/2026 rechaza cualquier transición desde `finished`
en `FlockStatus::canTransitionTo`. El diálogo de un lote finalizado explica esa
restricción y no ofrece guardar una reapertura que el servidor rechazaría.
**La solicitud de reabrir Finalizado como Activo o En cuarentena queda pendiente
del soporte y las reglas de reapertura en backend.** El frontend no implementa una
reapertura local ni revierte los egresos registrados.

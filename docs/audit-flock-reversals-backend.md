# Reversiones de lotes desde Historial

Historial consulta `GET /api/v1/auditoria/entradas/{id}` antes de ofrecer una
corrección. Para `flock_status_changed` y `flock_redistributed`, el detalle de
auditoría informa cuándo se pueden usar los comandos de Lotes y con qué destino
y versiones. La interfaz vuelve a consultar el detalle al abrir la confirmación.

## Revertir un cambio de estado

En `AuditEntryActions`, reconocer `flock_status_changed` con sujeto Lote.
Recuperar el estado anterior y posterior de la instantánea de auditoría y el
estado y versión actuales del lote. Ofrecer **Revertir cambio de estado** si la
transición fue entre `active` y `quarantined`, el lote sigue en el estado
posterior, esa entrada corresponde a su último cambio de estado y el usuario
tiene `can_manage_flocks` (`flocks.manage`). La comparación con el último cambio
evita que una entrada antigua vuelva a habilitarse si el lote pasó varias veces
por el mismo estado. Los cambios de otros datos pueden incrementar la versión
sin invalidar el último cambio de estado. En ese caso se entrega la versión
vigente.

La finalización explícita (`flock_finalized`) y los cambios previos de un lote que
hoy está finalizado deben explicar la restricción con `irreversible`, sin acción.
Cuando el lote existe pero el cambio ya no es vigente, falta su instantánea o el
usuario carece del permiso, devolver `available: false` con el motivo.

El cliente invoca `PATCH /api/v1/flocks/{id}/status` con
`{ audit_entry_id, status, version, reason }`. `audit_entry_id` corresponde a
`data.id` del detalle recién consultado. El comando exige también `can_view_audit`
(`audit.view`), comprueba la versión y la transición bajo bloqueo y vincula el
cambio compensatorio con la entrada original, que queda en el historial.

En `contracts/openapi/lots.yaml` queda pendiente alinear `audit_entry_id` al
mismo nivel que `reason` dentro de `ChangeFlockStatus.properties`. La API recibe
el campo al nivel raíz del cuerpo JSON.

## Revertir un fraccionamiento

En `AuditEntryActions`, vincular `flock_redistributed` al `FlockMovement` original
por `operation_id` y verificar que el lote del registro es origen o destino. Las
entradas de ambos lotes deben devolver el mismo ULID del movimiento. La opción
cubre los tipos que admite el comando existente, `partial_new`,
`partial_existing`, `total` y `total_existing`.

Usar las mismas comprobaciones que `ReverseRedistributionAction` para calcular
la disponibilidad del detalle. El movimiento debe ser original y verificable,
estar sin revertir y no tener actividad posterior de negocio en ninguno de los
lotes. El galpón que recibe las aves debe estar operativo y disponible para ese
lote. El exceso de capacidad es un aviso según el contrato actual. También se
exige `can_redistribute_flocks` (`flocks.redistribute`). Entregar el motivo del
bloqueo en español y las versiones solo cuando la acción está disponible.

El cliente invoca `POST /api/v1/redistributions/{id}/reversals` con
`{ version, destination_version?, reason }`. `version` corresponde al origen
original y `destination_version` se incluye si el destino es otro lote. El
comando revalida todas las condiciones bajo bloqueo y agrega la compensación
auditada. La restricción de finalización anterior aplica al cambio de estado.
La unión total conserva la regla de reversión que ya aplica Lotes para ese
movimiento.

## Contrato de respuesta

`presentation.actions` publica los siguientes valores según `contracts/openapi/audit.yaml`.

| `kind` | `label` | `target` cuando está disponible |
| --- | --- | --- |
| `reverse_flock_status` | Revertir cambio de estado | `{ resource: "flock", id, status, version }` |
| `reverse_flock_redistribution` | Revertir redistribución | `{ resource: "flock_redistribution", id, version, destination_version? }` |

`id` es un ULID público. `status` es el estado abierto anterior (`active` o
`quarantined`). Las versiones son enteros positivos. Una acción bloqueada con
destino conocido puede devolver solo `resource` e `id`, junto con
`available: false` y `reason`. Si falta una referencia verificable, el detalle
puede informar `reversibility.state = unavailable` y dejar `actions` vacío.

Ambos comandos conservan `Idempotency-Key` y el motivo obligatorio de hasta 500
caracteres. Un `409` debe incluir `detail` con el motivo de conflicto. Historial
bloquea el reenvío desde esa confirmación y actualiza el detalle y el listado.

## Casos de aceptación

- El último cambio entre estados abiertos se puede revertir. Otro cambio de
  estado posterior invalida la entrada anterior, aunque el estado coincida.
- Un lote finalizado, un usuario sin permiso y una entrada histórica incompleta
  reciben la explicación correspondiente y carecen de una acción habilitada.
- Los detalles del origen y del destino enlazan el mismo fraccionamiento.
  Si otro lote recibió las aves, la acción incluye ambas versiones.
- Actividad posterior, galpón indisponible, reversión previa o historial no
  verificable impiden la reversión y explican la causa.
- Si el dato cambia entre consultar el detalle y confirmar, el comando rechaza
  el intento con `409`. Un reintento idéntico de un comando ya aplicado devuelve
  el resultado original con la misma clave de idempotencia.

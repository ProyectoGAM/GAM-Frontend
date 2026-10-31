# Contrato integrado de presentación de auditoría

Referencia: informe backend del 31/10/2026, rama historyDetails, y
`GAM-Backend/contracts/openapi/audit.yaml`. Sustituye la propuesta anterior.
El backend entrega resumen en listado y presentación completa bajo demanda.

Todas las rutas son relativas a /api/v1 y usan ApiClient y la autenticación
central existente (cookies/CSRF web y credenciales de sesión vigentes en nativo).

| Consulta | Ruta | Acceso |
| --- | --- | --- |
| Listado resumido | GET audit/entries | audit.view |
| Detalle | GET auditoria/entradas/{id} | audit.view |
| Responsables paginados | GET auditoria/responsables | audit.view |
| Etiquetas de eventos | GET reference/options | bloque audit con audit.view |

No existe audit.actors ni un endpoint de mutación de auditoría.

## Resumen y detalle

AuditEntry contiene id, log_name, event, source, created_at, actor y presentation.
Los campos técnicos anteriores que sigan llegando no se usan para presentación.
presentation del listado contiene title, summary, subject y production_unit.
El sujeto es contexto histórico: no garantiza existencia o autorización.
`resource=flock` con `id` ULID público válido permite enlazar al detalle del lote
y a la sección conocida del evento. `label=null` muestra «Ver lote» y no bloquea
el acceso. Los pesajes históricos y los ingresos diarios usan esta referencia;
el frontend no utiliza IDs internos ni datos de facts para construir destinos.

AuditDetail contiene exactamente id, event, created_at, actor y presentation.
Esta última agrega facts, changes, changes_state, history, reversibility y actions.
Las interfaces consumidas están en features/audit/interfaces/audit.ts.

- facts: listas label/value ya legibles.
- changes: label/before/after. null representa valor histórico no disponible.
- changes_state: presented, partial, unavailable o not_recorded.
- history: state complete/partial y missing, que no impide consultar los demás datos.
- reversibility: state available/irreversible/unavailable/unknown y reason.
- actions: kind, label, available, reason y target semántico.

Textos y valores son texto plano, nunca HTML ni Markdown. Fechas de negocio llegan
DD/MM/YYYY y cantidades ya formateadas, con su precisión y unidad. No se convierten
a Number ni se utilizan como payload editable. Los instantes conservan ISO/offset.

## Identidad y filtro

actor contiene type, id, kind, name, current_name, exists, status y can_manage.
Por decisión de producto, el frontend prioriza name (histórico) y utiliza
current_name si falta el histórico, sin aclaraciones añadidas. Si faltan ambos
nombres muestra Responsable no disponible. Sin identidad afirmable no se
inventa un proceso automático.
La gestión requiere can_manage y existencia, incluidas cuentas deshabilitadas.

La búsqueda de responsables recibe buscar, por_pagina y page, y devuelve
data/links/meta. Las opciones contienen value, label, type, kind, status,
can_manage, exists, name y current_name. El cliente mantiene claves compuestas;
solo personas envían actor_type y actor_id. Sistema/no disponible envían su kind.
El filtro no requiere identity.users.manage ni consulta users.

## Comandos admitidos

| kind | Comando | Payload |
| --- | --- | --- |
| reverse_inventory_movement | POST inventory/movements/{id}/reversals | reason requerido, máximo 255 |
| correct_feed_consumption | POST lotes/{flock_id}/consumos-alimento/{id}/rectificaciones | motivo máximo 2000 y receta_id, cantidad_g o ambos |
| undo_mortality | Abre la confirmación de Mortandad sobre el detalle del historial | El módulo conserva POST mortalities/{id}/cancellation con version, flock_version, reason y confirm_reactivation cuando corresponde |

Los comandos usan Idempotency-Key con UUID; la clave no va en el body. cantidad_g son
gramos enteros, de 0 a 999999999999. Los valores editables se obtienen del recurso
de negocio vigente. Se conserva la clave en un reintento idéntico; otro payload o
intento de negocio usa otra. Las confirmaciones pertenecen al módulo dueño.

Inventario exige inventory.adjust. La corrección de consumo conserva la
autorización del módulo, sin un permiso funcional nuevo. No se añade un bloqueo
por lote cerrado o receta inactiva. La disponibilidad puede caducar: los comandos
vuelven a validar estado, permisos, stock e idempotencia.

409 muestra el mensaje y refresca el detalle, sin un reintento automático con otra
clave. 401/403 actualizan la sesión/permisos. Éxito refresca detalle y listado.
No se ejecutan URLs ni métodos entregados por la API: solo los kinds conocidos
se mapean a servicios existentes. El resto conserva su explicación sin anunciar
una corrección genérica.

undo_mortality requiere target.resource=mortality_record y dos ULID públicos
válidos: target.id del registro y target.flock_id del lote. Los otros comandos
conservan sus IDs numéricos. La disponibilidad depende de permisos, estado y
versión del registro; se vuelve a consultar antes de abrir la confirmación. El módulo consulta
el lote y las mortalidades actuales antes de abrir su confirmación con motivo
obligatorio (máximo 500). Si el registro ya no está vigente, explica la ausencia
y no abre la confirmación. La URL del historial y el detalle original se conservan.
Al cerrar vuelve el foco al detalle; tras éxito o conflicto se actualizan las consultas
de auditoría. Un conflicto bloquea otro envío hasta cerrar y revisar de nuevo.
Los eventos del censo asociados por operación auditada
apuntan al mismo registro; no se interpreta un cambio de cantidad como payload.

Los detalles, búsquedas y confirmaciones se invalidan al cambiar de sesión.
Los nombres históricos ausentes no se reconstruyen a partir del directorio actual.
La interfaz conserva eventos desconocidos y totales calculados por el backend.

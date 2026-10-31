# Historial del sistema

`/administracion/historial` carga el feature audit de forma lazy para administradores
y usuarios con audit.view. Las pestañas conservan los filtros y reinician la
paginación al cambiar de módulo. Todo el sistema incluye los registros globales
y los módulos desconocidos; Geografía no tiene pestaña.

## Listado y detalle bajo demanda

El listado usa GET audit/entries con log_name, event, source, actor_kind,
actor_type, actor_id, up_id, from, to, page y per_page=25. El backend decide los
totales, páginas y orden; no se ocultan filas ni se recalculan resultados.

Cada fila muestra presentation.title, presentation.summary, actor, created_at,
subject.label y production_unit.name. Solo al abrir una entrada se consulta
GET auditoria/entradas/{id}. Esa respuesta no requiere los campos técnicos del
listado. Los campos properties y attribute_changes ya no se interpretan.

El detalle presenta facts, changes y history.missing en el orden recibido.
Los textos se interpolan como texto plano, sin HTML ni Markdown. Las cantidades
y las fechas de negocio se muestran exactamente como llegan; solo los instantes
created_at se convierten a la hora local. before/after null significa
Valor histórico no disponible. changes_state unavailable y not_recorded tienen
explicaciones distintas y no se presentan como ausencia de cambios.

## Responsables

GET auditoria/responsables admite buscar (hasta 100 caracteres), por_pagina=25 y
page. El selector compartido usa búsqueda remota con espera de 250 ms; permite
continuar escribiendo durante la consulta y cargar más páginas. Las respuestas
antiguas se descartan. La selección conserva su identidad aunque cambie la
búsqueda. No se consulta el directorio de usuarios ni se exige su permiso.

La clave de opción incluye kind, type y value. Para personas se envía actor_kind,
actor_type y actor_id; Sistema y Responsable no disponible solo envían actor_kind.
Los eventos del selector respetan value/label de reference/options.data.audit.events,
incluidos los que el frontend no conoce.

Se muestra actor.name (histórico) si está disponible; en caso contrario se usa
current_name, sin aclaraciones añadidas. Si faltan ambos nombres se muestra
Responsable no disponible. Esta regla también se aplica al selector de
responsables. Solo kind=system se presenta como Sistema.
Un enlace de gestión requiere kind=person, exists y can_manage. Las cuentas
deshabilitadas también pueden abrirse para gestionar su reactivación; las
eliminadas físicamente no ofrecen enlace. Se reutiliza /administracion/usuarios/:userId.

## ¿Qué puedes hacer?

La explicación y la disponibilidad provienen de presentation.reversibility y
actions del detalle. unknown no significa irreversible. Las acciones bloqueadas
muestran su motivo; los kinds desconocidos no son ejecutables. Los comandos no
se deducen desde IDs del sujeto ni desde snapshots.

El detalle enlaza el lote cuando `presentation.subject` contiene `resource=flock`
y un ULID público válido. Conserva la etiqueta histórica si existe; sin etiqueta
muestra «Ver lote». Un ID interno, una referencia inválida o de otro recurso no
genera enlace. La navegación utiliza rutas conocidas del frontend, no URLs
entregadas por la API. El módulo destino conserva sus permisos y respuestas 403/404.

En «¿Qué puedes hacer?» esos registros ofrecen un acceso a su sección: postura,
pesajes, mortandad, alimentación o sanidad, según el evento reconocido. Los demás
eventos de un lote referenciado ofrecen «Ir al lote». Se consulta el recurso
vigente en su módulo antes de corregir: postura permite editar/borrar y el detalle
de pesaje diario permite borrar cada ingreso individual o grupal. No se ofrece
editar un ingreso de pesaje ni borrar la jornada completa. Un acceso de consulta
no afirma que el hecho histórico se pueda revertir y no ejecuta mutaciones.

Estos accesos requieren la referencia semántica del detalle actual. No se
reconstruyen relaciones usando nombres, facts, IDs internos o información del
listado. Actualmente el backend identifica el lote de los eventos históricos de
pesaje y de las presentaciones de alimentación que conservan esa referencia;
otros registros solo habilitan el acceso cuando su presentación la incluye.

Antes de abrir una operación se vuelve a consultar el detalle y se comprueba el
mismo kind/destino. Los destinos integrados son:

- reverse_inventory_movement: consulta el movimiento vigente y reutiliza
  MovementReversalDialogComponent con motivo, revisión y confirmación.
- correct_feed_consumption: FeedConsumptionCorrectionComponent, propiedad de
  Lotes, consulta el consumo de negocio vigente y los saldos de su UP histórica.
  Reutiliza FeedingEditorComponent. No se usan facts como valores editables;
  se admiten cero, lotes cerrados y recetas inactivas.
- undo_mortality: abre MortalityUndoComponent sobre el detalle del historial.
  Tras consultar el lote y los registros actuales, reutiliza exclusivamente la
  confirmación de FlockMortalitySectionComponent, sin tarjetas ni formulario de alta.
  Conserva motivo, versiones, idempotencia y confirmación de reactivación del módulo.
  Abrir o cancelar no ejecuta la operación. Un registro ausente no abre el diálogo.
  La URL no cambia y al cerrar se devuelve el foco al detalle original. Conflictos
  y cambios de sesión invalidan la confirmación; un reintento de red idéntico
  conserva su Idempotency-Key. El acceso rápido «Ir a mortandad» sigue disponible.

Los comandos usan los servicios del módulo y un UUID Idempotency-Key generado al
confirmar. Un reintento de red con el mismo payload conserva la clave; otro
payload genera otra. Una respuesta 409 muestra el mensaje del comando, bloquea
otro envío desde esa confirmación y refresca detalle/listado. No hay reintentos
automáticos. Tras éxito también se consultan ambos. Un 403 vuelve a consultar la
identidad y permisos; un 401 sigue el tratamiento central de autenticación.

Cambiar de usuario/sesión invalida datos y disponibilidad, cancela respuestas
tardías, limpia el selector y cierra las confirmaciones. No hay caché compartida
de detalles entre usuarios. Abrir, consultar o cancelar nunca muta auditoría.

## Presentación y verificación

Se conservan los tokens GAM en ambos temas, el diálogo de filtros y el selector
compartidos. La lista se convierte en tarjetas en teléfono; el detalle conserva
su cabecera y cierre. ion-content conserva el scroll de página. El editor Ionic
se abre retirando temporalmente el diálogo nativo del detalle para mantener su
interacción y foco.

Las pruebas verifican el contrato, nombres históricos y permisos de enlace,
búsqueda/paginación de responsables, eventos nuevos, texto plano, valores
faltantes, detalle bajo demanda, concurrencia, sesión, revalidación de acciones,
reutilización de formularios, precisión y reintentos idempotentes.

Validación del 31/10/2026: lint y build de producción aprobados; suite completa
con 1197 pruebas en 151 archivos aprobada. Después del ajuste para omitir buscar
cuando está vacío, aprobaron las cinco pruebas de transporte de AuditService,
lint y build nuevamente. No cambiaron dependencias ni integración nativa.

Navegador contra el backend local: selector sin búsqueda y por nombre, filtro
Sistema (28 registros del servidor), consumo antiguo bloqueado tras una
rectificación, apertura/cancelación del editor desde la revisión vigente y
bloqueo de una reversión genérica de alimento. Escritorio claro y teléfono de
360 px oscuro, sin desbordamiento horizontal del detalle ni errores de consola.
Capturas en .tmp/qa/audit-contract-*.png. Las mutaciones se verificaron con dobles
en las pruebas; no se ejecutaron correcciones reales ni pruebas en equipos físicos.

Ver el [contrato integrado](audit-api-contract.md). La auditoría solo puede
mostrar acciones que el backend haya instrumentado.

La navegación a Lotes se verificó contra el backend local: un ingreso diario sin
nombre histórico ofrece «Ver lote» y «Ir a pesajes»; ambos abren el mismo lote
SANIDAD-PRUEBAS-2. Escritorio claro y móvil de 360 px oscuro, con foco visible,
cabecera de cierre accesible y sin desbordamiento horizontal. Capturas en
`.tmp/qa/audit-flock-*.png`. Abrir el detalle y seguir esos accesos no ejecuta
correcciones ni elimina datos. Las pruebas cubren las secciones por evento,
referencias inválidas, nombres ausentes y limpieza de enlaces durante la recarga.
Validación completa de estos accesos: lint, 1255 pruebas en 153 archivos y build
de producción aprobados; auditoría de dependencias de producción sin vulnerabilidades.

La integración de mortalidad aprobó 80 pruebas específicas del frontend y la
suite completa de 1260 pruebas en 153 archivos, además de lint. El recorrido real
abrió «Deshacer» desde una mortalidad y comprobó el mismo destino desde el evento
de ajuste de cantidad viva. La confirmación mostró el lote, las seis bajas y el
motivo original; se canceló sin modificar datos reales. Se verificó teléfono de
360 px, temas claro/oscuro, foco visible y ausencia de desbordamiento horizontal.
Capturas en `.tmp/qa/audit-mortality-*.png`. La validación del backend cubrió 68
pruebas de auditoría/mortalidad, incluyendo permisos, revisiones, existencia,
versiones, reactivación y conservación del historial; análisis estático sin errores.
El build de producción también aprobó. No cambiaron dependencias ni integración nativa.

La confirmación de mortalidad también se verificó directamente sobre el detalle
del historial, sin navegación: el diálogo original permanece abierto detrás,
la URL conserva `modulo=lots`, y Cancelar/Escape devuelve el foco al encabezado
del registro. Se reutiliza el mismo formulario del módulo sin montar gráficas
ni formularios de alta. Se consultan los recursos actuales antes de abrir, se
conserva la clave en reintentos de red idénticos y se bloquea otro envío ante
un conflicto o pérdida de permisos. Un cambio de sesión descarta el formulario
y las respuestas pendientes. Las diez pruebas del nuevo coordinador y la
regresión de auditoría/Mortandad aprobaron 63 casos. Se verificó escritorio claro
y teléfono de 360 px oscuro, sin desbordamiento ni mutaciones reales; capturas
en `.tmp/qa/audit-mortality-inline-modal*.png`.
Validación final del modal integrado: lint, 1270 pruebas en 154 archivos y build
de producción aprobados. No se modificó el contrato ni el código del backend.

# Cards de lotes

El listado `/administracion/lotes/lotes` y los lotes alojados en un galpón usan
`FlockCardComponent`, un componente visual del feature Lotes. La card muestra
código, estado, ingreso, mortalidad acumulada vigente y aves vivas. Conserva el
tag con gallina exclusivamente para lotes agrupados y abre el detalle del lote.
El listado general también conserva el nombre del galpón.

Al abrir una card desde un galpón se incluyen `lotFrom=house`, `unitId` y
`houseId` del galpón de origen. El detalle ofrece «Volver al galpón» hacia esa
instalación. Desde el listado general, sin ese contexto, ofrece «Volver a
lotes» hacia el listado. El origen persiste al recargar y al consultar el plan
de manejo y regresar al lote. Los IDs deben ser enteros positivos seguros;
un origen ausente o inválido vuelve al listado y nunca determina permisos.

Los estados Activo, En cuarentena y Finalizado usan los pares semánticos
success, warning y text-muted/surface-alt, con texto además del color. Todos los
colores proceden de los tokens centrales y se adaptan a ambos temas.

La mortalidad se obtiene de `GET flocks/{id}/mortalities?status=recorded`,
recorriendo todas las páginas mediante el servicio existente del detalle.
No se calcula restando las aves actuales a las iniciales: traslados, uniones y
egresos también modifican el saldo. Se consulta una vez por ID en cada carga,
con un máximo de cuatro lotes simultáneos y resultados progresivos. El cambio
de listado descarta las consultas anteriores mediante `switchMap`.

Un fallo o falta de permiso `mortality.view` muestra «No disponible» solo para
ese dato; la carga muestra «Cargando…» y un total real cero muestra «0». Las
cards no esperan por la mortalidad para aparecer. Aves vivas utiliza
`current_quantity` con mínimo cero, como el detalle; los saldos negativos se
conservan en una nota explícita. Las fechas sin un valor válido se identifican
como no disponibles.

El endpoint de galpón devuelve `PaginatedFlocks` del contrato `lots.yaml`; la
interfaz `HouseFlock` incluye `entry_date` e `is_grouped` de ese contrato.
Las páginas coordinan consultas y cancelación; el componente no accede a la API.
No se modifican backend, dependencias ni configuración nativa.

Validación: lint, 614 pruebas en 91 archivos y build aprobados dentro de Docker.
Se comprobaron Listado → PESAJE-TEST → Listado y Galpón Test Pesaje → PESAJE-TEST
→ Galpón Test Pesaje (UP 1, galpón 15), también conservando el origen al recargar
y pasar por el plan de manejo. Las pruebas cubren enlaces de las cards,
regreso contextual, cambio de origen y parámetros ausentes o inválidos.
Las pruebas cubren los estados, agrupación, fechas, saldos negativos, mortalidad
real cero frente a carga/error, consultas progresivas con concurrencia limitada
y la integración de la card en el galpón. Revisión con datos reales en ambos
listados, en móvil y escritorio y temas claro/oscuro. El build conserva los
avisos SCSS/CommonJS existentes.

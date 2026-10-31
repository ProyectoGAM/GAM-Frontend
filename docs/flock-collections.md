# Recolección de huevos del lote

`/administracion/lotes/lotes/:id/recoleccion` se abre desde **Ir a recolección** en el detalle. El detalle conserva únicamente recolección diaria, promedio con tendencia y acumulado histórico; las gráficas pertenecen a la nueva página.

## Resumen y gráfica

- Recolección diaria: suma de la última jornada con registros vigentes, con su fecha explícita.
- Promedio diario: últimos siete días completos, excluyendo hoy. Se divide por los días calendario del período inclusivo, como define la API; para un lote recién ingresado se limita al ingreso. Si no hay registros, se indica su ausencia.
- Tendencia: comparación con los siete días completos anteriores. Se muestra una flecha de dirección y el porcentaje relativo, con el texto «En los últimos 7 días». Sin dos ventanas completas o sin registros comparables no se inventa una tendencia.
- Acumulado histórico: suma vigente desde el ingreso hasta hoy.
- Los filtros de la gráfica muestran los últimos siete días, los últimos tres meses calendario o todo el período desde la primera recolección vigente. Mensual comienza en la fecha equivalente de tres meses atrás, limitada al último día del mes si esa fecha no existe. Incluyen hoy y nunca empiezan antes de esa primera recolección. Sin registros, se conserva el ingreso como límite de consulta y se muestra el estado vacío. El promedio de la gráfica corresponde al período visible; los huecos posteriores se conservan. El filtro no cambia el resumen ni la tabla histórica.
- Agrupación automática: Semanal usa puntos diarios; Mensual usa intervalos consecutivos de hasta siete días; Histórico usa esos mismos intervalos y pasa a meses calendario cuando la producción supera seis meses desde la primera recolección. El primer día histórico conserva su valor original y su punto verde; los intervalos agrupados empiezan al día siguiente y no se superponen. Los extremos parciales se limitan al rango mostrado.
- ECharts con SVG representa **huevos/día** mediante puntos unidos por segmentos rectos. Cada punto agrupado es el total del intervalo dividido por todos sus días calendario. La referencia discontinua del promedio general se pondera por días, conservando el mismo valor al agrupar. Un intervalo completamente sin registros permanece como hueco, no una medición de cero. El selector muestra las fechas inicial y final y permite consultar valores sin depender del gesto sobre la gráfica. El resumen y la tabla conservan sus cantidades originales.
- Las métricas de períodos mayores a 366 días se consultan en ventanas consecutivas sin superposición. El historial se pagina de veinte en veinte, incluye registros cancelados identificados y permite consultar sus notas. Las cancelaciones no participan en métricas.

## Contrato y formulario

Fuente: `GAM-Backend/contracts/openapi/lots.yaml`, `StoreEggCollectionRequest`, `RecordEggCollectionAction` y `FlockState`.

`POST /flocks/{flock}/collections` requiere `quantity` (entero de 1 a 2.147.483.647) y encabezado `Idempotency-Key` (UUID). Admite `occurred_at` con segundos y zona explícita, `notes` de hasta 5.000 caracteres y, opcionalmente, `id` y `plan_activity_id`. No exige la versión del lote para crear. La asociación a actividad de plan no se selecciona en este formulario.

El formulario permite cantidad, fecha/hora opcional de Uruguay y notas opcionales. Sin fecha/hora, el servidor determina el instante. Una fecha elegida debe pertenecer a la existencia del lote y no ser futura; el servidor también verifica los movimientos posteriores. Requiere `egg-collections.manage`, lote abierto con aves y unidad productiva operativa. El servidor es la autoridad para permisos y reglas.

La recolección ingresa atómicamente al stock de huevos. Los reintentos inciertos conservan contenido y UUID; una nueva intención usa una nueva clave. Los errores conservan el formulario, muestran la validación de campos y actualizan el lote ante un conflicto. Al guardar correctamente se actualizan métricas e historial.

## Integración

El detalle de cada postura usa CollectionRecordDialogComponent. Consulta primero
GET /collections/{collection} y habilita Editar postura y Borrar postura para
egg-collections.manage cuando el registro sigue vigente. La edición permite
cantidad, fecha/hora de Uruguay y notas; exige un motivo de hasta 500 caracteres.
Solo envía campos modificados y conserva los segundos del instante original
cuando la fecha no cambia. Las correcciones no se bloquean por lote finalizado.

PATCH /collections/{collection} recibe version, correction_reason y los campos
modificados. POST /collections/{collection}/cancellation recibe version y
correction_reason: Borrar postura es una cancelación lógica que compensa el stock
y conserva el registro y su auditoría. El detalle explica esto antes de confirmar.
Ambos usan Idempotency-Key UUID; un reintento de red idéntico conserva la clave.
No se ejecutan comandos al abrir, editar el borrador o cancelar el diálogo.

Éxito refresca la producción, la gráfica y el historial; la postura cancelada
sigue identificada en la tabla y ya no ofrece acciones. Los conflictos recargan
el registro vigente antes de permitir otra intención. Los errores de validación
conservan el formulario. Cambiar de sesión o lote invalida el diálogo y sus
respuestas pendientes. El backend autoriza y ajusta las existencias atómicamente.

Revisión del 31/10/2026: lint, build y suite general de 1216 pruebas en 153
archivos aprobados. Se verificaron apertura, edición del borrador y cancelación
de los diálogos contra el backend local, en escritorio claro y teléfono de
360 px oscuro. Capturas en .tmp/qa/lot-posture-*.png. Las mutaciones de edición
y cancelación se verificaron con API simulada; no se alteró el stock real.

Página → servicio de recolección → ApiClient. Componentes dentro de `flocks`, estado con señales, rutas lazy y colores de los tokens GAM en ambos temas. No hay nuevas dependencias ni cambios de Capacitor.

Validación: lint, suite Vitest y build de producción en el contenedor de desarrollo; revisión visual en móvil claro/oscuro y escritorio. El formulario se verifica con pruebas de API simulada sin modificar el stock de la base de desarrollo.

Resultado del 12 de octubre de 2026: 469 pruebas aprobadas (22 nuevas de recolección). El chunk lazy `flock-collections-page` mide 39,15 kB sin comprimir y 10,12 kB de transferencia estimada; las dependencias compartidas de gráficas se cargan en chunks lazy separados. El build finaliza con avisos de presupuesto de estilos y los avisos existentes de dependencias CommonJS.

Agrupación y período de tres meses validados el 13 de octubre de 2026: lint, 475 pruebas y build aprobados. Las nuevas pruebas cubren promedios ponderados, intervalos parciales, huecos, cambio a meses a los seis meses, límites de año y febrero bisiesto. En `LOT-EGG-TEST`, Mensual e Histórico muestran nueve puntos, con el primer día como referencia verde; la ventana de tres meses se revisó en móvil. La agrupación también se revisó en ambos temas.

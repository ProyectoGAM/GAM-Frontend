# Informe de API para el detalle de lotes

Fecha de revisión: 7 de octubre de 2026. Contratos revisados: `../GAM-Backend/contracts/openapi/lots.yaml`, `weighings.yaml` y `management-plans.yaml`, junto con `../GAM-Backend/routes/api.php`.

## Actualización del último pesaje — 9 de octubre de 2026

La tarjeta «Último pesaje» consulta `GET /pesajes-diarios?flock_id=…`, ordenado por fecha descendente. Muestra el `average_weight_g` de la muestra diaria más reciente con aves vigentes y su fecha local `date`, incluso si el día sigue en curso. El promedio proviene de la API e incluye ingresos individuales y grupales ponderados por cantidad de aves; no usa el promedio del último ingreso ni los registros antiguos de `/pesajes`.

Los días vacíos tras eliminar todos sus ingresos se omiten, siguiendo `next_cursor` si hace falta. Sin mediciones vigentes se muestra «Sin registros»; los errores o la falta de permiso conservan «Dato no disponible». Al volver de pesajes al detalle se consulta nuevamente la información.

## Altas desde el detalle

La API ya permite registrar los tres hechos. Por eso **no falta un endpoint de escritura** para habilitar futuros formularios. En esta entrega los botones quedan visibles y deshabilitados, según la decisión de producto; el frontend todavía no tiene esos formularios.

| Acción | Endpoint disponible | Datos principales y dependencias |
| --- | --- | --- |
| Pesaje | `POST /pesajes` | `flock_id`, modo individual o grupal, unidad y mediciones; permite fecha, notas y actividad del plan. Requiere `weighings.manage`, `Idempotency-Key` y confirmación expresa para valores fuera de rango. |
| Mortalidad | `POST /flocks/{flock}/mortalities` | `version` del lote, cantidad y `mortality_category_id`; permite fecha, notas y actividad del plan. Requiere `mortality.manage` e `Idempotency-Key`. Las categorías se consultan en `GET /mortality-categories`, con permiso separado `mortality-categories.view`. |
| Recolección | `POST /flocks/{flock}/collections` | Cantidad; permite fecha, notas y actividad del plan. Requiere `egg-collections.manage` e `Idempotency-Key`. El alta actualiza el inventario de huevos en la misma transacción. |

Los tres contratos ya admiten un `plan_activity_id` opcional. El frontend puede registrar fuera del plan si no se selecciona una actividad; para ofrecer actividades elegibles en el formulario debe poder consultar el plan del lote, sujeto a `management-plans.view` o `management-plans.manage`.

## Información que falta para completar el diseño

| Prioridad | Necesidad | Situación actual | Información solicitada a la API |
| --- | --- | --- | --- |
| Alta | Alertas reales del lote | No hay rutas ni contrato de alertas o notificaciones. La tarjeta usa datos de ejemplo. | Alertas abiertas por lote, cantidad, severidad, título, fecha, estado y destino para revisar cada alerta. |
| Alta | Alimentación actual y origen `Plan` o `Manual` | El plan contiene actividades de ración y `POST /flocks/{flock}/cambios-racion` guarda una descripción y un producto opcional. No hay una cantidad estructurada ni una consulta que resuelva la alimentación vigente y su origen. | Alimento o ración vigente, cantidad y unidad si aplica, fecha de vigencia, fuente (`plan` o `manual`) y referencia al cambio o actividad que la estableció. |
| Media | Resumen eficiente del lote | La pantalla hace consultas separadas. La mortalidad se suma recorriendo páginas; huevos históricos se suman en intervalos de hasta 366 días; el último pesaje requiere listar con `per_page=1`. | Una consulta de resumen por lote con mortalidad acumulada, último pesaje, último día de producción, promedio de 7 días y total histórico. Cada indicador debería conservar su estado de disponibilidad para que uno sin permiso no oculte los demás. |
| Media | Acciones permitidas y datos auxiliares | Cada alta exige permisos propios. Las categorías de mortalidad y las actividades del plan se consultan con permisos adicionales. El estado del lote por sí solo no describe todas las reglas de negocio aplicables. | Capacidades por lote para registrar cada hecho y acceso de lectura a las categorías y actividades necesarias para usuarios autorizados a registrar. Alternativamente, documentar expresamente qué permisos adicionales deben concederse juntos. |

## Mejoras útiles, sin bloquear el diseño actual

- Permitir consultar los rangos de referencia de pesaje con `weighings.manage`, o exponerlos en una consulta de preparación del formulario. Hoy `GET /configuracion-pesajes` exige `weighing-settings.manage`; el conflicto `WEIGHING_OUT_OF_RANGE_CONFIRMATION_REQUIRED` sí devuelve las mediciones y rangos afectados después del primer intento.
- Exponer directamente el último total diario y el acumulado histórico de huevos evita solicitar todos los períodos desde el ingreso. El contrato actual de métricas permite calcularlos sin perder precisión.
- Exponer directamente la mortalidad acumulada evita recorrer todas las páginas de registros vigentes.

El día de ingreso, las aves vivas, el estado y la versión del lote ya están en `GET /flocks/{flock}`. El promedio diario de los últimos 7 días ya se puede obtener con `GET /flocks/{flock}/metrics` y las fechas correspondientes.

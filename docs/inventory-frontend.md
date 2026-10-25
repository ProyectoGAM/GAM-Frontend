# Inventario frontend

## Alcance

El feature vive en `src/app/features/inventory/` y conserva la frontera entre el catálogo global (`Product`) y el inventario físico por ubicación (`StockBalance`, `StockLocation` e `InventoryMovement`). El catálogo, el alta y la edición de productos pertenecen a Existencias. No crea vacunas, medicamentos, proveedores ni reglas de Manejo.

## Existencias y catálogo global

Existencias ofrece las vistas **Stock por ubicación** y **Catálogo de productos**. El catálogo está en `/administracion/inventario/existencias/productos`, con alta en `nuevo` y edición en `:id/editar`. Los enlaces antiguos de Proveedores redirigen a estas rutas; Proveedores conserva solamente su gestión de proveedores.

Los productos nunca se filtran ni se crean por UP. El catálogo consulta `GET /products` con nombre (`search`), tipo (`kind`), estado (`status`) y página. El backend actual busca por nombre; el buscador de stock permite elegir un producto por nombre o código desde las opciones de referencia y envía su `product_id`. Únicamente las ubicaciones vinculan el stock con una UP. No se añade otro selector de UP al encabezado ni al formulario de producto.

`ProductsApi` vive en `services/`, las pantallas en `pages/` y los contratos en `interfaces/`. Las capacidades devueltas por el backend siguen controlando la edición y activación. Los permisos `products.view` y `products.manage` permiten entrar al grupo Inventario; un usuario con acceso solo al catálogo entra directamente a Productos. El alta visible requiere `products.manage` o administrador.

Crear un producto no registra existencias. Después de guardar se muestra una confirmación y se impide repetir el alta. Para productos con control de stock, quienes tienen `inventory.move` pueden continuar a **Registrar ingreso**, con el producto preseleccionado y la ubicación pendiente de elegir. El formulario conserva gramos y control de stock obligatorios para materias primas, los errores por campo y la validación del servidor.

La pantalla usa tarjetas compactas en teléfonos y tabletas, y tabla en escritorio. El total de saldos proviene de `meta.total`; los indicadores Bajo mínimo y Ubicaciones muestran explícitamente **En esta página**, porque el API no ofrece agregados globales. No se suman unidades incompatibles ni se descargan todos los saldos para obtener esas cifras.

Las ubicaciones técnicas conservan su nombre e ID. Se presenta `poultry_house_name` cuando está disponible y se enlaza al detalle real mediante `poultry_house_id` y la UP de la ubicación. El listado paginado de ubicaciones proporciona ese contexto cuando el saldo no incluye la UP. Si esa consulta falla, se conserva el nombre del saldo sin inventar un enlace. Las opciones de referencia del backend ya contienen nombres de plantas y UP.

Las cantidades en gramos desde 1.000 g se presentan en kg mediante desplazamiento decimal de strings, sin redondear ni convertir a `Number`. El diálogo de mínimo identifica la unidad de registro y conserva el payload original. **Ver movimientos** abre la consulta con producto y ubicación aplicados.

La navegación de Inventario conserva estas entradas:

- `/administracion/inventario/existencias`
- `/administracion/inventario/presentaciones-huevos`
- `/administracion/inventario/existencias/ubicaciones`
- `/administracion/inventario/movimientos`
- `/administracion/inventario/donaciones`
- `/administracion/inventario/ajustes-y-perdidas`

El catálogo, el alta y la edición de productos, y el detalle de EggStock son rutas internas; no agregan entradas al sidebar.

## Validación del rediseño — 25 de octubre de 2026

Dentro de Docker pasaron `npm run lint`, las 707 pruebas de `npm run test:ci` y `npm run build`. Las pruebas incluyen nombre y enlace de plantas, precisión decimal al presentar kg, permisos de creación, filtros globales del catálogo, prevención de altas duplicadas y navegación hacia movimientos e ingresos con productos de páginas posteriores del catálogo.

La revisión en el navegador integrado comprobó el filtro real de bajo mínimo, apertura/cancelación del diálogo con su unidad de registro, el enlace a la planta correcta, catálogo y formulario globales, y claro/oscuro. Se revisó el diseño en 320, 390 y 1440 píxeles, sin desbordamiento horizontal. No se modificaron plugins ni configuración nativa; no se probó un dispositivo físico.

Pendiente de dependencias: `npm audit --omit=dev` reporta una vulnerabilidad alta en `zod@4.6.5` ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)). La actualización compatible `npm update zod` no cambia el lockfile; Angular CLI 22.2.1 exige esa versión exacta. No se cambiaron dependencias ni se aplicaron overrides para esta implementación.

## Arquitectura

Las páginas son standalone y se cargan lazy desde `inventory.routes.ts`. Los servicios de feature usan `ApiClient`:

- `InventoryApi`: saldos, mínimos, movimientos y comandos genéricos.
- `StockLocationsApi`: ubicaciones y cambios de estado.
- `InventoryReferenceApi`: opciones compactas y productos activos.
- `EggStockApi`: saldo, historial y comandos del subdominio de huevos.

Las pantallas mantienen estados de carga, vacío, error y mutación con Signals. Los formularios son Reactive Forms y la paginación usa el contrato Laravel `data`, `links` y `meta`.

## Inventario genérico

Se consumen únicamente estos endpoints backend:

```text
GET   /stock-locations
POST  /stock-locations
PATCH /stock-locations/{stockLocation}
PATCH /stock-locations/{stockLocation}/status

GET   /inventory/balances
PATCH /inventory/balances/{stockBalance}/minimum-stock
GET   /inventory/movements
GET   /inventory/movements/{inventoryMovement}

POST  /inventory/receipts
POST  /inventory/issues
POST  /inventory/losses
POST  /inventory/adjustments
POST  /inventory/transfers
POST  /inventory/movements/{inventoryMovement}/reversals
```

Los filtros de existencias (`product_id`, `stock_location_id`, `below_minimum`) y movimientos (`type`, producto, ubicación, proveedor, fechas) se envían al backend. No se descargan todas las páginas para filtrar en memoria. El selector de tipo de producto no se presenta como filtro server-side de balances porque ese endpoint no acepta `kind`.

El stock mínimo conserva el valor decimal como string. Los estados se derivan de los datos reales:

- `Sin stock`: saldo igual a cero.
- `Bajo mínimo`: saldo menor que el mínimo.
- `Normal`: saldo restante.

## Productos y unidades

El modelo frontend contempla todos los `ProductKind` actuales: `raw_material`, `supply`, `finished_feed`, `egg`, `medicine`, `vaccine` y `other`. También conserva `stock_tracked` y `status` para que el backend siga siendo la autoridad sobre productos utilizables.

Las unidades técnicas son `unit`, `kg`, `g`, `l`, `ml` y `dose`. Se muestran como unidades, kg, g, L, ml y dosis. Las cantidades se formatean desde strings sin convertirlas a `number` para enviarlas ni redondearlas destructivamente.

## Ubicaciones

`StockLocation` puede tener `production_unit` nula. La pantalla permite listado paginado, búsqueda, filtros por estado y UP, alta, edición y cambio entre `active` e `inactive`. El selector de UP usa las opciones compactas de `/reference/options` y no modifica la feature de Unidades Productivas.

## Movimientos e idempotencia

Ingresos, salidas, pérdidas, ajustes y transferencias admiten múltiples líneas, hasta el máximo backend actual de 100. El ajuste envía `counted_quantity`; no envía un delta manual. La transferencia envía origen y destino en el endpoint transaccional dedicado.

Cada comando crea un UUID para `Idempotency-Key` y nunca lo expone como campo del formulario. Si la operación falla, el retry conserva la misma clave; una operación exitosa la descarta. Se previene el doble submit mientras está en estado `submitting`.

La reversión pide confirmación, envía `reason`, no usa `DELETE` y mantiene visible el movimiento original.

El recurso backend del listado de movimientos no incluye líneas ni nombres de ubicación, por lo que la tabla muestra los datos disponibles y el detalle carga las líneas. El recurso tampoco expone el nombre del actor: se muestra `created_by` como identificador. Si se necesita un nombre de actor o una ubicación enriquecida en el listado, es un gap de recurso backend, no una inferencia del frontend.

## EggStock

El rediseño de Stock de huevos presenta primero la UP seleccionada y su saldo actual, y después el historial. La selección inicial muestra el nombre de la unidad consultada; al cambiarla se descartan los datos anteriores y las respuestas tardías. Una unidad sin seleccionar no conserva un saldo de otra UP.

**Registrar movimiento** abre un diálogo modal con ingreso manual o salida (preparación de reparto/pérdida). El diálogo identifica la UP, enfoca la cantidad y devuelve el foco al cerrarse con Cancelar, Cerrar o Escape. Durante el envío bloquea cambios, cierre y doble submit. Los errores permanecen dentro del diálogo; el reintento conserva la clave idempotente mientras no se cambie el formulario. Al guardar se cierra, limpia el formulario y actualiza saldo e historial.

Los filtros de tipo, estado y fechas sólo afectan al historial. Se aplican explícitamente, se conserva su versión aplicada al paginar y se valida el orden de las fechas. Incluyen donaciones y retornos de reparto. En móvil se despliegan bajo **Filtros**, y las filas se presentan como tarjetas; en escritorio se usa una tabla. Las cantidades distinguen ingresos y salidas con signo; los movimientos cancelados indican **No afecta al saldo**. El saldo negativo conserva su advertencia sin bloquear movimientos.

Se utilizan los tokens GAM para claro/oscuro, sin modificar dependencias ni integración nativa. La referencia de producción sólo incluye el identificador de recolección: se presenta su origen y el detalle de EggStock, sin inventar un enlace a un lote que no devuelve el contrato.

Validación del rediseño de huevos (25/10/2026): lint aprobado, 716 pruebas de la suite completa aprobadas (13 específicas de la pantalla) y compilación de producción aprobada sin advertencias. El navegador integrado verificó ambas UP con sus saldos reales, filtrado de pérdidas sin alterar el saldo, foco y cierre del modal, formularios independientes para ingreso/salida y presentación en escritorio/móvil con ambos temas; a 320 px no hubo desbordamiento horizontal. Los guardados y reintentos se comprobaron con pruebas de componente, sin crear movimientos en la base local. No se probó un dispositivo físico. La corrección de Zod sigue pendiente por decisión del usuario y no forma parte de este cambio.

EggStock es un subdominio especializado por Unidad Productiva y no se modifica mediante `/inventory/receipts` ni otros comandos genéricos. El frontend usa:

```text
GET   /production-units/{productionUnit}/egg-stock
GET   /production-units/{productionUnit}/egg-stock/movements
POST  /production-units/{productionUnit}/egg-stock/receipts
POST  /production-units/{productionUnit}/egg-stock/issues
GET   /egg-stock/movements/{movement}
PATCH /egg-stock/movements/{movement}
POST  /egg-stock/movements/{movement}/cancellation
```

`collection_receipt` se muestra como `Ingreso por producción` y queda en solo lectura: la producción es dueña de su corrección/cancelación. Los tipos manuales se muestran como ingreso manual, preparación de reparto o pérdida.

El saldo de EggStock puede ser negativo según el backend y se muestra con advertencia, sin bloquearlo. Correcciones y cancelaciones envían la `version` cargada, el motivo de corrección y un `Idempotency-Key`. Los conflictos 409 no sobrescriben el registro; se informa al usuario para recargar.

## Permisos y dominios relacionados

La UI lee solamente `AuthUser.permissions` y no cambia `GROUP_ROLE_GRANTS` ni inventa roles. Las acciones se condicionan a `inventory.view`, `inventory.move`, `inventory.adjust`, `inventory.manage`, `egg-stock.view`, `egg-stock.move` y `egg-stock.adjust`; el backend sigue autorizando cada request.

- Vacunas: una vacuna se relaciona con `Product`; si ese producto está `stock_tracked`, participa del inventario genérico. No hay un saldo frontend separado de vacunas.
- Raciones: los productos `finished_feed` se tratan como cualquier producto stockeable. Este feature no implementa planes, consumo planificado ni cambios de ración de Manejo.
- Medicamentos: `MedicineStockBalance` y `MedicineStockMovement` pertenecen a Manejo y usan medicamento, cantidad entera, versión y permisos `management-plans.*`. No se combinan con `StockBalance` ni se suman al inventario físico genérico.
- Huevos: usan la cuenta técnica EggStock y sus propios movimientos.

## Donaciones y gaps backend

La pantalla `/administracion/inventario/donaciones` permanece como `Módulo pendiente de implementación` porque el backend no expone `InventoryMovementType::Donation` ni un endpoint específico. No se transforma una donación en pérdida, salida o ajuste.

Gaps confirmados:

- `/inventory/balances` no filtra por `kind`; el frontend no simula ese filtro global.
- El listado de movimientos no incluye líneas, nombres de ubicación ni nombre del actor; el detalle usa lo que el recurso sí expone.
- `/reference/options` devuelve opciones compactas para productos, proveedores, UP y ubicaciones. Si esos catálogos crecen más allá de un tamaño operativo razonable, conviene agregar búsqueda server-side específica; no se implementó paginación client-side.

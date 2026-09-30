# Inventario frontend

## Alcance

El feature vive en `src/app/features/inventory/` y conserva la frontera entre el catálogo (`Product`) y el inventario físico (`StockBalance`, `StockLocation` e `InventoryMovement`). No crea productos, vacunas, medicamentos, proveedores ni reglas de Manejo.

La navegación global mantiene las cuatro entradas existentes:

- `/administracion/inventario/existencias`
- `/administracion/inventario/movimientos`
- `/administracion/inventario/donaciones`
- `/administracion/inventario/ajustes-y-perdidas`

Las ubicaciones y EggStock son rutas internas del feature; no agregan entradas al sidebar.

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

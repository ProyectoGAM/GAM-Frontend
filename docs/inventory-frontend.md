# Inventario frontend

## Alcance

El feature vive en `src/app/features/inventory/` y conserva la frontera entre el catálogo global (`Product`) y el inventario físico por ubicación (`StockBalance`, `StockLocation` e `InventoryMovement`). El catálogo, el alta y la edición de productos pertenecen a Existencias. No crea vacunas, medicamentos, proveedores ni reglas de Manejo.

## Existencias y catálogo global

Existencias ofrece las vistas **Stock por ubicación** y **Catálogo de productos**. El catálogo está en `/administracion/inventario/existencias/productos`, con alta en `nuevo` y edición en `:id/editar`. Los enlaces antiguos de Proveedores redirigen a estas rutas; Proveedores conserva solamente su gestión de proveedores.

Los productos nunca se filtran ni se crean por UP. El catálogo consulta `GET /products` con nombre (`search`), tipo (`kind`), estado (`status`) y página. El backend actual busca por nombre; el buscador de stock permite elegir un producto por nombre o código desde las opciones de referencia y envía su `product_id`. Únicamente las ubicaciones vinculan el stock con una UP. No se añade otro selector de UP al encabezado ni al formulario de producto.

`ProductsApi` vive en `services/`, las pantallas en `pages/` y los contratos en `interfaces/`. Las capacidades devueltas por el backend siguen controlando la edición y activación. Los permisos `products.view` y `products.manage` permiten entrar al grupo Inventario; un usuario con acceso solo al catálogo entra directamente a Productos. El alta visible requiere `products.manage` o administrador.

Crear un producto no registra existencias. Después de guardar se muestra una confirmación y se impide repetir el alta. Para productos con control de stock, quienes tienen `inventory.move` pueden continuar a **Registrar ingreso**, con el producto preseleccionado y la ubicación pendiente de elegir. El formulario conserva gramos y control de stock obligatorios para materias primas, los errores por campo y la validación del servidor.

El alta se diseña primero para teléfono: dos tarjetas en una columna, **Datos del
producto** y **Control de existencias**, con campos táctiles de 48 px y tokens GAM
en claro y oscuro. La información de alcance global se resume en el encabezado.
**Crear producto** es la única acción principal y permanece en una barra inferior
con espacio reservado en el contenido, área segura y ajuste al viewport visual del
teclado. En escritorio el botón se alinea al final del formulario, sin cubrir la
navegación lateral. No se agrega otro contenedor de scroll a `ion-content`.

**Volver a productos** reemplaza Cancelar y la ×. El guard de salida confirma los
datos pendientes al volver o navegar a otra ruta; **Seguir editando** conserva los
valores y **Descartar cambios** permite la salida. Un formulario vacío o un alta
exitosa no pide confirmación. Recargar/cerrar usa la protección nativa del navegador
cuando hay datos pendientes; no se persisten borradores. La salida por fin de sesión
no queda bloqueada por esta confirmación.

El envío inválido permanece disponible para explicar los campos pendientes y
enfocar el primero. Los errores de validación del servidor también enfocan el campo
afectado. Durante **Creando…** se bloquean edición, salida y envíos repetidos. Tras
el éxito desaparece la barra de creación y se conserva Registrar ingreso según
permiso y control de stock. No cambian el contrato de alta ni los plugins nativos.

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

La vulnerabilidad de `zod@4.6.5` detectada durante esta implementación se corrigió posteriormente mediante la actualización oficial de Angular CLI 22.2.4, que incorpora Zod 4.6.6. La auditoría de producción vuelve a reportar cero vulnerabilidades; ver [Seguridad de dependencias](security.md#corrección-de-zod--26-de-octubre-de-2026).

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

En **Stock por ubicación**, el selector con búsqueda de producto permanece visible y aplica la selección al elegir una opción. El botón **Filtros** abre el mismo diálogo centrado del resto de listados para elegir ubicación y **Solo bajo mínimo**, con contador de filtros aplicados. **Limpiar** cambia el borrador; **Ver resultados** consulta el backend y cierra el modal. Cerrar con X o Escape conserva la consulta anterior. La paginación, la selección de otro producto y la actualización de mínimos usan los filtros aplicados, incluso después de cancelar un borrador distinto. El estilo compartido permite omitir las reglas de controles que la pantalla no usa, sin ampliar el presupuesto de CSS.

Validación de filtros de Stock por ubicación (26/10/2026): lint, 769 pruebas de la suite completa, 15 pruebas específicas finales y build aprobados. El navegador integrado comprobó el modal y la cancelación del borrador en móvil de 320/390 px, ambos temas y escritorio de 1366 px; **Solo bajo mínimo** devolvió el único saldo bajo mínimo de la base local. No se modificaron existencias ni mínimos.

El stock mínimo conserva el valor decimal como string. Los estados se derivan de los datos reales:

- `Sin stock`: saldo igual a cero.
- `Bajo mínimo`: saldo menor que el mínimo.
- `Normal`: saldo restante.

## Productos y unidades

El modelo de lectura contempla `raw_material`, `supply`, `finished_feed`, `egg`, `medicine`, `vaccine` y `other`. Las altas ofrecen únicamente `raw_material`, `supply`, `egg`, `medicine`, `vaccine` y `other`, según `CreatableKind` de `products.yaml`; `finished_feed` queda reservado a registros históricos. El editor no ofrece convertir otros productos a ese tipo, pero conserva su etiqueta y clasificación al editar metadata de uno que ya era ración. La validación del formulario también rechaza nuevas altas y conversiones con el valor retirado. Se conservan `stock_tracked`, `status` y las capacidades del backend como autoridad sobre productos utilizables.

Las unidades técnicas son `unit`, `kg`, `g`, `l`, `ml` y `dose`. Se muestran como unidades, kg, g, L, ml y dosis. Las cantidades se formatean desde strings sin convertirlas a `number` para enviarlas ni redondearlas destructivamente.

## Ubicaciones

`StockLocation` puede tener `production_unit` nula. La pantalla permite listado paginado y búsqueda visible junto a un botón **Filtros**, con contador de filtros aplicados. El estado y la UP se eligen dentro del modal compartido con el catálogo de productos, instalaciones y lotes. **Limpiar** modifica el borrador y **Ver resultados** aplica la selección; cerrar con la X o Escape no aplica los cambios. El catálogo ofrece tipo y estado, sin filtro de UP porque los productos son globales.

La búsqueda responde al escribir (250 ms) y admite Enter. Abrir el modal procesa primero una búsqueda pendiente para que su temporizador no interrumpa la selección. La paginación conserva los filtros aplicados y descarta respuestas anteriores si hay una consulta más reciente. La UP seleccionada desde la navegación bloquea ese filtro. Las opciones de UP se cargan con `ProductionUnitsService.listAll()`; su fallo no oculta el listado de ubicaciones.

El alta y la edición se abren en un diálogo modal con foco inicial en el nombre y devolución del foco al cancelar o cerrar con Escape. Durante el guardado se bloquean campos, cierre y envíos duplicados; un error conserva los valores y se muestra dentro del modal. El nombre se normaliza antes de validar para rechazar valores compuestos sólo por espacios. Las ubicaciones gestionadas por el sistema conservan sus acciones bloqueadas. La composición parte de teléfono, con controles de 44 px, filas como tarjetas y tokens GAM para ambos temas.

El listado de ubicaciones muestra **Tipo** según su vínculo existente: **Planta de ración** cuando tiene `poultry_house_id`, **Unidad productiva** cuando tiene `production_unit` y no está vinculada a una planta, y **Depósito general** cuando no tiene ninguno de esos vínculos. La relación con la planta tiene prioridad aunque también exista una UP. La etiqueta describe a qué pertenece la ubicación; no clasifica los productos almacenados ni se deduce del nombre o de `system_managed`.

Validación de filtros y modales (26/10/2026): lint, las 761 pruebas de la suite y la compilación de producción aprobados. Se verificaron búsqueda real, creación/edición en modal, cancelación, Escape y devolución del foco en el navegador integrado, con teléfono de 320 px y escritorio de 1366 px, en ambos temas. Los guardados y sus errores se validaron mediante pruebas de componente, sin crear ni modificar ubicaciones en la base local. No hubo cambios de integración nativa ni pruebas en dispositivo físico.

Validación del patrón compartido de filtros (26/10/2026): lint, las 767 pruebas de la suite y build aprobados. El navegador integrado comprobó centrado en instalaciones, lotes, ubicaciones y productos; teléfono de 320/390 px, escritorio de 1366 px y altura reducida de 360 px, con cuerpo desplazable y pie accesible. Se verificaron claro/oscuro, cancelación del borrador y aplicación real de tipo/estado en productos (tres materias primas activas), sin escrituras en la base de datos. La regresión de una búsqueda pendiente al abrir el modal está cubierta por una prueba de componente.

## Movimientos e idempotencia

El historial de **Movimientos** reúne tipo, producto, ubicación, proveedor y fechas
en el botón **Filtros**, con contador de criterios aplicados. Usa el diálogo
compartido centrado, con cuerpo desplazable y acciones **Limpiar** y **Ver
resultados** accesibles en teléfono y escritorio. Los selectores de producto y
ubicación conservan su búsqueda. Limpiar modifica únicamente el borrador; cerrar
con X o Escape descarta esa edición y devuelve el foco al botón. Ver resultados
aplica la consulta al backend desde la primera página; paginar y reintentar
conservan los filtros aplicados. Los accesos desde existencias conservan producto
y ubicación iniciales. Se ignoran respuestas tardías de consultas reemplazadas.
Si las opciones de referencia fallan, el modal permite reintentarlas y conserva
disponibles tipo y fechas. La selección global de UP mantiene el alcance actual
del listado y no agrega un filtro de productos por UP.

Validación de filtros de Movimientos (26/10/2026): lint, 797 pruebas de la suite
completa (9 de Movimientos) y build aprobados en Docker. El navegador integrado
comprobó aplicación real de tipo/fecha, búsqueda de productos, cancelación y
paginación, foco de retorno y centrado en 390 px, 1440 px y 320 × 360 px, en
claro/oscuro, con cuerpo desplazable y pie accesible, sin errores JavaScript ni
escrituras en la base local. No hubo cambios de integración nativa.

Ingresos, salidas, pérdidas, ajustes y transferencias admiten múltiples líneas, hasta el máximo backend actual de 100. El ajuste envía `counted_quantity`; no envía un delta manual. La transferencia envía origen y destino en el endpoint transaccional dedicado.

Cada comando crea un UUID para `Idempotency-Key` y nunca lo expone como campo del formulario. Si la operación falla, el retry conserva la misma clave; una operación exitosa la descarta. Se previene el doble submit mientras está en estado `submitting`.

**Revertir** está disponible en cada fila del historial y **Revertir movimiento**
en el detalle para quienes tienen `inventory.adjust` o son administradores. Ambos
abren el mismo modal centrado; el motivo no ocupa un formulario permanente en el
detalle. Desde el listado se consultan primero las líneas completas, sin navegar.
El modal muestra tipo, fecha, responsable original, motivo original y cantidades.
**Continuar** valida el motivo obligatorio de hasta 255 caracteres y abre una
segunda etapa de revisión; únicamente **Confirmar reversión** envía `reason` al
endpoint existente. Cancelar, X o Escape no registran nada y devuelven el foco.

Durante el envío se bloquean cierre, edición y envíos duplicados. Un error
conserva motivo y confirmación; reintentar una operación incierta conserva cuerpo y
clave idempotente, también al reabrir el mismo movimiento con la misma identidad.
Cambiar el motivo genera otra intención y otra clave. Los conflictos del backend
se explican dentro del modal; las restricciones sobre movimientos de elaboración,
ajustes de ingredientes o movimientos ya revertidos siguen siendo del servidor.
No se usa `DELETE` y el movimiento original permanece en el historial. Al guardar,
el listado actualiza la página y los filtros aplicados; el detalle se recarga y
ambos muestran una confirmación de éxito. La ventana contempla scroll interno,
áreas seguras y pie accesible en móvil, y usa los tokens GAM en ambos temas.

Validación del modal de reversión (26/10/2026): lint, 808 pruebas en 110 archivos
y build aprobados en Docker. Se cubren confirmación obligatoria, cancelación,
permisos, motivo vacío, doble envío, reintento idempotente, conflictos del servidor,
respuestas tardías y recarga con filtros/página conservados. El navegador integrado
comprobó los dos accesos, foco, edición de motivo, confirmación y cancelación en
390/1440 px y 320 × 360 px, con claro/oscuro, sin desbordamientos ni errores
JavaScript. No se confirmaron reversiones sobre los datos locales; los guardados
se verificaron con respuestas controladas. No hubo cambios de integración nativa.

El recurso backend del listado de movimientos no incluye líneas ni nombres de ubicación, por lo que la tabla muestra los datos disponibles y el detalle carga las líneas. El historial y el detalle muestran **Responsable** con `created_by_name`, el nombre vigente que entrega el backend, también para usuarios dados de baja. Se conserva `created_by` como identificador nullable; un nombre ausente, null o vacío se presenta como **No disponible**, sin deducir que sea una acción del sistema o del usuario conectado. No se consulta el módulo de gestión de usuarios ni se requieren sus permisos para mostrar el responsable.

Validación del responsable (26/10/2026): lint, build y las 13 pruebas finales del
historial/detalle aprobados en Docker. La suite general había aprobado 797 pruebas;
se corrigió la sincronización del render en una prueba del detalle y se volvieron
a verificar ambas pantallas con las 13 pruebas indicadas. El navegador integrado
comprobó nombres reales, tabla y tarjetas móviles en 390/1440 px, claro/oscuro y
ausencia de desbordamiento o errores JavaScript, sin escrituras en la base local.

## EggStock

El rediseño de Stock de huevos presenta primero la UP seleccionada y su saldo actual, y después el historial. La selección inicial muestra el nombre de la unidad consultada; al cambiarla se descartan los datos anteriores y las respuestas tardías. Una unidad sin seleccionar no conserva un saldo de otra UP.

**Registrar movimiento** abre un diálogo modal con ingreso manual o salida (preparación de reparto/pérdida). El diálogo identifica la UP, enfoca la cantidad y devuelve el foco al cerrarse con Cancelar, Cerrar o Escape. Durante el envío bloquea cambios, cierre y doble submit. Los errores permanecen dentro del diálogo; el reintento conserva la clave idempotente mientras no se cambie el formulario. Al guardar se cierra, limpia el formulario y actualiza saldo e historial.

Los filtros de tipo, estado y fechas sólo afectan al historial. Se aplican explícitamente, se conserva su versión aplicada al paginar y se valida el orden de las fechas. Incluyen donaciones y retornos de reparto. En móvil se despliegan bajo **Filtros**, y las filas se presentan como tarjetas; en escritorio se usa una tabla. Las cantidades distinguen ingresos y salidas con signo; los movimientos cancelados indican **No afecta al saldo**. El saldo negativo conserva su advertencia sin bloquear movimientos.

Se utilizan los tokens GAM para claro/oscuro, sin modificar dependencias ni integración nativa. La referencia de producción sólo incluye el identificador de recolección: se presenta su origen y el detalle de EggStock, sin inventar un enlace a un lote que no devuelve el contrato.

Validación del rediseño de huevos (25/10/2026): lint aprobado, 716 pruebas de la suite completa aprobadas (13 específicas de la pantalla) y compilación de producción aprobada sin advertencias. El navegador integrado verificó ambas UP con sus saldos reales, filtrado de pérdidas sin alterar el saldo, foco y cierre del modal, formularios independientes para ingreso/salida y presentación en escritorio/móvil con ambos temas; a 320 px no hubo desbordamiento horizontal. Los guardados y reintentos se comprobaron con pruebas de componente, sin crear movimientos en la base local. No se probó un dispositivo físico. La corrección posterior de Zod se documenta en [Seguridad de dependencias](security.md#corrección-de-zod--26-de-octubre-de-2026).

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
- Raciones: los productos históricos `finished_feed` siguen consultables en catálogo, filtros y stock genérico; no se crean nuevos ni se convierten otros productos a ese tipo. Las recetas y sus saldos por UP pertenecen a Stock de raciones y no se eliminan ni se mezclan con estas cuentas históricas.
- Medicamentos: `MedicineStockBalance` y `MedicineStockMovement` pertenecen a Manejo y usan medicamento, cantidad entera, versión y permisos `management-plans.*`. No se combinan con `StockBalance` ni se suman al inventario físico genérico.
- Huevos: usan la cuenta técnica EggStock y sus propios movimientos.

## Donaciones y gaps backend

La pantalla `/administracion/inventario/donaciones` permanece como `Módulo pendiente de implementación` porque el backend no expone `InventoryMovementType::Donation` ni un endpoint específico. No se transforma una donación en pérdida, salida o ajuste.

Gaps confirmados:

- `/inventory/balances` no filtra por `kind`; el frontend no simula ese filtro global.
- El listado de movimientos no incluye líneas ni nombres de ubicación; el detalle usa lo que el recurso sí expone. El nombre del responsable está disponible mediante `created_by_name`.
- `/reference/options` devuelve opciones compactas para productos, proveedores, UP y ubicaciones. Si esos catálogos crecen más allá de un tamaño operativo razonable, conviene agregar búsqueda server-side específica; no se implementó paginación client-side.

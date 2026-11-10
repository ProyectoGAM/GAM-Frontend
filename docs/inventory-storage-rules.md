# Almacenamiento de inventario y sanidad

Integración del contrato `GAM-Backend/contracts/openapi/inventory-storage.yaml`,
28/10/2026. Esta entrega modifica únicamente el frontend.

## Ubicaciones y movimientos

`StockLocation.type` y `allowed_product_kinds` son datos explícitos del API:

| Tipo | Categorías |
| --- | --- |
| `warehouse` — Cámara de insumos | `supply`, `other` |
| `feed_plant` — Planta de ración | `raw_material`, en gramos |
| `egg_account` — Cuenta de huevos de UP | `egg`, conservando su flujo específico |
| `health` — Sanidad histórica | Ninguna; reservado y deshabilitado |
| `unknown` — Sin clasificar | Ninguna |

Se elimina la clasificación temporal basada en `system_managed`, UP o galpón.
El nombre nunca decide compatibilidad. Un tipo ausente o desconocido se trata
como desconocido; no se inventan categorías si falta la lista admitida.

Registrar movimiento sigue ubicación → producto → cantidad. Consulta todas las
páginas de `/inventario/productos-permitidos` por ubicación y operación y filtra
además por las categorías recibidas, ubicación/UP activas y gramos para plantas.
Las pérdidas requieren stock local positivo con comparación decimal exacta.
Transferencias conserva la intersección por ID y unidad y valida ambos extremos.
Cambiar ubicación/operación limpia selecciones incompatibles y descarta respuestas
anteriores; carga o error bloquea enviar opciones viejas.

El API conserva la autoridad de escritura y valida estructura, estados y saldo
dentro de su transacción. Los huevos técnicos continúan en Stock de huevos.
Las raciones elaboradas conservan su flujo por receta y UP; `finished_feed`
no obtiene destinos nuevos.

Ubicaciones de stock muestra el tipo y agrega filtro de tipo en la modal,
junto a UP y estado. Búsqueda y paginación conservan criterios aplicados.
Crear/editar continúa gestionando cámaras manuales. Sanidad está deshabilitada:
las ubicaciones históricas conservan su lectura y protección, sin admitir nuevos
movimientos. Existencias muestra el tipo y distingue ubicaciones en su filtro.

## Ingreso sin proveedor seleccionado

El campo es opcional y conserva el aviso solicitado: **Se ingresará "propio"
como proveedor ya que no se proporcionó uno.** El frontend omite `supplier_id`;
no compara nombres ni crea/reactiva proveedores. El backend resuelve su identidad
estable `internal_supplier` dentro de la transacción. La selección explícita envía
su ID real y tiene prioridad.

Una lista de proveedores vacía o fallida no bloquea usar el proveedor interno.
Un ID explícito ajeno a las opciones activas sí se rechaza en el formulario.
Si el proveedor interno no está configurado o está inactivo, se presenta el
conflicto `409` del servidor. Los reintentos conservan la semántica idempotente
del API y no vuelven a buscar un nombre.

## Catálogos sanitarios e inventario físico

Medicamentos es un catálogo global. Su alta envía exclusivamente nombre,
descripción y proveedor, devuelve `product_id: null` y no crea productos o stock
físico. Los vínculos anteriores permanecen sólo como metadata histórica. Vacunas
conserva `producto_id`, SKU y unidad de registro de su catálogo; los productos
nuevos no controlan stock. Ninguno de estos catálogos tiene ubicación física.

Se retiran los enlaces a stock físico y a ingresos de Sanidad de ambos listados
y confirmaciones, incluso con un vínculo histórico no nulo. El formulario
explica que la ficha está disponible para todas las UP sin stock físico. Nuevo
producto permite sólo Insumo, Materia prima y Otros y enlaza a los catálogos
globales de vacunas y medicamentos para administradores.

En Nuevo producto, `raw_material` se presenta como **Insumos para recetas**;
el contrato y las reglas de gramos y control obligatorio de existencias se
conservan. La ayuda junto a Tipo de producto explica que son materias primas
para el stock dedicado a alimentación en plantas de ración. Insumos y Otros
permiten controlar productos o materia sobrante en el stock genérico de las UP,
en cámaras de insumos. Las ayudas de Recetas y Vacunas y medicamentos explican
sus recorridos específicos; se abren con toque, teclado o puntero y usan los
colores semánticos compartidos para claro y oscuro.

El contador clínico global de Planes de manejo no es existencia física por UP
y no se migran sus cantidades desde el frontend. La aplicación clínica se
registra por separado y `stock_consumption` está deshabilitado en el API vigente.

## Saldos históricos incompatibles

La modal de filtros de Existencias incluye Solo saldos incompatibles:
`GET inventory/balances?incompatible_only=1`, combinable con producto, ubicación
y bajo mínimo. El servidor decide la incompatibilidad estructural; no se deduce
de la inactividad ni se oculta historial en la consulta general.

Con `inventory.adjust` o admin, esa vista ofrece Regularizar para productos no
huevo. La modal utiliza `/inventario/saldos/{id}/regularizaciones`:

- Trasladar: saldo positivo no sanitario, producto activo con control de stock, cantidad
  exacta no mayor al disponible y destino activo compatible. Se verifica el
  producto por el endpoint de productos permitidos del destino.
- Cerrar saldo a cero tras recuento: admite saldo positivo o negativo, incluyendo
  productos históricos inactivos/sin control de stock. Explica que no crea stock
  en otra ubicación y no sustituye un traslado físico.

Ambos modos exigen motivo y una revisión separada antes de Confirmar.
El resumen identifica origen, producto, cantidad y destino o resultado cero,
y advierte que no admite reversión genérica. No se regulariza automáticamente.
Un fallo incierto bloquea editar/cerrar y permite repetir el mismo cuerpo y clave;
un rechazo definitivo permite corregir. Cambiar actor/permisos invalida contexto
y resultados tardíos.

## Validación

Las pruebas cubren tipos y categorías explícitos, sanidad, pérdidas, transferencias,
proveedor interno sin búsqueda por nombre y lista opcional fallida, enlaces por
producto, filtro de incompatibilidad y regularización con confirmación, permisos,
cantidades exactas, conflictos y reintentos inciertos. Los POST se verifican con
respuestas controladas, sin alterar existencias reales.

La entrega anterior, con Sanidad física habilitada, aprobó 956 pruebas en 126 archivos. El ajuste final de la modal
agrega cobertura de errores de transporte, respuesta ilegible con estado 200 y
fallos 5xx, conservando la intención y la clave de reintento. El navegador integrado
comprobó Sanidad real, filtro de tipo, consulta de incompatibles (dos saldos
históricos), revisión/cancelación de traslado y cierre a cero, enlaces desde
Medicamentos, teléfono de 320 px y escritorio de 1280 px en claro/oscuro. No se
confirmaron movimientos ni se modificaron saldos durante esa revisión. No hubo
cambios de dependencias o integración nativa; falta comprobación en dispositivo físico.

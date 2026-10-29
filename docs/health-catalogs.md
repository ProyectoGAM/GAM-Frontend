# Catálogos de vacunas y medicamentos

`features/health-catalogs` implementa los listados globales, el alta y la ficha de
consulta de vacunas. Las rutas existentes del sidebar se conservan:

- `/administracion/manejo-lotes/vacunacion`: listado de vacunas.
- `/administracion/manejo-lotes/vacunacion/nuevo`: alta de vacuna.
- `/administracion/manejo-lotes/vacunacion/:id`: ficha de vacuna por ULID.
- `/administracion/manejo-lotes/medicacion`: listado de medicamentos.
- `/administracion/manejo-lotes/medicacion/nuevo`: alta de medicamento.

Las páginas se cargan lazy y se protegen con el rol de administrador. El API
mantiene la validación autoritativa del usuario activo y sus permisos. Cambiar de
identidad o perder el rol descarta datos, borradores y respuestas pendientes.
La UP del filtro global no afecta a estos catálogos.

## Contratos

Fuentes: `GAM-Backend/contracts/openapi/vaccination.yaml` y `medication.yaml`.
`HealthCatalogsApi` utiliza `ApiClient` con rutas relativas y normaliza los campos
de ambos contratos para la presentación. La selección de proveedores reutiliza
`SuppliersApi`, recorre todas sus páginas y ofrece sólo activos para las altas.
Los filtros del listado también permiten proveedores inactivos para consultar
fichas históricas. Un fallo al cargar proveedores no bloquea la lectura del listado.

Vacunas consume `GET/POST vacunas` y `GET vacunas/{id}`. Su alta envía SKU,
nombre, descripción, proveedor y detalles opcionales en una sola tarjeta, con
el código identificado como Código de la vacuna. El formulario no presenta
unidad, cantidad, ubicación ni pasos de inventario y siempre omite `unidad_base`:
el backend conserva ese valor interno de catálogo (dosis en altas nuevas o la
unidad heredada al adoptar por SKU). No se alteran
identidades ni movimientos desde el frontend. Nombre y código no se prevalidan
con reglas inferidas: se presentan los errores y conflictos del servidor.

Medicamentos consume `GET/POST medicines`. Su alta sólo envía `name`,
`description` y `supplier_id`. La ficha es global y no crea productos, stock o
ubicaciones físicas. Las altas nuevas devuelven `product_id: null`; los vínculos
antiguos son metadata histórica y no habilitan nuevas operaciones de inventario.
El formulario no agrega SKU, unidad, estado, stock o fechas de aplicación.
Los nombres de proveedor y autor
en el listado corresponden a las instantáneas conservadas por el API. La vacuna
muestra el nombre actual de su proveedor, según su propio contrato.

Los formularios, listados y confirmaciones explican el alcance global y no
ofrecen ingresar stock en Sanidad, consultar stock físico o preparar vínculos,
tampoco para fichas históricas que conserven un ID de producto. La aplicación al
lote continúa por separado. Nuevo producto ofrece enlaces de página completa
a Nueva vacuna y Nuevo medicamento sólo para administradores.
Ver [alcance del almacenamiento](inventory-storage-rules.md).

Actualización de alcance global (28/10/2026): lint, las 963 pruebas en 126
archivos y build de producción aprobados en Docker. Se verificaron Nuevo
producto y la navegación hacia Nuevo medicamento en el navegador integrado,
con teléfonos de 320/390 px, escritorio de 1280 px y ambos temas. No se crearon
registros ni se modificó backend, dependencias o integración nativa. La prueba
de un dispositivo físico sigue fuera de esta comprobación.

El alta de vacunas también se verificó en móvil de 320/390 px y escritorio de
1280 px, claro/oscuro: una tarjeta de datos generales, código obligatorio de
catálogo y detalles desplegables, sin selector de unidad ni parámetros físicos
en el comando. Lint, las mismas 963 pruebas y build volvieron a aprobarse.

## Interacción

En ambas altas, la explicación del catálogo global se consulta desde el icono
de información junto a Datos de la vacuna o Datos del medicamento. Permanece
cerrada al entrar y reutiliza la ayuda accesible compartida para toque, teclado
y puntero, sin ocupar una tarjeta expandida debajo del formulario.

La búsqueda admite Enter y debounce de 300 ms. Filtros abre el diálogo centrado
compartido: proveedor para ambos catálogos; estado y SKU exacto para vacunas.
Limpiar sólo cambia el borrador y Ver resultados aplica. Buscar o aplicar filtros
vuelve a página uno. Los parámetros `buscar`, `proveedor`, `estado`, `sku` y
`page` conservan el contexto al entrar al alta o ficha y al volver. Sólo se envían
al backend los parámetros admitidos por cada catálogo. Las versiones de consulta
descartan respuestas de búsquedas o identidades anteriores.

Escritorio usa tablas y móvil tarjetas. Las descripciones largas de medicamentos
se pueden expandir en línea, sin inventar un endpoint de detalle. Los formularios
son páginas completas con una acción principal fija, áreas seguras y adaptación
al viewport del teclado. El espacio inferior descuenta el padding del shell,
igual que Nuevo producto. Todos los colores proceden de tokens GAM para ambos
temas. La ficha de vacuna es de lectura; no se incorporaron edición o cambios de
estado que no forman parte del diseño aprobado.

## Guardado y reintentos

Los POST envían una clave UUID en `Idempotency-Key`. Se bloquea el doble envío.
Tras un fallo de red, 5xx o respuesta ilegible, el formulario se congela y
Reintentar creación repite el cuerpo y la clave originales. La confirmación de
ese intento no depende de una nueva consulta de proveedores. Un 422 permite
corregir campos; 404/409 permiten revisar los datos y actualizan proveedores.
Los mensajes de validación en español del API de vacunas se asignan a los campos
correspondientes del formulario. El éxito muestra la ficha creada y enlaces al
listado; las vacunas también permiten abrir su detalle.

Salir de un borrador requiere confirmación y se impide durante un POST activo.
Si la creación es incierta, la confirmación recomienda reintentar antes de salir.
El intento vive únicamente en memoria de la página; no es una cola offline.
No hay cambios de dependencias ni integración Capacitor en esta implementación.

## Validación

Lint, las 932 pruebas de 124 archivos y el build de producción pasaron dentro de
Docker. Las 24 pruebas del feature cubren contratos HTTP, filtros, normalización,
permisos, validación por campo, proveedores paginados, respuestas tardías,
guardado incierto, doble envío, confirmación de salida y lectura de fichas.

El navegador integrado verificó los catálogos y proveedores reales, búsqueda de
medicamentos, filtro de estado de vacunas, ida/vuelta del alta conservando
filtros, ficha de vacuna, validación sin POST y cancelación del borrador. Se
revisaron escritorio y móviles de 320/360 px en claro y oscuro. Al final de los
formularios se midieron 16 px entre el contenido y la barra de guardado, sin
desbordamiento horizontal. Las capturas están en `.tmp/qa/health-*.png`.

Los POST y sus reintentos se verificaron mediante pruebas HTTP y de componentes:
no se crearon vacunas ni medicamentos de prueba en la base local. No se probó
un dispositivo físico ni el teclado nativo de Android/iOS.

# Catálogo de recetas

## Alcance

El feature `src/app/features/feed-recipes/` implementa el listado global, el alta y la
consulta de composición. Conserva `/administracion/manejo-lotes/Recetas` y carga
sus páginas de forma lazy desde `feed-recipes.routes.ts`. El sidebar mantiene
Recetas seleccionado en sus rutas descendientes y al usar parámetros de búsqueda.

**Nueva receta** abre `Recetas/nueva`, el formulario de alta global con nombre,
rendimiento por base, notas opcionales e ingredientes existentes.
**Ver receta** abre `Recetas/:id`, una consulta de composición, nota, estado,
rendimiento base y fecha de actualización, sin acciones de edición ni de stock.

## Datos y permisos

`FeedRecipesApi` consume `ApiClient` con rutas relativas:

- `GET /recetas`: `buscar`, `estado`, `page` y `por_pagina=25`.
- `GET /recetas/{id}`: composición actual, incluso de recetas inactivas.
- `POST /recetas`: nombre, nota, rendimiento y composición en gramos enteros;
  clave UUID en el encabezado `Idempotency-Key`.
- `GET /products?kind=raw_material&per_page=100&page=…`: opciones del formulario;
  recorre las páginas antes de habilitar la selección completa.

El contrato de referencia es `contracts/openapi/feed-recipes.yaml` del backend.
El servidor filtra por nombre y estado, pagina y ordena por ID descendente. No se
descargan todas las páginas para filtrar ni se agrega UP al catálogo. El número
de resultados proviene de `meta.total`, no del número de filas de la página.

`feed-recipes.view` permite consultar el listado y los detalles;
`feed-recipes.manage` permite acceder a Nueva receta. Se conserva el acceso de
administrador. Manejar recetas no implica permiso de lectura, de acuerdo con las
políticas publicadas. La navegación permite entrar a Manejo de Lotes por estos
permisos sin exponer Planes, Vacunación o Medicación a quien no los tiene.
El backend conserva la autoridad sobre cada consulta.

Los nombres pueden repetirse; las filas, enlaces y la vista de detalle usan el ID
estable. `rendimiento_g` y `cantidad_g` siguen siendo strings. La presentación en
kg usa aritmética entera con `BigInt`, admite fracciones de tres decimales y no
redondea ni convierte a `Number`. El rendimiento no se calcula sumando ingredientes.

## Interacción y presentación

La interfaz comienza en teléfono: tarjetas con nombre/ID, estado, rendimiento,
cantidad y vista previa de ingredientes, y una acción táctil Ver receta. En
escritorio pasa a tabla sin duplicar la consulta ni las acciones. El contenido
normal sigue desplazándose dentro de `ion-content`. Los colores provienen de
los tokens GAM, incluidos los estados activo e inactivo en claro/oscuro.

La búsqueda responde al escribir (250 ms) o presionar Enter. El botón **Filtros**
abre el diálogo compartido centrado, por ahora con estado. **Limpiar** sólo
modifica el borrador; **Ver resultados** aplica el filtro y vuelve a la primera
página. Cerrar con X o Escape conserva los valores aplicados y restaura el foco.
Abrir filtros procesa primero una búsqueda pendiente, para que su temporizador
no interrumpa la edición del borrador.

La búsqueda, estado y página se conservan en la URL. Los enlaces a Ver receta y
Nueva receta llevan ese contexto para volver al listado. Los parámetros ajenos
al catálogo no se envían al servidor; se validan estado y rango de página, y se
limita la búsqueda a 120 caracteres. Los valores de búsqueda/filtros/página usan
`replaceUrl` para no llenar el historial al escribir.

Carga, catálogo vacío, ausencia de coincidencias, página fuera de resultados,
error y falta de permiso tienen mensajes distintos. Reintentar mantiene el
contexto aplicado. Las versiones de consulta y las comprobaciones de destrucción
descartan respuestas tardías de otra consulta o identidad. Al perder el acceso se
limpian los resultados y se cierra el diálogo de filtros.

No se modifican los selectores existentes de recetas en elaboración, los planes
de manejo ni Stock de raciones. No cambia dependencias ni integración nativa.

## Crear receta

La pantalla presenta dos bloques: datos e ingredientes. Se comienza con una fila
y se pueden agregar o quitar ingredientes, conservando al menos uno y hasta el
máximo de 1000 del contrato. Los selectores compartidos admiten una descripción
opcional (SKU/estado), buscable además del nombre, y los iconos se habilitan sólo
para este formulario. Cada fila excluye los productos elegidos en otras filas;
la validación también rechaza duplicados y selecciones ajenas a las opciones.

Sólo son elegibles productos `raw_material`, `base_unit=g` y `stock_tracked=true`.
Se incluyen inactivos, identificados en el selector, y no se consulta ni exige
stock. El endpoint de productos conserva su permiso propio (`products.view`,
`management-plans.manage` o administrador); `feed-recipes.manage` no lo sustituye.
Si responde 403 se informa la falta de acceso al catálogo sin intentar un bypass.
Carga, fallo recuperable y ausencia de materias primas tienen estados distintos.

Nombre no vacío (hasta 160 caracteres), notas opcionales (hasta 5000) y cantidades
positivas se validan antes de enviar. La persona ingresa kg con coma o punto y
hasta tres decimales, sin agrupadores de miles ni notación científica. La
conversión usa `BigInt`: envía strings de gramos exactos de 1 a
9223372036854775807, tanto para ingredientes como para rendimiento. El rendimiento
se ingresa independientemente de la suma; no se pide un multiplicador ni UP.
El backend mantiene la validación autoritativa y crea la receta activa.

El formulario muestra errores de campo, incluidos `rendimiento_g` y los índices
`ingredientes.N.cantidad_g` devueltos por el servidor, sin descartar los datos.
La acción principal permanece al pie, con safe areas y ajuste a `visualViewport`;
el contenido de `ion-content` reserva espacio para ella. El primer error recibe
foco. El aviso previo recuerda que nombre, rendimiento y composición se definen
al crear; la edición posterior contratada sólo admite cantidades.

Una creación en curso bloquea doble envío, edición y salida de ruta. Ante una
respuesta incierta (red, 5xx o respuesta exitosa ilegible), conserva el cuerpo y
UUID y ofrece **Reintentar creación** con los campos bloqueados. No cambia de
clave para repetir el mismo contenido normalizado. Un 422 permite corregir;
un 409 informa el conflicto y actualiza las opciones del catálogo. Un contenido
corregido obtiene una nueva clave. El intento vive en memoria durante esta
pantalla; no es una cola persistente ni sobrevive a la recarga.

Al guardar se abre el detalle conservando el contexto del listado si se dispone
de `feed-recipes.view`. Quien sólo puede crear recibe una confirmación en la
página, sin un enlace a un detalle que no puede consultar. Al cambiar de identidad
o perder el permiso se limpian borrador/opciones/intento y se descartan respuestas
tardías. Salir con cambios pide confirmación mediante un alert de Ionic; recargar
activa la protección nativa del navegador cuando corresponde.

## Validación

- `npm run lint`: correcto, ejecutado dentro de Docker.
- `npm run test:ci`: 899 pruebas en 118 archivos, dentro de Docker. Incluye
  permisos independientes, paginación, contexto en URL, respuestas tardías,
  precisión de gramos, envío real del formulario de búsqueda sin recarga,
  creación HTTP con cuerpo/encabezado contratados, errores de campo, duplicados,
  reintento estable y orden de índices de ingredientes tras reorganizarlos.
- `npm run build`: compilación de producción dentro de Docker.
- Navegador integrado con el API local: listado real, búsqueda con Enter,
  estado inactivo sin coincidencias, cancelación y limpieza del borrador,
  consulta de composición y retorno con búsqueda. En Nueva receta se comprobaron
  opciones reales, búsqueda por SKU, exclusión de duplicados, agregar ingredientes,
  validación antes del envío, borrador y confirmación de salida. No se guardaron
  recetas de prueba en el catálogo local; el POST y su recuperación se cubren en
  las pruebas automatizadas del formulario y del servicio HTTP.
- Presentación clara/oscura en escritorio (1280 × 720) y móvil (390 × 844),
  listado sin desbordamiento horizontal a 320 px y diálogo centrado a 320 × 360.
  Capturas locales de QA en `.tmp/qa/recipes-{desktop,mobile}*.png`.
- Alta en claro/oscuro y móvil/escritorio, con ancho de 320 px sin desbordamiento
  horizontal y altura reducida a 500 px. Capturas en
  `.tmp/qa/recipe-create-{desktop,mobile}*.png`. Los campos mantienen el foco
  visible y la barra reserva espacio sin cubrir el final del formulario.
- `npm audit --omit=dev`: 0 vulnerabilidades, dentro de Docker.

La paginación y los estados de error/permisos se cubren con pruebas de
comportamiento; el catálogo local usado en el recorrido visual contiene una
receta. No se probaron dispositivos físicos Android/iOS en esta etapa.

# Elaborar desde una planta de ración

Debajo de la lista de ingredientes se muestran **Agregar Producto** y **Ajustar
Stock**, encima de **Elaborar**. El primero abre un modal Ionic adaptable con el
formulario actual de ingredientes, los errores y los estados del catálogo.
**Ajustar Stock** abre un modal para seleccionar una materia prima ya registrada,
ingresar kg y elegir **Sumar**, **Restar** o **Fijar stock** desde un selector
de operación, con vista previa. Operación y cantidad comparten fila desde 360 px;
en teléfonos más angostos se apilan para conservar controles legibles.
El motivo es obligatorio por contrato. Las cantidades admiten coma o punto y hasta
tres decimales de kg; establecer permite cero, sumar/restar exigen un valor positivo.
Se conservan los seis decimales de gramos de los saldos existentes mediante BigInt.
Se rechazan resultados negativos o fuera del rango del inventario.

**Agregar Producto** y **Ajustar Stock** quedan deshabilitados cuando la planta
no está operativa (mantenimiento, fuera de servicio o inactiva), con una explicación
visible. También se bloquea la apertura de sus formularios y el alta de ingredientes
desde sus manejadores. Si la planta deja de estar operativa con el alta abierta,
se impide guardar y se permite cerrar el formulario. Al volver a operativa se
habilitan nuevamente las acciones, siempre que el stock haya cargado.

El guardado usa `POST plantas-racion/{planta}/ingredientes/{producto}/ajustes`,
definido en `contracts/openapi/feed-recipes.yaml`, con `{accion, valor_g, motivo}`
y `Idempotency-Key`. Requiere una planta operativa; el servidor verifica producto,
estado, saldo y contexto de autenticación. Todavía no exige un permiso funcional
específico. No usa los ajustes genéricos de Inventario ni modifica alimento.
La vista previa utiliza el saldo consultado; el servidor aplica sumar/restar al saldo
vigente y devuelve el resultado real, que se muestra tras guardar y refrescar el stock.

Durante el envío se bloquean edición, doble submit y cierre. Si la respuesta es
incierta (red/timeout/5xx), se conserva exactamente el cuerpo y la clave originales
para reintentar sin duplicar el movimiento. El pendiente se guarda en memoria y
sessionStorage por usuario/sesión/planta, sin secretos, y se recupera al reabrir o
recargar; cambiar identidad descarta el pendiente abierto y las respuestas tardías.
Los rechazos definitivos permiten corregir; 409/404 también actualizan el stock.
Se cierra con Cancelar, ×, Escape o el fondo; durante el guardado se bloquea el
cierre. El foco va al título al abrir y vuelve al botón al cerrar.
**Elaborar** queda al final de la lista de ingredientes.
Conserva los controles de editar, estado y eliminar. La
acción requiere una planta operativa; su ruta comprueba el tipo y la pertenencia
a la UP. El servidor sigue siendo la autoridad para permisos, estado y stock.

La página `:id/galpon/:houseId/elaborar` pertenece a `production-units` y se carga
de forma diferida. Sus pasos locales son receta/multiplicador, revisión y resultado.
El resultado solo existe durante ese recorrido: no hay ruta de comprobante,
historial, cancelación ni acceso adicional desde Inventario. Volver a la planta
reemplaza la entrada de navegación y vuelve a consultar su stock.

`FeedManufactureService` usa `ApiClient` y el contrato del backend
`contracts/openapi/feed-recipes.yaml`:

- `GET recetas?estado=active&por_pagina=100&page=…`: catálogo completo paginado,
  con nombre, ID y rendimiento para distinguir nombres repetidos.
- `POST recetas/{id}/calculo`, `{cantidad_g}`: cálculo previo sin reserva ni
  comprobación de disponibilidad.
- `POST elaboraciones`, `{receta_id, planta_id, cantidad_g}` y encabezado
  `Idempotency-Key`: registro o recuperación idempotente de la misma operación.

La persona selecciona la receta e ingresa únicamente un **multiplicador entero
positivo**, con 1 por defecto. El total es de solo lectura: rendimiento base ×
multiplicador (por ejemplo, 13 kg × 2 = 26 kg). Al cambiar de receta se conserva
el multiplicador y se recalcula desde su base. La revisión muestra también esta
relación con el rendimiento y factor devueltos por el servidor.

El cálculo utiliza enteros `BigInt`, respeta el máximo de 999999999999 gramos y
envía el total en `cantidad_g` al contrato existente. Se rechazan cero, negativos,
fracciones, notación científica y totales fuera de rango antes de llamar al API.
No se infiere el rendimiento sumando ingredientes. La recuperación de pendientes
conserva el cuerpo y la clave originales, incluso los creados antes de este cambio.
Los saldos fraccionarios de ingredientes se formatean sin perder sus decimales.

La revisión informa que se consume primero la planta elegida y luego otras
plantas operativas de la misma UP, y que el alimento se acredita por receta+UP.
El cálculo no congela la fórmula: se aplica la vigente al confirmar. Garantizar
una versión revisada requeriría ampliar el contrato del backend.

Solo el resultado confirmado muestra la distribución real y los saldos históricos
anterior/resultante. Los conflictos requieren volver a revisar/calcular. Un
fallo de red, timeout o error 5xx conserva el cuerpo y la clave originales: no se
permite editar ni iniciar otra operación hasta resolverla. Consultar resultado
reenvía exactamente la misma petición, completándola si no se había registrado o
recuperándola si ya existe. El backend impide duplicar sus efectos.

El pendiente se conserva en memoria y `sessionStorage`, por usuario, sesión y
planta, para poder recuperarlo al volver o recargar la pestaña. No contiene
credenciales ni tokens de autenticación. Si el almacenamiento está bloqueado,
se conserva en memoria durante la vida de la aplicación. Al cambiar la identidad
con la página abierta se descartan sus datos y se ignoran las respuestas tardías.
Cerrar la pestaña elimina la recuperación persistida; este flujo no sustituye
un historial de inventario.

Catálogo y cálculo requieren `feed-recipes.view` o administrador. El backend
todavía no exige un permiso funcional específico para elaborar; el frontend
no crea ni simula permisos. Los errores de acceso, catálogo vacío, cantidad,
estado y conexión se presentan dentro del flujo.

No hay cambios de plugins, configuración o integraciones nativas. Se utilizan
controles Ionic, el scroll existente de `ion-content`, áreas seguras y tokens
GAM compartidos para claro y oscuro.

## Verificación del multiplicador — 26/10/2026

Lint, las 718 pruebas de la suite completa (103 archivos) y la compilación de
producción pasaron en Docker. Las pruebas cubren multiplicadores inválidos,
límites exactos, cambio de base y recuperación del cuerpo/clave de operaciones
pendientes. El navegador integrado verificó el cálculo real de 13 kg × 2 = 26 kg
y sus ingredientes, el regreso a editar y la vista móvil a 320 px en oscuro sin
desbordamiento horizontal. También se revisó la vista de escritorio en claro.
No se confirmó ninguna elaboración ni se modificó stock durante este recorrido.
No se probaron dispositivos físicos.

## Verificación de acciones por estado — 26/10/2026

Lint, 722 pruebas en 103 archivos y build de producción aprobados en Docker.
Las pruebas del detalle verifican los botones y manejadores bloqueados en
mantenimiento, fuera de servicio e inactiva, su rehabilitación al volver a
operativa y la imposibilidad de guardar un alta abierta tras el cambio de estado.
El navegador integrado comprobó las acciones disponibles en una planta operativa.
Las plantas locales estaban operativas; no se modificaron sus estados ni stocks
para esta verificación.

## Verificación del ajuste de ingredientes — 23/10/2026

Lint y build de producción aprobados en Docker. La suite completa pasó con
700 pruebas en 102 archivos usando dos procesos de Vitest para evitar la
saturación local; la configuración temporal no modifica la del proyecto.
La auditoría de dependencias de producción no detectó vulnerabilidades.

El navegador integrado comprobó las tres vistas previas (120 kg con 25 kg da
145, 95 o 25 kg), rechazo de saldo negativo y motivo vacío, apertura/cierre,
Escape y retorno del foco. Se revisaron 320, 390 y 1280 px, claro y oscuro, sin
desbordamiento horizontal ni errores de consola. El modal permite scroll cuando
su contenido supera el alto disponible.

Se registró contra la API local un ajuste `establecer` de 120 kg sobre los
120 kg existentes, con motivo explícito de verificación. La respuesta confirmó
el registro y la recarga mantuvo Maíz en 120 kg y Soja en 150 kg. Queda el
historial de esa prueba sin modificar las existencias. No se probó dispositivo
Android/iOS físico.

## Verificación local del 22/10/2026

Lint y build de producción aprobados en Docker. La suite completa pasó con 649
pruebas en 96 archivos, incluida la apertura/cancelación del formulario desde el
botón + y el regreso del foco. La auditoría de
dependencias de producción no detectó vulnerabilidades. El build conserva avisos
de tamaño de SCSS y dependencias CommonJS, sin superar límites de error.

El navegador integrado comprobó selección, cantidad inválida, cálculo real,
volver a editar, registro, distribución real, regreso y nuevo inicio. Se revisó
la presentación a 320, 390 y 1280 px, en claro/oscuro, sin desbordamientos en las
pantallas comprobadas ni errores de consola. La hoja se renderiza en el botón
al final de la sección de ingredientes.

El botón + se verificó en el navegador a 320 y 390 px, en claro y oscuro: área
táctil de 44 × 44 px junto al título, apertura con Enter, foco inicial en el
formulario y regreso al cerrar con Cancelar o ×. Se conserva Elaborar al final,
sin desbordamientos ni errores de consola. Esta comprobación no escribió stock.

La elaboración local de prueba #1 produjo 13 kg y se canceló con la operación
#3. Como el saldo de alimento ya era negativo antes de la prueba, la restauración
utilizó dos ajustes compensatorios y la cancelación dentro de una única
transacción, con motivos explícitos de verificación. Se comprobaron el saldo de
alimento y cada ingrediente contra los valores anteriores: quedaron restaurados.
Se conserva la trazabilidad de esta prueba; no se borraron movimientos ni se
modificaron fuentes del backend. No se probó un dispositivo Android/iOS físico.

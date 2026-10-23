# Elaborar desde una planta de ración

El detalle de una planta muestra un botón **+** junto a **Stock de ingredientes**,
con nombre accesible y ayuda “Agregar ingrediente”. Abre un formulario debajo de
la lista, con título y Cancelar; el botón pasa a cerrar (×) mientras está abierto.
El foco va al título del formulario al abrir y vuelve al botón al cerrar.
**Elaborar** queda al final, debajo del formulario cuando está abierto.
Conserva los controles de editar, estado y eliminar. La
acción requiere una planta operativa; su ruta comprueba el tipo y la pertenencia
a la UP. El servidor sigue siendo la autoridad para permisos, estado y stock.

La página `:id/galpon/:houseId/elaborar` pertenece a `production-units` y se carga
de forma diferida. Sus pasos locales son receta/cantidad, revisión y resultado.
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

La cantidad visible está en kg, admite coma o punto y hasta tres decimales. La
conversión usa enteros `BigInt`, respeta el máximo de 999999999999 gramos y exige
múltiplos del rendimiento. No se infiere el rendimiento sumando ingredientes.
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

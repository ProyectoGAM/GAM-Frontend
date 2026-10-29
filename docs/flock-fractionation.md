# Fraccionamiento de lotes

El detalle abre `/administracion/lotes/lotes/:id/fraccionar`. La página permite
Parcial/Total y Galpón vacío/Lote existente, con resumen previo y fecha/motivo
opcionales. Total a galpón vacío conserva el mismo lote; total a un receptor
finaliza el origen. Un receptor existente conserva sus datos y plan.

## Selección de destinos

La UP se obtiene del lote original cargado desde el API. No se deriva del selector
general del dashboard ni de parámetros de navegación. Las consultas paginadas de
galpones y lotes se limitan a esa UP, y los lotes se vuelven a filtrar por su UP.

- Galpón vacío: galpones avícolas operativos diferentes del origen, sin lotes
  no finalizados con aves vivas. Se incluyen galpones sin registros, con lotes
  finalizados (aunque el saldo histórico sea positivo) y con lotes vigentes sin aves.
- Lote existente: galpones avícolas operativos diferentes del origen con un lote
  vigente de la misma raza. El selector muestra galpón, código y aves del receptor.
  Se permite un receptor vigente con cero aves; un lote finalizado no es receptor.
- No se consulta, muestra, compara ni usa `bird_capacity` para filtrar o validar
  este fraccionamiento. Tampoco se usa `current_occupancy` para invalidar un galpón
  cuyo único lote está finalizado: la clasificación se obtiene de los lotes.

Esta política de capacidad procede de la indicación del usuario y se adelanta al
backend. No se modifica el backend ni se eluden sus validaciones: un rechazo del
servidor se muestra conservando el formulario. No se cambia la creación de lotes
ni otras funciones con reglas de capacidad fuera de este recorrido.

## Contrato, identidad y reintentos

`FlockFractionationService` carga los datos a través de los servicios existentes y
envía `POST flocks/:id/redistributions` mediante ApiClient. Se envían la versión
del origen y, para un receptor, su versión. Se omiten los campos incompatibles:
código sólo para Parcial hacia galpón vacío; receptor o galpón, nunca ambos.

La autorización usa admin o `flocks.redistribute`; el servidor valida el permiso.
Un cambio de identidad limpia datos e invalida respuestas pendientes. Un cambio
de ruta invalida consultas anteriores. Un cambio de UP general conserva el
origen del formulario. Actualizar destinos consulta de nuevo el lote y sus
versiones; no repite escrituras automáticamente.

Cada comando usa una clave de idempotencia. Ante respuesta incierta se bloquean
los campos y la navegación; Reintentar usa el cuerpo y la clave originales.
Tras un rechazo confirmado, se puede corregir o actualizar antes de volver a
enviar con una nueva clave. Se impide el doble envío mientras guarda. El API
mantiene los efectos autoritativos. La respuesta pública identifica al destino
como `destination_flock`; la confirmación muestra su código y el enlace
**Ver lote de destino →**, con etiqueta fija y ancho adaptable.

Los datos no se persisten en el navegador. Se advierte antes de abandonar un
formulario modificado y antes de recargar. La confirmación pendiente se conserva
sólo en memoria mientras la página sigue abierta.

## Presentación

Se usan tokens GAM de ambos temas, controles táctiles y el scroll del ion-content
del shell. El resumen ocupa una segunda columna en escritorio y sigue al
formulario en teléfono. Las acciones están en el flujo normal para evitar
ocultar controles o errores con el teclado. Automático conserva su diseño celeste.

Los diseños están en [Fraccionar lote](designs/fraccionar-lote.md). Sus imágenes
originales mostraban plazas disponibles: esa leyenda queda sustituida por esta
política y no está presente en la implementación.

## Verificación

Se probaron los cuatro cuerpos de solicitud, los destinos sin aves/con lotes
finalizados, receptores con cero aves, UP y raza, ausencia de validación por
capacidad, doble envío, reintentos inciertos, versiones, errores y cambio de identidad.
Las 26 pruebas nuevas pasaron. La suite completa tuvo cuatro timeouts de 5 s en
pruebas existentes en la primera ejecución; se repitió con dos workers y el
timeout original: 992 pruebas aprobadas en 129 archivos.

En el navegador integrado contra Docker se comprobó el lote `LOT-FEED-TEST`,
los receptores reales de Granja El Ombú, los resúmenes parcial/total y que cambiar
el selector general a Santa Clara no altera la UP original. Se revisaron claro,
oscuro, escritorio, 320 px y campos opcionales, sin desbordamiento ni errores de
consola. No se confirmaron movimientos sobre los datos reales. Capturas:
`.tmp/qa/fractionation-existing-{desktop,mobile}-{light,dark}.png`.

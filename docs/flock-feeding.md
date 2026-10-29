# Alimentación del lote

La ruta `/administracion/lotes/lotes/:id/alimentacion` implementa el diseño
`docs/designs/flock-feeding-mobile-desktop.png`. El enlace de Detalle de lotes
abre esta pantalla; la URL anterior bajo Manejo de Lotes redirige a ella.
Los datos de la imagen son ilustrativos; la pantalla usa exclusivamente la API.
El formulario sigue `docs/designs/feeding-editor-v3.png`, con el orden de modos
invertido por indicación posterior del usuario: Automático primero, Manual después.

## Resumen en Detalle de lotes

La tarjeta de Alimentación muestra la ración vigente configurada y el modo:
manual en amarillo tenue y automático en celeste, con los mismos tokens que el
tag de la pestaña Alimentación. El nombre se resuelve por saldos de la UP o una
instantánea que coincida con la receta vigente; si no está disponible, se muestra
su identificador, sin atribuirle el nombre de otra receta.

El próximo cambio previsto se calcula con la primera etapa copiada cuyo
`start_day` sea mayor que `edad_dias` de alimentación (edad basada en día 1).
Se usa exclusivamente el historial que coincida con el ID de la configuración
vigente. La fecha se obtiene desde el día actual de America/Montevideo y se
presenta como previsión: la API evalúa la disponibilidad al llegar ese día.
En manual se conserva la previsión y se aclara que los cambios del plan requieren
volver a automático. No se aplica ningún cambio desde esta tarjeta.

Se distinguen plan sin próximas etapas, lote finalizado y consulta del plan no
disponible. Un fallo del historial o los saldos no oculta la alimentación vigente;
un fallo de alimentación no bloquea el resto del detalle.

Validación del resumen: lint, 568 pruebas (89 archivos), build y auditoría de
producción sin vulnerabilidades, ejecutados dentro de Docker. Revisión real en
LOT-FEED-TEST, escritorio y 390 × 844, claro y oscuro: ración vigente y tag manual
amarillo, navegación entre detalle y alimentación y aviso de plan sin futuras
etapas. Las fechas futuras y el modo automático se cubren con pruebas; el lote de
revisión quedó en manual y no se alteraron sus consumos ni su configuración.

## Contratos y comportamiento

Fuente: `../GAM-Backend/contracts/openapi/flock-feeding.yaml` y
`../GAM-Backend/contracts/openapi/feed-recipes.yaml`.

- `GET lotes/{id}/alimentacion`: ración vigente, cantidad diaria, modo y estado
  finalizado. El modo automático sigue la etapa del plan; un cambio manual se
  aplica desde hoy y deja una cantidad diaria fija. El formulario advierte esa
  consecuencia. No hay registro de comidas individuales.
- `GET saldos-alimento?up_id=...`: se recorren todas las páginas. Para cambiar la
  ración vigente solo se ofrecen recetas activas con saldo positivo en la UP del
  lote. Se permite modificar únicamente la cantidad conservando la receta actual,
  incluso si el catálogo falla o la receta ya no tiene stock positivo.
- `POST lotes/{id}/alimentacion/manual`: receta, cantidad diaria o ambas. El
  formulario recibe kg con hasta tres decimales y envía gramos enteros exactos;
  exige cantidad positiva, con máximo de 999.999.999.999 g.
- `GET lotes/{id}/consumos-alimento`: se carga todo el historial paginado antes de
  mostrar totales. Una página fallida invalida el conjunto completo. La tabla se
  pagina localmente (20 registros), sin reducir los acumulados. Se utilizan las
  cantidades y recetas **efectivas**, después de rectificaciones, incluidas las
  cantidades cero. Las sumas usan `bigint`; no se pierde precisión por convertir
  acumulados a `Number`.
- La gráfica usa ECharts con una sola serie de barras. El selector admite una
  ración a la vez, por ID (los nombres pueden repetirse), durante los últimos 7 o
  30 días hasta hoy inclusive en `America/Montevideo`, o todo el historial.
  Los días sin registro son huecos, no ceros fabricados. El resumen por ración
  siempre abarca todo el lote, independientemente de los filtros de la gráfica.
  Una tabla desplegable ofrece los valores exactos sin depender de tooltips.
- `POST lotes/{id}/consumos-alimento/{consumo}/rectificaciones`: permite editar
  receta, cantidad o ambas, exige motivo y admite cero. Se consulta el catálogo
  de saldos de la **UP histórica del consumo**, incluyendo recetas inactivas y
  sin stock, conservando además las recetas original y efectiva del registro.
  No se altera la alimentación vigente ni el plan. No existen acciones de
  eliminación, anulación o cancelación de consumos en esta interfaz.
- Las mutaciones envían `Idempotency-Key`. Los reintentos de resultado incierto
  conservan la clave si el contenido no cambia. Cambiar de lote o usuario limpia
  el estado e invalida respuestas anteriores. Un lote finalizado bloquea cambios
  de alimentación vigente, pero conserva consulta y rectificación histórica,
  conforme al contrato.

Los nombres se resuelven con saldos de la UP y snapshots de etapas que coincidan
con la receta efectiva; si no hay nombre disponible se muestra `Receta #ID`, sin
atribuir el nombre de otra receta. Los endpoints nuevos no agregan permisos
funcionales: la API valida autenticación, contexto compartido y pertenencia.
No se consulta el catálogo administrativo de usuarios ni el catálogo global de
recetas que requiere `feed-recipes.view`.

## Formulario de configuración: automático y manual

- El modo vigente se selecciona al abrir. Las dos opciones son radios nativos
  excluyentes con aspecto de botones, compatibles con teclado: Automático a la
  izquierda en celeste, Manual a la derecha en amarillo tenue. Sus colores se
  definen mediante tokens propios centrales para claro y oscuro.
- Los labels son `Ración` y `Cantidad (kg)`. El campo de cantidad mantiene un
  sufijo visual `kg` independiente del dato editable. Las opciones de conservar
  muestran el nombre y la cantidad vigentes, sin ocultarlos detrás de una opción
  genérica. Las cantidades se siguen enviando como gramos enteros exactos.
- Los avisos extensos se trasladan a tooltips accesibles por clic, toque, foco y
  hover. Escape cierra la ayuda antes de alcanzar la modal. El componente genérico
  existente se trasladó desde Reportes a `shared/components/info-help.component.ts`
  para reutilizarlo en ambas funciones, conservando sus pruebas anteriores.
- Solo al pasar de Automático a Manual, después de validar los datos, se abre la
  confirmación con la receta y la cantidad diaria que quedará fija. Cancelar o
  pulsar Escape conserva el modo persistido y los datos del formulario. Confirmar
  envía una única operación; un cambio de receta sin cantidad incluye los gramos
  vigentes mostrados en la confirmación para fijar exactamente ese valor.
- Manual a Manual y Manual a Automático no solicitan confirmación. Si el lote ya
  está en automático, la acción queda deshabilitada hasta elegir Manual, evitando
  registrar configuraciones automáticas idénticas desde el formulario.
- `POST lotes/{id}/alimentacion/automatico` envía `{}` y `Idempotency-Key`. La API
  retoma el plan copiado según la edad actual, omitiendo las recetas inactivas
  según las reglas del contrato. La selección no usa etapas futuras ni la última
  etapa del plan sin considerar la edad. Después del guardado se vuelve a consultar
  alimentación, historial de consumos y saldos; no se rectifican consumos.
- En automático los campos están bloqueados. Si ya era el modo vigente, muestran
  los valores reales consultados. Si se vuelve desde manual, muestran `Según el
  plan vigente` hasta aplicar y consultar los valores reales. Esta limitación fue
  aceptada expresamente por el usuario: no existe una consulta de vista previa
  exacta del retorno en el contrato y no se modifica el backend ni se duplican
  sus reglas en el frontend. Los campos manuales previos nunca se envían a la
  operación automática.

La confirmación usa un diálogo nativo dentro de la modal Ionic, con foco inicial
en la acción de cancelar, navegación contenida y devolución del foco. Al terminar
el guardado, la modal conserva el ciclo de cierre por `didDismiss` corregido
anteriormente. El cierre solicitado por un cambio de lote/identidad y la destrucción
del editor descartan la confirmación sin enviar operaciones.

## Nombre del responsable: dato pendiente del backend

La etiqueta automática es `Automático · Plan de manejo`. La manual sigue el
formato `Manual - Nombre` cuando el nombre puede verificarse: se consulta
`GET lotes/{id}/alimentacion/historial` y se compara el `created_by` de la
configuración vigente (mismo `id`) con el usuario autenticado. Solo en esa
coincidencia se utiliza el nombre del usuario actual.

Para otros responsables se muestra `Manual - Responsable no disponible`.
El contrato actual devuelve un ID en el historial y ningún nombre en la consulta
vigente. Por decisión del usuario, este cambio modifica solo el frontend. Queda
pendiente que la API publique el nombre del actor de la configuración manual
vigente con los mismos permisos de consulta de alimentación; también debe definir
el caso de actor eliminado o ausente. No se inventa un campo HTTP ni se atribuye
un cambio ajeno al usuario que está consultando.

## Interfaz y validación

Diseño móvil primero con historial apilado, modales Ionic, un único `ion-content`
por pantalla/modal, controles táctiles y desplazamiento con teclado. Escritorio
muestra gráfica y resumen en columnas. Todos los colores usan los tokens GAM
existentes para claro y oscuro; no se agregaron dependencias, plugins ni cambios
de configuración nativa. El formulario permite cambios manuales y el retorno
explícito al modo automático mediante el contrato existente.

Ejecutar las validaciones exclusivamente dentro de Docker, como exige
`docs/development-workflow.md`:

```bash
docker compose -f compose.dev.yaml exec -T frontend npm run lint
docker compose -f compose.dev.yaml exec -T frontend npm run test:ci
docker compose -f compose.dev.yaml exec -T frontend npm run build
```

## Comprobación en el entorno local

- Lint y compilación de producción completados dentro de Docker; el build
  mantiene avisos de presupuestos SCSS y dependencias CommonJS. La página de
  alimentación es lazy y su chunk propio mide aproximadamente 45 kB sin comprimir,
  además de los chunks compartidos de ECharts/Ionic.
- Suite completa: 88 archivos, 544 pruebas aprobadas. Los casos nuevos cubren
  cantidades exactas, rectificaciones, paginación completa, filtro de una ración,
  disponibilidad en la UP, autor verificable, reintentos e invalidación de
  respuestas al cambiar de lote o de identidad. Los últimos ajustes del formulario
  y cantidades también pasaron sus ocho casos específicos.
- `npm audit --omit=dev` dentro de Docker: cero vulnerabilidades. Se sincronizó
  el volumen con `npm ci`, sin modificar versiones ni el lockfile.
- Durante la revisión, la base local carecía de las tablas nuevas. Con
  autorización expresa del usuario se aplicaron únicamente las migraciones
  existentes `2026_10_13_075223_create_feed_stock_operations_tables` y
  `2026_10_13_115029_create_flock_feeding_tables`. La migración pendiente de
  reporting no formó parte de esta operación.
- Revisión visual autenticada en 390 × 844 y 1440 × 1000, con tokens de claro y
  oscuro. Se comprobaron los estados de API no disponible y de historial vacío.
  Las consultas ya responden después de las migraciones. PONEDORAS-89, creado
  anteriormente, no tiene configuración ni consumos en estas tablas; las
  migraciones no inicializan retrospectivamente sus etapas.
- Verificación posterior con `LOT-FEED-TEST`, indicado por el usuario, en móvil
  (390 × 844) y escritorio (1440 × 1000), claro y oscuro: ración vigente
  `Ración demo inicial`, 9,6 kg/día, siete consumos y acumulado de 45,5 kg.
  La gráfica muestra 40,7 kg en los últimos siete días (seis fechas) y 45,5 kg
  en todo el historial (siete fechas); el resumen global no cambia al filtrar.
  La tabla desplegable coincide con los valores del historial, incluido el
  registro del 12 de octubre rectificado a 8,2 kg y marcado `Editado`.
- Se verificaron apertura y cierre de ambos formularios, cantidad diaria cero
  rechazada y edición sin motivo bloqueada. En móvil el formulario de edición
  permite desplazarse hasta los campos y mantiene accesible su acción de guardar;
  el historial se apila sin tabla horizontal. No se detectaron errores de consola
  en la revisión. No se guardaron consumos ni cambios manuales en el lote.
- El lote de prueba solo tiene una ración histórica y su saldo en la UP es
  -45,5 kg. El formulario vigente no ofrece recetas nuevas sin stock positivo;
  permite conservar la ración y editar únicamente la cantidad. La edición
  histórica sí conserva la receta del registro, conforme al contrato.
  La alternancia entre distintas raciones y el guardado efectivo de mutaciones
  permanecen cubiertos por pruebas con respuestas simuladas; no se añadieron
  recetas, stock ni consumos para ampliar esta comprobación visual.

Los lotes anteriores que carezcan de configuración muestran un aviso explícito;
su inicialización debe resolverse desde el backend con etapas válidas, conservando
la historia del lote. No se fabrica una ración vigente a partir de los saldos de
stock. No se modificó código del backend.

## Regresión del cierre del editor (15 de octubre)

El guardado correcto destruía el componente antes de que Ionic cerrara su modal.
La API confirmaba el cambio y se actualizaba el historial, pero quedaba un overlay
huérfano con los controles en `Guardando…`. Ahora el editor libera el bloqueo y
cambia `isOpen` a falso; se conserva montado hasta recibir `didDismiss`. El botón
Cerrar usa el mismo ciclo. También se solicita el cierre al cambiar de lote o
identidad sin destruir prematuramente el editor durante la recarga de la página.

Las pruebas de regresión simulan respuestas demoradas tanto para una rectificación
como para un cambio manual: verifican bloqueo durante el envío, un solo envío,
cierre permitido tras el éxito, destrucción después de `didDismiss` y reapertura
con un formulario nuevo. Un error de API conserva los datos y permite reintentar.
Los 12 casos de la página pasan dentro de Docker.

Validación final de la regresión: lint aprobado, 88 archivos y 547 pruebas
aprobadas en la suite completa, y compilación de producción correcta. Todo se
ejecutó dentro de Docker; el build conserva los avisos de presupuestos SCSS y
dependencias CommonJS documentados arriba.

En el navegador se comprobó cerrar y volver a abrir la edición de `LOT-FEED-TEST`
en escritorio y móvil (390 × 844). Después de cerrar quedaron cero editores y
cero modales visibles en el DOM. El registro del 14 de octubre conserva los 0 kg
guardados previamente por el usuario; estas comprobaciones no enviaron nuevas
rectificaciones ni cambios de alimentación. El guardado exitoso y fallido de esta
regresión se verificó con respuestas simuladas en las pruebas automatizadas.

## Verificación del formulario con selector de modo (15 de octubre)

Con autorización expresa del usuario se hicieron dos cambios de configuración
en `LOT-FEED-TEST` a través de la interfaz y la API reales:

1. Manual (20 kg/día) a Automático, sin confirmación: la API retomó la ración
   `Ración demo inicial` y los 9,6 kg/día del plan vigente. Al volver a abrir el
   formulario se mostraron esos valores bloqueados y la acción permaneció
   deshabilitada mientras no se eligiera otro modo.
2. Automático a Manual (20 kg/día): aplicar abrió la advertencia con la cantidad
   exacta. Cancelar con Escape conservó la alimentación vigente y el formulario;
   volver a aplicar y confirmar guardó el modo manual y cerró correctamente la
   modal. El lote quedó nuevamente en manual con 20 kg/día y la misma ración.

No se enviaron rectificaciones de consumos ni otros cambios de configuración.
El acumulado permaneció en 45,5 kg y el registro del 14 de octubre, en 0 kg.
El historial de configuración incorpora las dos operaciones autorizadas.

Se revisaron teléfono (390 × 844) y escritorio (1440 × 1000), claro y oscuro,
radios por teclado, sufijo `kg`, nombres/cantidades en las opciones de conservar,
tooltips por toque y cierre con Escape. Los campos automáticos se mantuvieron
bloqueados, también al cambiar de modo con las flechas del teclado. La revisión
se hizo en navegador; no se incorporaron dependencias ni cambios de plugins o
configuración nativa.

Suite completa: 88 archivos y 555 pruebas aprobadas. Tras el último ajuste de
cierre solicitado por el padre y la limpieza de confirmaciones, pasaron los 33
casos específicos de alimentación y ayuda compartida, incluido el nuevo caso
de cierre durante una confirmación. Lint final aprobado, todo dentro de Docker.
La compilación de producción también finalizó correctamente en Docker; conserva
avisos de presupuestos SCSS y CommonJS, sin errores. La revisión final del
navegador no registró errores de consola. Se restauraron el tema claro y el tamaño
normal del navegador, dejando abierto el formulario implementado.

### Posición de los tooltips

Las ayudas del formulario de alimentación (general, ración y cantidad, en ambos
modos y en la edición de consumo) se abren abajo y a la derecha del icono, con
una separación de 8 px en ambos ejes. El ancho se adapta al espacio disponible hasta un máximo
de 380 px; la posición vertical se limita al área visible. En teléfono se reduce
el relleno y se permite envolver palabras largas, conservando el acceso por
toque, foco y teclado. La preferencia se configura con `placement="right"` en
el componente compartido; Reportes conserva su colocación anterior.

La revisión visual comprobó las ayudas a la derecha en escritorio, 390 px y
320 px, sin desbordamiento horizontal, y la ayuda de los campos automáticos.
Escape deja que el popover nativo consuma su propio cierre antes de notificar al
componente, evitando que el mismo gesto alcance la modal Ionic. En navegadores
sin popover nativo se conserva el cierre explícito de la ayuda. No se guardaron
cambios en el lote durante esta revisión de posición.

Validación: suite completa de 556 pruebas aprobada; tras el ajuste de Escape,
los seis casos de ayuda compartida, lint y build final pasaron dentro de Docker.
La consola del navegador no registró errores. El build conserva los avisos
SCSS/CommonJS ya documentados.

El ajuste posterior solicitado coloca el inicio abajo y a la derecha del icono
(8 px por eje cuando cabe en la pantalla), conservando los límites del viewport.
Se comprobó en escritorio y en 390 × 844. Lint, las 557 pruebas de la suite
completa y el build aprobaron dentro de Docker.

La edición de consumo también muestra el aviso «La edición conserva el registro
original. No cambia la alimentación vigente ni el plan del lote.» en una ayuda
junto al título, con la misma colocación abajo a la derecha. Se retira el aviso
del cuerpo del formulario; la cantidad registrada y el motivo siguen visibles.
Verificado en escritorio y móvil, en temas claro y oscuro, incluido el cierre
de la ayuda con Escape sin cerrar el formulario. Lint, 557 pruebas y build
aprobados dentro de Docker; se conservan los avisos SCSS/CommonJS existentes.

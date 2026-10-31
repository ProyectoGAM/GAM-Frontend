# Acceso rápido por galpón y planta

`/administracion/acceso-rapido` es la primera entrada del sidebar y el inicio
del panel tras autenticarse, también desde `/home`. Repartidores sin otros
permisos de módulos mantienen su entrada al modo repartidor. Acceso rápido
no concede acceso a otros módulos ni autoriza operaciones en el servidor.

Sobre la búsqueda se elige **Galpón** o **Planta**, con Galpón seleccionado
al entrar. El selector reproduce el de estados de Planes: superficie neutra,
opción seleccionada con fondo de tarjeta y borde, y estado `aria-pressed`.
Cambiar de tipo limpia la búsqueda y descarta la consulta anterior. Mientras
hay una actividad de galpón abierta se bloquea el cambio para conservarla.

Planta consulta únicamente instalaciones de tipo `feed`, sin requerir lotes,
y respeta la UP seleccionada o “Todas las UP”. Excluye unidades e instalaciones
inactivas. Busca por nombre de planta o UP, ignorando acentos y mayúsculas.
Las tarjetas de plantas usan la misma grilla adaptable que los galpones:
una columna en teléfono, dos desde 700 px y tres desde 1100 px. Cada tarjeta,
sin grilla interna de acciones, tiene un único
botón **Elaborar** que abre una modal con la planta y UP elegidas, sin cambiar
la URL ni salir de Acceso rápido. El flujo compartido conserva dos pasos:
receta/multiplicador con total en kg, y revisión de ingredientes antes de
confirmar. La planta y UP permanecen visibles en el encabezado; sólo el cuerpo
se desplaza y las acciones quedan al pie. Al terminar se muestra el resultado
confirmado; Listo vuelve a las tarjetas y confirma planta, UP y cantidad.
Cancelar no registra y conserva la búsqueda, la UP y la selección Planta.
El foco vuelve al botón de origen o al título si se actualizaron las tarjetas.
Una planta fuera de operación conserva el botón deshabilitado y explica el
motivo, salvo si existe una elaboración pendiente del usuario/sesión para esa
planta: se permite reabrirla para recuperar exactamente la misma operación.
El envío bloquea cierre, Escape, fondo y navegación. Si el resultado es incierto,
se puede cerrar conservando la petición y clave idempotentes; la tarjeta avisa
que hay un pendiente y al reabrir se ofrece Consultar resultado, sin editar ni
crear otra elaboración. Cambiar identidad descarta la modal y sus respuestas.
No se agregan permisos ni se modifica la autorización de las rutas o
del servidor. La elaboración conserva sus validaciones y recuperación actuales.

En la vista Galpón, la selección general de unidad productiva determina los galpones visibles;
“Todas las UP” muestra el nombre de la unidad en cada tarjeta. Se consultan
galpones y lotes con los servicios paginados existentes. No se incluyen plantas
de ración, unidades inactivas ni instalaciones inactivas. La búsqueda local
ignora acentos y mayúsculas y encuentra galpón, lote o UP.

Cada tarjeta de galpón presenta **Postura**, **Mortandad**, **Cambio de ración** y
**Sanidad**. Sin un único lote actual, o con el galpón fuera de operación,
se explica la indisponibilidad y no se ofrecen comandos ambiguos. La cuarentena
no se interpreta como finalización. Postura requiere aves vivas y el permiso
`egg-collections.manage`; Sanidad exige `management-plans.execute`. El resto
conserva la política de los formularios existentes. El backend es autoritativo.

Las cuatro acciones conservan su lugar incluso sin autorización. Todas usan
un fondo neutro; las restringidas muestran el candado superpuesto al icono,
el texto “Sin permiso” y el botón deshabilitado. Los bloqueos temporales por
un formulario abierto o por falta de aves no muestran candado. La presentación
depende de `tasks().allowed`, preparada para conectar los futuros permisos de
Mortandad y Cambio de ración cuando se defina su contrato, sin inventar permisos
ni cambiar las reglas actuales. Las combinaciones de cero a cuatro acciones
autorizadas se verifican con datos simulados en pruebas de componente.

Las acciones de galpón abren directamente los formularios existentes, con lote, galpón
y UP. Antes de registrar se vuelve a consultar el lote y se verifica su
alojamiento y estado. Al guardar se vuelve a la lista, se confirma el galpón
afectado y se actualizan sus datos conservando la búsqueda. Cancelar no escribe.
El foco vuelve al botón de origen o al título si el botón ya no existe.
Cambiar de UP cancela consultas anteriores; cambiar de identidad o sesión
descarta formularios y resultados anteriores. Durante un comando pendiente no
se permite abandonar la ruta. Sanidad conserva el bloqueo ante resultado
incierto, su reintento exacto y su confirmación fuera del plan.

**Postura es producción de huevos**, antes llamada Recolección. Los pesos de
aves se llaman Pesaje. Sólo cambian las etiquetas de esas pantallas; las rutas
`recoleccion` y `pesajes`, endpoints, DTOs y unidades mantienen sus contratos.
El formulario de postura usa el endpoint de colecciones y el mismo cuerpo y
clave idempotente en reintentos de red.

Las tarjetas usan los tokens GAM existentes para ambos temas. En Galpón, las cuatro
acciones mantienen una disposición 2×2 dentro de cada tarjeta, en todos los
tamaños. Los galpones se distribuyen en una columna en teléfono, dos desde
700 px y tres en escritorio desde 1100 px. Los primeros nueve forman una
grilla 3×3; los siguientes continúan en nuevas filas con el desplazamiento
normal de la página, sin paginación ni alturas fijas.
No cambian plugins ni configuración nativa.

## Verificación visual (30/10/2026)

La revisión contra Docker Compose y los datos locales comprobó la redirección
desde `/administracion`, el acceso del sidebar, las cuatro aperturas con el
contexto correcto y el cierre sin guardar registros. Sanidad mostró catálogo y
plan; Cambio de ración mostró sus modos automático y manual. Se comprobaron
la búsqueda, los temas claro/oscuro y teléfonos de 320 y 390 px sin desbordamiento
horizontal, con acciones de al menos 76 px de alto. Las capturas están en
`.tmp/qa/quick-access-*.png`. No se probaron dispositivos físicos ni se
registraron datos durante la revisión de navegador.

La revisión de la nueva grilla comprobó una columna de galpones a 320 px,
dos a 820 px y tres a 1100/1440 px. En todos los casos las acciones mantienen
dos columnas y dos filas, con al menos 76 px de alto por botón y sin
desbordamiento horizontal. Las áreas de acciones se alinean entre tarjetas
de la misma fila aunque sus nombres ocupen más líneas. Las capturas de esta
disposición están en `.tmp/qa/quick-access-grid-*.png`.

El ajuste de permisos conserva el fondo neutro en las acciones autorizadas.
Se revisó en escritorio de 1440 px con tres columnas y en teléfono de 320 px
con tema oscuro, sin desbordamiento y con botones de al menos 90 px de alto.
Las capturas están en `.tmp/qa/quick-access-permissions-*.png`. La cuenta local
es administradora: los candados y las cinco combinaciones de autorización se
comprobaron con pruebas de componente, no con los futuros permisos del servidor.

La revisión del selector Galpón/Planta comprobó el estilo de Planes, Galpón
activo al entrar, las cuatro plantas locales con una única acción por tarjeta,
la búsqueda por UP sin distinguir acentos y la apertura de Elaborar con su
planta y unidad correctas, sin registrar elaboraciones. Se verificaron escritorio
claro de 1440 px y teléfono oscuro de 320 px, sin desbordamiento horizontal,
con controles de selección de 44 px y Elaborar de 48 px. Las capturas están
en `.tmp/qa/quick-access-plants-*.png`.

La grilla de plantas se revisó con tres columnas a 1100/1440 px, dos a 820 px
y una a 320 px en tema oscuro, sin desbordamiento horizontal. Cada tarjeta
conserva una sola acción de 48 px de alto; el área de Elaborar se alinea al pie
de las tarjetas de una misma fila. Capturas en
`.tmp/qa/quick-access-plants-grid-*.png`.

La modal de elaboración se verificó contra Docker Compose: apertura sin cambiar
la URL, planta/UP correctas, receta real, multiplicador ×2 y cálculo de 26 kg
desde una base de 13 kg. Se revisó el resumen de ingredientes sin confirmar ni
registrar stock, y se comprobó conservar Planta y búsqueda al cancelar. Escape
y el fondo devolvieron el foco a la tarjeta. El foco inicial se conserva tras
cargar la planta. En teléfono de 320×700 px, claro y oscuro, el cuerpo desplaza
y el pie permanece visible, sin desbordamiento horizontal. Capturas en
`.tmp/qa/quick-access-manufacture-*.png`. Guardado, bloqueo durante peticiones,
cambio de identidad, cierre y recuperación exacta de pendientes se cubren en
pruebas automatizadas; no se registraron elaboraciones durante la revisión web.

La suite completa aprobó 1.159 pruebas en 146 archivos dentro de Docker con
dos procesos de Vitest (`maxWorkers: 2`, configuración temporal en `.tmp/qa`).
La ejecución con el paralelismo predeterminado había superado el límite de
5 segundos en seis pruebas existentes; se conservaron las aserciones y los
límites de tiempo. Lint y el build de producción también aprobaron. No se modificó la configuración
permanente del ejecutor ni las dependencias.

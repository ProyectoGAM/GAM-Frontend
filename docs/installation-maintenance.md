# Mantenimiento de instalaciones

El detalle de galpones avícolas y plantas de ración incorpora el acceso
**Mantenimientos ›** y un cambio rápido entre operativo y en mantenimiento.
Las secciones existentes de stock, elaboración y lotes conservan su estructura
y sus acciones. El estado se refleja en el detalle sin registrar un trabajo.
Para volver a operar, la unidad productiva debe estar activa. Los estados
inactivo y fuera de servicio conservan la gestión general de estado existente.

El sidebar ofrece **Instalaciones → Mantenimiento**, bajo
`ubicaciones/mantenimiento`. Permite buscar galpones o plantas y limita las
opciones a la UP seleccionada en el panel. Incluye instalaciones inactivas para
consultar sus trabajos históricos. El historial abre bajo ese mismo apartado,
con el menú activo, acceso de regreso al selector y enlace al detalle de la
instalación. No requiere endpoints nuevos: el contrato consulta registros por
instalación, sin un listado global de mantenimientos.

Cada **Ver detalle** consulta el registro individual y muestra su número,
instalación y tipo, UP, fecha de realización, descripción completa, responsable,
costo/moneda y estado. Presenta además fecha y hora de registro y última
actualización; si está anulado, muestra fecha/hora y motivo de anulación. Las
horas se presentan explícitamente en Uruguay, sin exponer control de versiones
ni otros detalles técnicos del API.

La pantalla de mantenimientos es una ruta lazy bajo
`unidades-productivas/:id/galpon/:houseId/mantenimientos`. Verifica la instalación
y su UP antes de consultar el historial, permite filtrar por estado y fechas,
y pagina de a 20 registros. Muestra fecha, descripción, costo en la moneda
histórica y nombre del responsable conservado por la API.

## Contrato y operaciones

Fuente: `GAM-Backend/contracts/openapi/maintenance.yaml` y las acciones/requests
de FarmStructure. Ambos tipos de instalación usan los mismos endpoints:

- `GET/POST poultry-houses/{id}/maintenances`: historial y registro de hechos.
- `GET/PATCH maintenances/{id}`: consulta y corrección con versión y motivo.
- `POST maintenances/{id}/cancellation`: anulación con versión y motivo.
- `PATCH poultry-houses/{id}/status`: cambio independiente del estado operativo.

No hay programación futura, estados de trabajo en curso ni eliminación física.
Los registros son realizados (`completed`) o anulados (`cancelled`). Corregir
o anular requiere consultar la versión actual; un conflicto refresca el detalle
antes de volver a editar. Se presentan los errores de validación por campo.

El alta exige fecha no futura (día de Uruguay), descripción, responsable y costo.
El costo **puede ser cero**, también permitido expresamente por el backend:
`CreateMaintenanceAction` rechaza únicamente importes negativos. El formulario
acepta coma o punto decimal, hasta dos decimales UYU y 15 dígitos enteros;
normaliza a una cadena exacta sin redondeo ni separadores de miles.

El usuario actual se selecciona por defecto y aparece como **Nombre (eres tú)**
en el selector. Se reutiliza `UsersService.allUsers()` con toda su paginación,
excluyendo usuarios inactivos (`deleted_at`). El nombre de un responsable
histórico inactivo se conserva y no se ofrece como nueva selección.

**Limitación del contrato:** el directorio `GET users` requiere
`identity.users.manage`, mientras registrar trabajos requiere
`poultry-houses.manage` (el rol admin satisface las políticas). No existe un
catálogo de responsables específico de mantenimiento. Sin acceso al directorio,
la UI informa la limitación y ofrece al usuario actual; no modifica backend ni
amplía permisos. Una falla de consulta permite reintentar o continuar con el
usuario actual.

El alta conserva su `Idempotency-Key` al reintentar el mismo contenido después
de perder la conexión/respuesta. Cambiar el contenido inicia otro intento. El
diálogo bloquea doble envío, cierre y salida de la ruta mientras guarda; descarta
respuestas pendientes al cambiar identidad, sesión o instalación. Cerrar pierde
el intento en memoria: ante una respuesta incierta, se indica reintentar con los
mismos datos dentro del formulario.

## Presentación y validación

La UI utiliza los tokens GAM para claro y oscuro. El diálogo contiene el foco,
permite Escape cuando no está guardando, devuelve el foco al origen y limita su
altura por el viewport y las áreas seguras. El shell conserva el scroll normal
de página con `ion-content`. No se agregan dependencias, plugins ni configuración
nativa; la comprobación del teclado y sistema en dispositivos físicos queda
como validación de Android/iOS.

Las pruebas cubren contrato HTTP, costo cero, fechas, selección del usuario,
directorio, permisos, idempotencia, conflictos, anulación, foco, cambios de
identidad, filtros/paginación y preservación de las secciones de stock y lotes.

Validación local del 1 de noviembre de 2026: lint, las 1303 pruebas de la suite
completa y la compilación de producción aprobaron dentro de Docker. La auditoría
inicial de dependencias de producción informó cero vulnerabilidades.
El navegador contra la API local verificó el acceso de ambos tipos de instalación,
alta con costo cero, corrección con motivo y anulación del registro de prueba,
y cambio operativo → mantenimiento desde el detalle de planta con regreso a
operativo desde su historial. El registro de prueba quedó anulado, identificado
como prueba, y la planta conservó su estado operativo original.
Se revisaron escritorio y teléfonos de 360/320 px, claro/oscuro, sin excepciones
de consola. Las capturas están en `.tmp/qa/installation-maintenance-*.jpg`.

La incorporación del sidebar y los campos completos del detalle aprobó lint,
las 1310 pruebas de la suite completa (162 archivos) y build de producción en
Docker. Las 209 pruebas específicas de instalaciones y navegación también
aprobaron. El navegador verificó el filtrado del selector por UP, la entrada
activa en el menú durante la consulta, y los detalles individuales de los dos
trabajos realizados y el registro anulado de prueba del Galpón Norte. Las
capturas del selector y el registro están en `.tmp/qa/maintenance-sidebar-*.jpg`.

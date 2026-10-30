# Sanidad del lote

Desde el detalle del lote, **Sanidad** abre `/administracion/lotes/lotes/:id/sanidad`.
El historial compacto muestra vacunas, medicamentos, correcciones compensatorias
y antecedentes del lote original, con fecha en America/Montevideo, responsable y
nombres históricos. Los detalles conservan motivo, notas y origen; no hay edición
ni eliminación de aplicaciones. Un lote finalizado permite consultar, pero no registrar.

**Registrar aplicación** abre una modal con vacuna/medicamento, fecha/hora,
actividad del plan vigente, motivo, notas y partida opcional para vacunas.
No solicita ni envía cantidad, unidad, inventario o consumo físico de sanidad.
El responsable es el usuario actual, resuelto por el servidor.

La vinculación es explícita y comprueba revisión vigente, tipo, producto del
snapshot (cuando existe) y calendario respecto de `baseline_date`. Reutiliza
las reglas de día, semana, rango y recurrencia del plan. Una actividad sin fecha
prevista no cuenta como coincidencia. La aplicación usa el día de Uruguay,
independientemente de la zona del dispositivo.

Si falta actividad o no coincide la fecha/producto, el formulario informa **Fuera
del plan** y exige motivo no vacío. Antes de enviar aparece **¿Registrar fuera
del plan?**; Volver conserva los campos. Al confirmar se omite `plan_activity_id`
para que el backend registre correctamente el hecho fuera de plan. Dentro del
plan el motivo es opcional y no hay una segunda confirmación.

## API y permisos

Contrato: `GAM-Backend/contracts/openapi/management-plans.yaml`, actualizado para
aplicaciones sin cantidad y motivo condicional. `FlockHealthService` utiliza
`ApiClient` con `GET flocks/{id}/manejos` y POST `vacunaciones`/`medicaciones`.
Carga todas las páginas de los streams vaccination, medication y
management_correction, descarta correcciones de otros tipos y combina por fecha.
La vista revela bloques de 20 filas. Un fallo en cualquier stream muestra error,
sin presentar un historial parcial como completo.

Los catálogos y el plan reutilizan `ManagementPlansService`. Un 404 del plan
representa ausencia de plan; errores de permisos/red no se interpretan como
ausencia ni habilitan el registro. La partida se envía al aplicar la vacuna,
pero el historial del backend actualmente no incluye `vaccine_batch`; sólo se
muestra si el servidor la proporciona, sin inferirla de notas ni del catálogo.

El historial exige `management-plans.view` y registrar exige
`management-plans.execute`, o administrador activo. Las políticas actuales de
catálogos también exigen administrador o `management-plans.manage`; el frontend
informa el 403 y no evita esa restricción. Se conserva la autorización del shell.
Los accesos desde galpón y acceso rápido quedan para la siguiente etapa.

## Reintentos y contexto

Cada comando envía UUID en `Idempotency-Key`; se bloquean dobles envíos.
Red, 5xx o respuesta ilegible congelan el formulario y permiten repetir exactamente
el cuerpo y la clave. No se puede abandonar la ruta con una aplicación pendiente
de confirmación. Un 422 muestra los mensajes de campo y permite corregir. Un 409
requiere recargar catálogo, lote y plan antes de crear un nuevo intento.
Cambiar identidad, sesión o lote descarta datos y respuestas pendientes de otro
contexto. Las modales usan diálogo nativo, foco contenido, Escape y cierre
bloqueado durante guardado/resultado incierto; respetan áreas seguras y permiten
desplazar el cuerpo con el teclado abierto. No hay plugins ni cambios nativos.

## Validación (30/10/2026)

Lint, build de producción y la suite completa de 1.103 pruebas en 141 archivos
aprobados dentro de Docker; auditoría de dependencias de producción sin
vulnerabilidades. Las pruebas cubren calendario/producto/revisión, motivo
condicional, confirmación, ausencia de cantidad, paginación y snapshots,
reintentos idempotentes, permisos, lote finalizado y cambios de identidad.
La verificación visual de la aplicación quedó pendiente porque el navegador
local no tenía una sesión iniciada. No se registraron aplicaciones reales
durante la verificación ni se probaron dispositivos físicos.

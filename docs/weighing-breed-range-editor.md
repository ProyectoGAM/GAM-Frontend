# Edición de rangos de pesaje por raza

Implementado el 9 de octubre de 2026. El botón «Editar» del resumen abre los rangos actuales de la raza asociada al pesaje y muestra su nombre. El formulario ya no guarda la configuración global.

La pestaña «Pesaje» también ofrece «Editar rango» junto al formulario de registro, incluso antes del primer ingreso. Abre el mismo editor para la raza del pesaje de hoy o, si aún no existe, la raza actual del lote. No toma la raza de la fecha seleccionada en el resumen. Cerrar el editor conserva los valores ingresados para registrar el pesaje.

## Contrato

- `expected_range` del pesaje diario expone `source`, `breed_id` y `breed_version`. Se prioriza su `breed_id` sobre la raza actual del lote. Para referencias antiguas sin raza capturada se usa la raza actual del lote.
- `GET /breeds`, permiso `breeds.view`, devuelve nombre, versión, `range_overrides` y `expected_ranges`. Se consulta el catálogo paginado hasta encontrar el identificador, incluyendo razas inactivas; no existe un endpoint de consulta individual en este contrato.
- `PATCH /breeds/{id}`, permiso `breeds.manage`, recibe la versión actual del catálogo y las parejas de límites en gramos. Se envía `Idempotency-Key`; el mismo intento tras un fallo de conexión conserva su clave.
- La semana de transición a adultas sigue siendo global. Se muestra como información y no se modifica desde este formulario.

## Comportamiento

Los cuatro campos están siempre visibles y editables, sin checkbox. Cada etapa carga primero los límites propios de la raza. Sólo si no tiene rango (ambos límites `null` en el contrato; también se admite una pareja `0` al leer) se usan sus valores globales efectivos. Si tampoco existe configuración global, los campos quedan vacíos y deben completarse. Guardar envía los cuatro valores como límites propios de la raza; se exige `0 < mínimo < máximo`, con hasta un decimal y trece dígitos enteros.

Los cambios afectan los pesajes diarios abiertos de los lotes de esa raza. Los cerrados conservan su referencia histórica; el formulario consulta los valores actuales para editar y usa su versión actual, no la versión histórica del pesaje.

No se puede guardar mientras la raza se carga, si la consulta falla o si se detecta una versión desactualizada. Los errores de permisos y conexión se presentan en el formulario. Cerrar descarta respuestas de carga pendientes.

## Verificación

Pruebas de lectura paginada, razas inactivas, prioridad del rango por raza, valores globales sólo para etapas sin rango, ausencia de configuración global, validación de límites, payload y endpoint por raza, permisos, respuestas tardías, conflicto de versión y reintento idempotente. Se comprueba el diseño en el navegador integrado en móvil y escritorio, en claro y oscuro. El guardado se prueba con respuestas simuladas para conservar los rangos de desarrollo durante la revisión visual.

Validación del 9 de octubre de 2026: `npm run lint`, `npm run test:ci` (380 pruebas, 65 archivos) y `npm run build` completados en Docker. La compilación mantiene advertencias de presupuesto SCSS y dependencias CommonJS. Revisión visual a 390 × 844 y 1280 × 900, con las razas «Ponedoras demo» y «Camperas demo» obtenidas de la API; se verificó el acceso desde «Pesaje» en un lote sin ingresos.

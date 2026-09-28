# Referencias activas en Registrar movimiento

## Objetivo

Evitar que el formulario operativo de movimientos permita elegir proveedores o ubicaciones de stock inactivas, solicitando ambos recursos con `status=active` a sus endpoints paginados existentes.

## Problema y motivo

`MovementFormPage.loadReferences()` carga proveedores y ubicaciones desde `/reference/options` sin filtro de estado. La lista compacta no incluye estado, por lo que aparecen recursos inactivos en los selects y el backend rechaza el submit.

## Alcance autorizado

- GAM-Frontend: únicamente carga de referencias en `movement-form`, sus pruebas y pruebas de serialización de servicios existentes si faltan.
- Reutilizar `SuppliersApi.list()` y `StockLocationsApi.list()`; no cambiar pantallas administrativas, historiales ni la API backend.
- Cubrir proveedores/ubicaciones activas en las cinco operaciones; Transferencia comparte ubicaciones activas en origen y destino.
- Preservar manejo actual de errores de submit.
- Sin commit ni push.

## Restricciones

- No inspeccionar ni modificar backend; la auditoría local solo confirma contratos de cliente y serialización.
- No filtrar recursos en memoria ni inferir estado desde nombres/texto.
- Preservar todos los cambios locales previos.
- TDD: desactivado según `odd/tasks/products-ownership-capabilities.md`. Runner: `npm run test:ci`.

## Ruta ODD

- Ruta elegida: implementación delegada directa.
- Evidencia: el mapeo necesitó revisar cuatro o más archivos y el cambio abarca carga de referencias más specs de página/servicios.
- Proyección: aproximadamente 200 líneas de cambios. Estrategia de entrega: `ask-on-risk`; sin commits ni PR por instrucción del usuario.

## Tareas

- [x] M1. Auditar la carga actual y cambiar `movement-form` a los servicios existentes con `status=active`, cubriendo todas las operaciones y las páginas necesarias.
- [x] M2. Probar queries, listas mostradas, transferencia y conservación de errores backend.
- [x] M3. Ejecutar validación completa y revisar el diff para preservar el alcance.

## Criterios de aceptación

- Proveedores se solicitan desde `/api/v1/suppliers` con `status=active`.
- Ubicaciones se solicitan desde `/api/v1/stock-locations` con `status=active`.
- Los selects de la pantalla usan esas listas filtradas para Ingreso, Salida, Transferencia, Pérdida y Ajuste; origen y destino de transferencia usan la misma lista activa.
- Errores backend de submit continúan visibles y no se alteran los contratos de mutación.
- `npm run test:ci`, `npm run lint`, `npm run build` y `git diff --check` pasan.

## Progreso y evidencia

- Auditoría completada: `movement-form` obtiene ambas listas de `GET /api/v1/reference/options` sin query; `SuppliersApi` serializa filtros de proveedor y `StockLocationsApi.list()` reenvía `StockLocationFilters.status`.
- El spec existente de SuppliersApi prueba `status=active`; no existía prueba HTTP equivalente para StockLocationsApi.
- M1/M2 implementados en `movement-form.page.ts`: proveedores salen de `SuppliersApi.list({ status: 'active', per_page: 100 }, page)`; ubicaciones de `StockLocationsApi.list({ status: 'active', per_page: 100, page })`. Se recorren todas las páginas y se mapean directamente los datos para las opciones; el resto de callers de `/reference/options` no cambia.
- Queries enviadas por la pantalla: `GET /api/v1/suppliers?status=active&per_page=100&page=1` y `GET /api/v1/stock-locations?status=active&per_page=100&page=1` (páginas posteriores conservan el mismo filtro y cambian `page`).
- Pruebas enfocadas: 3 archivos, 28 tests; cubren llamadas activas/paginación, selects sin opciones inactivas, las cinco operaciones, ambos selects de Transferencia y error 409 de submit visible. `inventory.api.spec.ts` comprueba la query HTTP exacta de ubicaciones; `suppliers.api.spec.ts` ya comprueba la serialización de `status=active` en proveedores.
- `npm run test:ci`: pass, 49 archivos y 249 tests.
- `npm run lint`: pass.
- `npm run build`: pass; Angular emitió advertencias no bloqueantes de presupuesto SCSS en varias pantallas. No se cambiaron estilos en esta tarea.
- `git diff --check`: pass; Git solo reportó advertencias de conversión LF/CRLF del working tree preexistente.
- Límite de evidencia: la aceptación semántica en backend no puede confirmarse sin inspeccionar backend, prohibido por el alcance. Se validaron las queries exactas del cliente.
- Espejo Engram: pendiente; no hay herramientas de memoria disponibles en esta sesión.
- Siguiente paso: ninguno; alcance completado sin commit ni push.

# Modal para cambiar el mínimo de stock

## Objetivo

Reemplazar el formulario inline “Cambiar mínimo” de Existencias por un modal accesible y responsive, conservando el PATCH, la validación, los errores y el feedback existentes.

## Problema y motivo

En tablet el formulario inline ocupa demasiado espacio en la columna Acción y recorta contenido. El modal debe mostrar producto, ubicación, disponible y mínimo actuales, permitir editar “Nuevo mínimo”, cancelar sin request y guardar con actualización visible de la fila.

## Alcance autorizado

- GAM-Frontend: `src/app/features/inventory/pages/stock/stock.page.{ts,html,scss,spec.ts}`.
- Eliminar por completo el formulario inline de la tabla.
- Reutilizar el método existente `InventoryApi.setMinimumStock` y su contrato PATCH.
- Preservar los cambios locales preexistentes, incluyendo el enlace “Nuevo producto” y sus pruebas.
- No modificar Backend, Proveedores/Catálogos ni otras partes de Inventory.
- Sin commit ni push, según instrucción explícita del usuario.

## Restricciones

- Mínimo >= 0, hasta 6 decimales, misma normalización y errores backend.
- Modal controlable por teclado: foco inicial y restaurado, Escape/cerrar y sin doble envío.
- Error visible en el modal; éxito cierra, actualiza listado y conserva el feedback actual.
- Sin `window.confirm` ni `window.prompt`; sin dependencias nuevas.
- Mantener ancho completo a 390 px y 768 px; ancho limitado en desktop.
- No tocar el API ni su payload `{ minimum_quantity }`.

## Ruta ODD y configuración

- Ruta elegida: implementación directa delegada.
- Evidencia: la exploración involucró 4+ archivos (página, plantilla, estilos, API, pruebas y diálogo); la implementación modifica varios archivos no triviales.
- Proyección inicial: aproximadamente 150 líneas de cambios propios, excluidos cambios locales anteriores.
- TDD: desactivado según la instrucción explícita registrada en `odd/tasks/products-ownership-capabilities.md`; runner: `npm run test:ci` (Vitest 4 vía Angular CLI).
- Estrategia de entrega: `ask-on-risk`; los commits y PR no aplican a esta tarea porque el usuario prohibió commits y push.
- Copia Engram: pendiente; las herramientas de memoria no están disponibles en esta sesión.

## Tareas

- [x] S1. Sustituir edición inline por modal accesible/responsive; cubrir abrir, precarga, cancelar, guardado único y payload, error visible, cierre y actualización de fila.

## Criterios de aceptación

- “Cambiar mínimo” abre un modal con Producto, Ubicación, Disponible actual y Mínimo actual.
- El campo “Nuevo mínimo” conserva las validaciones y el contrato PATCH actual.
- Cancelar, cerrar o Escape no envía el PATCH; Escape/cerrar restaura el foco al disparador.
- No se puede enviar dos veces mientras hay una petición activa.
- El error del backend queda visible en el modal; el éxito cierra, actualiza la fila y muestra el feedback existente.
- El formulario inline ya no aparece en la tabla.
- Tests solicitados y `npm run test:ci`, `npm run lint`, `npm run build`, `git diff --check` pasan.

## Progreso y evidencia

- Exploración completada: el PATCH existente en `services/inventory.api.ts` manda `{ minimum_quantity }`; la página ya implementa validación, normalización, mapeo de errores y actualización de `balances`.
- Patrón nativo `<dialog>` encontrado en `components/confirmation-dialog/`; su CSS demuestra el ancho acotado, scroll vertical, foco, Escape y bloqueo en estado busy.
- Hay cambios locales preexistentes en la plantilla y pruebas de la pantalla, además de otros archivos Inventory. Se deben preservar.
- `npm run test:ci`: pasó; 49 archivos y 242 pruebas.
- `npm run lint`: pasó.
- `npm run build`: pasó. El primer intento excedió el presupuesto SCSS de Existencias (4,30 kB frente a 4 kB); se simplificaron reglas redundantes y el build final quedó en 3,97 kB. El build conserva avisos de presupuesto no bloqueantes en varios estilos existentes.
- `git diff --check`: pasó (código 0); Git informó avisos de conversión LF/CRLF para archivos locales.
- Responsive: ancho CSS `min(560px, calc(100% - 28px))`, equivale a 362 px a 390 px y 560 px a 768 px; altura máxima con scroll vertical, campo al 100 % y contexto con wrapping. No hubo verificación visual en navegador.
- Copia Engram: sigue pendiente; no hay herramientas de memoria disponibles en esta sesión.
- Próximo paso: ninguno dentro del alcance solicitado; no se hizo commit ni push.

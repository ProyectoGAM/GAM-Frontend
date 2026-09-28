# Productos: ownership y capacidades

## Objetivo

Completar la gestión de Productos desde el catálogo usando exclusivamente `system_managed`, `specialized_owner` y `capabilities` del `ProductResource`: edición permitida por campo, activación/desactivación autorizada y navegación a los módulos propietarios.

## Problema y motivo

La interfaz actual lista y crea productos, pero no consume metadata de ownership/capacidades ni ofrece edición o cambio de estado. Debe reflejar las decisiones del backend sin inferir restricciones desde tipo, SKU, nombre o historial.

## Alcance autorizado

- Solo código funcional de `src/app/features/suppliers-catalogs/products/`.
- Reutilizar, sin modificarlos, la ruta existente de edición de Vacunas, la ruta estable de Stock de huevos, el diálogo de confirmación compartido y patrones existentes de manejo de errores.
- Ampliar pruebas de Productos para metadata, acciones, edición y estado.
- Sin cambios a Backend, Inventory, Suppliers, Medicines o Vaccines; sin commit ni push.

## Restricciones

- No inferir ownership ni permisos del tipo, SKU, nombre, estado de stock o historial.
- Mostrar acciones normales solo según `capabilities`; enviar PATCH únicamente con campos permitidos que hayan cambiado.
- Vaccine owner navega por el ID entregado por backend al módulo de Vacunas; `egg_stock` solo muestra/enlaza Stock de huevos. No añadir DELETE.
- `kind=vaccine` sin `specialized_owner` conserva las capacidades normales entregadas por backend.
- Preservar todos los cambios locales preexistentes.
- TDD: desactivado por instrucción explícita del usuario. Runner: `npm run test:ci`.

## Ruta ODD

- Ruta elegida: implementación delegada directa.
- Evidencia del disparador: la comprensión involucró cuatro o más archivos (modelos, API, rutas, lista, rutas de Vacunas/Inventory y diálogo); el cambio funcional abarca varios archivos no triviales.
- No se crea una rama ni commits porque el usuario prohibió commit/push. Entrega local sujeta a validación.
- Proyección aproximada: más de 400 líneas de cambios incluyendo pruebas. Estrategia de entrega predeterminada `ask-on-risk`; el umbral de slices/PR no aplica mientras no haya autorización para commits o PR.

## Tareas

- [x] P1. Extender el contrato Product y agregar edición condicional y estado en el listado, con navegación por ownership real y pruebas.
- [x] P2. Agregar la ruta y formulario de edición que carga el detalle, habilita solo campos declarados, no envía PATCH vacío y muestra errores humanos, con pruebas.
- [x] P3. Ejecutar validación completa y revisar el diff para confirmar que solo se afectó el alcance.

## Criterios de aceptación

- El listado consume metadata real y representa correctamente producto normal, vacuna vinculada, `generic_egg` (`egg_stock`) y `kind=vaccine` sin ficha especializada.
- Solo se muestran acciones habilitadas por capacidades del backend y la mutación de estado usa el diálogo existente y el payload contractual.
- La edición funciona al entrar directamente o recargar la URL, carga desde GET, limita campos por `editable_fields`, manda solo cambios permitidos y no manda PATCH vacío.
- Errores 422 se asignan al campo; conflictos y fallas generales se comunican sin detalles técnicos.
- Tests solicitados pasan; lint, build y `git diff --check` pasan.

## Progreso y evidencia
- P1/P2 implementados y revisados en `src/app/features/suppliers-catalogs/products/`; se preservaron los cambios locales previos fuera de Products.
- Las acciones de estado usan exclusivamente capabilities para visibilidad y destino; status solo se usa en su etiqueta visible. Se agrego una prueba con metadata inconsistente.
- `npm run test:ci`: pass, 49 archivos y 239 tests. Una repeticion intermedia tuvo una salida inesperada de un worker Vitest (48/49); la siguiente ejecucion completa paso. El primer pase detecto una ruta incorrecta y un fixture incoherente, corregidos antes del pase final.
- `npm run lint`: pass.
- `npm run build`: pass. Angular informo avisos no bloqueantes del presupuesto SCSS, incluidos componentes Products y otros componentes existentes.
- `git diff --check`: pass (avisos de conversion LF/CRLF en archivos locales previos). El escaneo adicional no encontro espacios finales en Products ni en este documento.
- Prueba manual API/browser: no ejecutada; no habia servicios locales en puertos 4200, 8080 o 8081 y no hay herramienta de navegador disponible.

- Exploración: completada. GAM-Frontend ya tenía cambios locales extensos en Inventory y Suppliers/Catalogs sin seguimiento; deben preservarse.
- Contratos y rutas existentes: mapeados en Productos, Vacunas y Stock de huevos. Diálogo reutilizable encontrado.
- Copia Engram: pendiente; no hay herramientas de memoria disponibles en esta sesion.
- Proximo paso: el QA manual integrado queda para el usuario, segun lo indicado; no comenzar Pesajes.

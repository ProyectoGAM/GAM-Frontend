# Layout responsive de Ajuste por conteo

## Objetivo

Ordenar el bloque visual de Ajuste por conteo en Registrar movimiento para que campos y resumen de saldo/diferencia sean legibles en tablet, desktop y móvil, y conservar el soporte explícito de la cantidad `0` en frontend.

## Problema y motivo

Producto, ubicación, cantidad y el resumen son hijos del mismo grid `.line`. A tablet, el resumen ocupa una columna junto con los campos y los textos se quiebran verticalmente. La ayuda antes de una cantidad válida también es demasiado extensa.

## Alcance autorizado

- GAM-Frontend: solamente el bloque Adjustment de `movement-form.page.html`, estilos de `movement-form.page.scss`, validación/cálculo de Adjustment en `movement-form.page.ts` y pruebas de `movement-form.page.spec.ts`.
- Mostrar Producto, Ubicación y Cantidad contada en una primera fila flexible; colocar debajo una zona titulada `Resumen del ajuste`.
- Cubrir saldo actual, diferencias positiva/negativa/cero, estado sin cantidad válida y múltiples líneas.
- No alterar payload, idempotencia, servicios, operaciones distintas de Adjustment ni backend.
- Sin commit ni push.

## Restricciones

- Inspección de backend prohibida; solo afirmar lo observado en el contrato frontend.
- No interpretar `0` como vacío. La cadena explícita `'0'` debe seguir superando validación frontend de cantidad contada.
- Preservar todos los cambios locales previos.
- TDD: desactivado según `odd/tasks/products-ownership-capabilities.md`. Runner: `npm run test:ci`.

## Ruta ODD

- Ruta elegida: implementación delegada directa.
- Evidencia: el bloque requiere coordinar template, SCSS, validación de Adjustment y specs (cuatro archivos no triviales).
- Proyección: aproximadamente 150 líneas. Estrategia: `ask-on-risk`; commits y PR no aplican por instrucción explícita del usuario.

## Tareas

- [x] A1. Reorganizar campos y resumen de Adjustment con layout responsive y ayudas breves por estado.
- [x] A2. Hacer explícita la validación de campo vacío y probar `0`, signos de diferencia, render, estado inicial y múltiples líneas.
- [x] A3. Ejecutar validaciones completas y confirmar que el diff funcional queda en Adjustment.

## Criterios de aceptación

- Tablet/desktop muestran tres campos en una fila cuando caben y un resumen horizontal compacto debajo.
- A 390 px, campos y resumen se apilan sin overflow horizontal.
- El resumen rotulado muestra stock registrado y diferencia con unidad; diferencias positivas llevan `+`, negativas `-` y cero `0`.
- Cantidad contada vacía queda inválida y una cadena explícita `'0'` sigue siendo válida en frontend para unidades admitidas.
- Las líneas agregadas conservan el mismo layout y cálculo independientes.
- `npm run test:ci`, `npm run lint`, `npm run build` y `git diff --check` pasan.

## Progreso y evidencia

- Auditoría de solo lectura completada: `.line` usa `repeat(auto-fit, minmax(170px, 1fr))`; el resumen era otro hijo directo del grid. El media query general apila el grid bajo 680 px y no resuelve 768 px.
- El validador frontend ya acepta `'0'` para conteos enteros y decimales. Las comprobaciones usan truthiness de strings y dejan pasar `'0'`, pero se cambiará a comparación explícita con vacío para hacer inequívoco el contrato del formulario.
- A1/A2 implementados únicamente en el bloque Adjustment: los tres campos son hijos de celdas del grid existente; el resumen span ocupa la fila completa. A 390 px el grid de la app y `.field-grid` apilan sus elementos; desde 681 px el grid muestra los tres campos, y el resumen usa dos columnas cuando el ancho alcanza.
- Las comparaciones de Adjustment ahora distinguen explícitamente `''` de `'0'`; el formato muestra prefijo `+` para positivos, `-` para negativos y `0` sin signo. El payload y la idempotencia no cambiaron.
- Tests enfocados de `movement-form.page.spec.ts`: 14/14. Cubren render de saldo, diferencia positiva/negativa/cero, ayuda previa a la cantidad, submit con `counted_quantity: '0'` y diferencias independientes en varias líneas.
- `npm run test:ci`: pass, 49 archivos y 252 tests.
- `npm run lint`: pass.
- `npm run build`: pass; Angular mantiene advertencias no bloqueantes de presupuesto SCSS. El stylesheet de `movement-form` queda bajo el umbral de error, con advertencia a 3.99 kB.
- `git diff --check`: pass (código 0); Git reportó advertencias LF/CRLF del working tree local preexistente.
- La auditoría no establece aceptación backend; no se inspeccionará backend por instrucción del usuario.
- Espejo Engram: pendiente; no hay herramientas de memoria disponibles en esta sesión.
- Siguiente paso: ninguno; alcance completado sin commit ni push.

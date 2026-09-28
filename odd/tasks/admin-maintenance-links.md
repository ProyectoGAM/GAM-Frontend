# Accesos de mantenimiento en navegación administrativa

## Objetivo

Mover los enlaces de mantenimiento fuera de Existencias: Ubicaciones de stock bajo Inventario y Nuevo producto bajo Proveedores, usando rutas y pantallas existentes.

## Problema y motivo

Existencias expone accesos de mantenimiento que corresponden a secciones administrativas. El menú debe ofrecerlos bajo sus grupos propietarios y la pantalla de Existencias debe enfocarse en consultar stock.

## Alcance autorizado

- GAM-Frontend: navegación del admin, renderer de la sidebar y generación de sus rutas; plantilla/pruebas de Existencias; pruebas existentes de rutas si hace falta.
- Preservar “Productos” bajo Proveedores y agregar “Nuevo producto” a su ruta hija actual.
- Agregar “Ubicaciones de stock” bajo Inventario apuntando a la ruta hija actual.
- Quitar ambos CTAs de Existencias y ajustar sus tests.
- No cambiar lógica funcional de Products ni StockLocations. No duplicar pantallas/rutas ni cambiar guards.
- Preservar `returnTo` y la lógica de creación, salvo código muerto directamente causado por retirar el CTA; no se anticipa código muerto.
- Sin commit ni push, según instrucción explícita del usuario.

## Restricciones

- Mantener rutas `/administracion/proveedores/productos/nuevo` y `/administracion/inventario/existencias/ubicaciones` existentes.
- La sidebar debe tratar los slugs anidados como segmentos de URL, no como un único segmento codificado.
- Mantener guards y permisos reales de cada grupo.
- No tocar Backend, Proveedores/Catálogos funcionales ni otras partes de Inventory.
- No borrar ni revertir otros cambios locales sin commit.

## Ruta ODD y configuración

- Ruta elegida: implementación directa delegada.
- Evidencia: el mapeo involucró 4+ archivos (navegación, sidebar, rutas y pruebas de admin, Inventory y Products); la implementación abarca varios archivos no triviales.
- Proyección inicial: aproximadamente 70 líneas propias, excluidos cambios locales preexistentes.
- TDD: desactivado según la instrucción explícita registrada en `odd/tasks/products-ownership-capabilities.md`; runner: `npm run test:ci` (Vitest vía Angular CLI).
- Estrategia de entrega: `ask-on-risk`; commits y PR no aplican porque el usuario prohibió commit y push.
- Copia Engram: pendiente; las herramientas de memoria no están disponibles en esta sesión.

## Tareas

- [x] N1. Mover accesos al menú, retirar CTAs de Existencias y comprobar enlaces/rutas existentes sin alterar lógica funcional ni guards.

## Criterios de aceptación

- “Ubicaciones de stock” aparece bajo Inventario y usa la ruta existente.
- “Nuevo producto” aparece bajo Proveedores junto a “Productos” y usa la ruta de alta existente.
- Ninguno de esos botones aparece en Existencias.
- Rutas y guards actuales siguen intactos, sin duplicar rutas ni pantallas.
- `npm run test:ci`, `npm run lint`, `npm run build`, `git diff --check` pasan.

## Progreso y evidencia

- Exploración completada: la sidebar resuelve grupos/items vía `ADMIN_NAVIGATION`; `admin.routes.ts` genera rutas del grupo desde los slugs. El `routerLink` original pasa el slug como un comando único, por lo que un `/` anidado puede terminar codificado en vez de resolver segmentos de ruta.
- Productos ya declara el segmento hijo `nuevo` en `products.routes.ts`; StockLocations ya existe en `inventory.routes.ts` bajo `existencias/ubicaciones`.
- Los grupos Proveedores e Inventario conservan sus guards `authGuard`/`adminGroupGuard`; las rutas hijas existentes se mantienen.
- El worktree contiene cambios locales preexistentes en navegación, rutas, Existencias y otros módulos. Preservarlos.
- La navegación muestra las dos entradas bajo sus grupos y la sidebar divide el slug anidado en comandos de ruta. Tests verifican href exactos y la ruta hija existente; el generador no añade un route duplicado para `productos/nuevo`.
- Existencias ya no incluye los links Nuevo producto ni Gestionar/Ver ubicaciones; el test comprueba ambos permisos.
- `npm run test:ci`: pasó; 49 archivos y 245 pruebas. Un primer intento detectó tipos ambiguos en una prueba parametrizada; se corrigieron los casos y el intento final pasó.
- `npm run lint`: pasó.
- `npm run build`: pasó con advertencias no bloqueantes de presupuesto SCSS en estilos.
- `git diff --check`: pasó (código 0); Git informó avisos de conversión LF/CRLF.
- Copia Engram: sigue pendiente; no hay herramientas de memoria disponibles en esta sesión.
- Próximo paso: ninguno dentro del alcance solicitado; no se hizo commit ni push.

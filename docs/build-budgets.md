# Advertencias de compilación y presupuestos

## Diagnóstico (22/10/2026)

La compilación de producción previa entregaba 46 advertencias de CSS y dos de CommonJS. Los tamaños se midieron con `npm run build -- --stats-json` dentro de Docker, usando `www/browser-stats.json`.

- CSS global: 121.566 bytes, incluidos Ionic, Mapbox, Leaflet y tokens del producto.
- CSS de componentes: 209.742 bytes en 68 salidas del analizador. Son tamaños minificados anteriores al reemplazo de Home, no el coste inicial de descarga: los componentes de features se cargan con sus rutas lazy.
- Los dos componentes mayores eran Repartidor (11.804 bytes) y Pesajes (10.761 bytes).
- El aviso uniforme de 2 KB venía del presupuesto genérico de Angular. No prueba duplicación, fallo visual ni un error de compilación. La mayoría de las pantallas funcionales actuales lo supera.

## Decisiones

### Mapas ESM

Mapbox GL 3.24.0 ya publica `mapbox-gl/esm`, con los mismos tipos y API. Se usa ese entry point en los dos consumidores y se actualizan sus mocks. Leaflet 1.9.4 incluye `dist/leaflet-src.esm.js`, aunque su entrada principal es CommonJS; se importa el fichero ESM y una declaración reutiliza los tipos de `@types/leaflet`.

No se agregan excepciones en `allowedCommonJsDependencies`, no se suben versiones y no se reemplazan las librerías. Los imports exclusivamente de tipos desde `mapbox-gl` no incorporan CommonJS al runtime.

### CSS

Se retira el aviso genérico de 2 KB; **se mantiene el límite obligatorio existente de 12 KB por componente**. Superarlo sigue fallando la compilación. El CSS global obtiene un presupuesto independiente: aviso a 125 KB y error a 140 KB. El presupuesto inicial de JavaScript/CSS conserva aviso a 2 MB y error a 5 MB.

Este ajuste de política no reduce el tamaño del CSS y no debe presentarse como una optimización de estilos. Evita mantener 46 avisos rutinarios y conserva límites de compilación, sin trasladar CSS de features al bundle global ni dividir hojas de estilo para eludir un presupuesto. Si Repartidor o Pesajes necesitan crecer, deben separar componentes por responsabilidad antes de superar 12 KB.

## Comprobación

Ejecutar lint, suite completa y build dentro de Docker. El build debe terminar sin advertencias CommonJS ni de presupuestos. Revisar la redirección `/home` y las pantallas con mapas en el navegador integrado; las pruebas con mocks no verifican WebGL ni la descarga real de mapas. La reducción de CSS de las pantallas grandes queda como trabajo de optimización independiente, sin cambios visuales en esta tarea.

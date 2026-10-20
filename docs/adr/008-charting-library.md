# ADR 008 - Biblioteca de gráficas

## Estado

Aceptado el 7 de octubre de 2026. Vigente para nuevas gráficas de GAM (web, Android e iOS).

## Contexto

GAM usa Angular 22 standalone y zoneless, Ionic 9 y Capacitor 8. Ya existe una gráfica SVG propia para pesajes, pero vienen más visualizaciones de evolución, producción y manejo. Mantener ejes, leyendas, interacción táctil, escalas y accesibilidad en cada componente propio multiplicaría trabajo y errores. La biblioteca debe poder combinar barras, líneas y puntos, adaptarse a móviles, respetar los temas GAM y cargarse solo con las rutas que la usan.

Una biblioteca de gráficas **dibuja** los datos. No decide qué representa una muestra, qué es anómalo ni si una curva estadística es válida. Esas reglas permanecen en funciones de la característica, con pruebas independientes.

## Decisión

Usar **Apache ECharts `6.1.0`**, fijado como dependencia de producción exacta en `package.json` y `package-lock.json`. Integrarlo directamente desde `echarts/core`, sin `ngx-echarts`, `ng2-charts` ni otro wrapper Angular. Esto evita acoplar el proyecto a la matriz de versiones de un wrapper y permite usarlo en componentes standalone con señales y sin Zone.js. La selección no obliga a migrar inmediatamente las gráficas existentes; se aplica al crear o rediseñar cada una.

ECharts ofrece más de 20 tipos combinables, renderizado SVG y Canvas, imports por componente, interacción táctil y descripción accesible opcional. La versión 6.1.0 era la versión estable publicada al tomar esta decisión. Su licencia es Apache-2.0; la instalación fija también `zrender@6.1.0`. La auditoría de dependencias de producción tras instalarlo dio **0 vulnerabilidades**.

## Comparación evaluada

| Opción | Fortalezas | Motivo de no elegirla para GAM |
| --- | --- | --- |
| Apache ECharts 6.1.0 | Amplio catálogo, series combinables, SVG/Canvas, imports selectivos, ARIA, interacción móvil | Elegida; requiere cuidar tamaño de bundle y ciclo de vida del componente. |
| Chart.js | Sencilla, modular, buena para barras/líneas/puntos | Renderiza en Canvas; la alternativa accesible y algunas composiciones requieren más trabajo o extensiones. |
| D3 | Control máximo de escalas, formas e interacción | Es un conjunto de primitivas, no una solución de gráficas terminadas; repetiríamos más infraestructura visual. |

La elección se revisa solo si un requisito concreto no puede resolverse razonablemente con ECharts, hay un problema medido de rendimiento/accesibilidad en los dispositivos objetivo, o cambia su mantenimiento/licencia. No se vuelve a hacer una comparación general para cada nueva gráfica.

## Contrato de integración para futuras gráficas

1. Importar únicamente las series y componentes usados desde `echarts/core`, `echarts/charts`, `echarts/components` y `echarts/renderers`. Evitar `import * as echarts from 'echarts'`, que incluye la biblioteca completa. Usar `ComposeOption` para tipar las opciones de las series registradas.

   Ejemplo de registro para una gráfica que realmente combine las tres series:

   ```ts
   import * as echarts from 'echarts/core';
   import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
   import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
   import { SVGRenderer } from 'echarts/renderers';

   echarts.use([BarChart, LineChart, ScatterChart, AriaComponent, GridComponent, TooltipComponent, SVGRenderer]);
   ```

   Registrar menos módulos si la gráfica no necesita todas esas series. La guía oficial muestra cómo componer el tipo de opciones con `ComposeOption`.
2. Ubicar el componente gráfico en la característica propietaria. Compartir una pieza en `shared/` solo cuando sea reutilizada por distintas características y no contenga reglas de negocio. Mantener la ruta de la característica lazy loaded.
3. Preferir `SVGRenderer` para las gráficas habituales de GAM en móvil y escritorio. Evaluar `CanvasRenderer` solo si la cantidad de elementos o una medición en dispositivos reales lo justifica; la guía oficial recomienda Canvas para volúmenes grandes. No registrar ambos renderizadores por costumbre.
4. Crear la instancia cuando exista el contenedor en el DOM; observar su tamaño con `ResizeObserver`, llamar `resize()` al cambiar y `dispose()` al destruir el componente. Actualizar con `setOption()` al cambiar las señales de datos o tema. Evitar instancias globales y dependencias de Zone.js.
5. Obtener colores mediante los tokens `--gam-color-*` de `src/theme/variables.scss` en ambos temas. No usar la paleta por defecto como fuente de identidad del producto ni colores literales en componentes. Recalcular las opciones visuales cuando cambie el tema de la app.
6. Mantener título, resumen textual y datos relevantes en HTML accesible además de la gráfica. Registrar `AriaComponent` y activar/configurar `aria` cuando aporte contexto, pero no depender solo de la descripción generada. Representar anomalías con color **y** texto, forma o patrón. Tooltips táctiles no deben ser la única forma de consultar un valor.
7. Usar datos numéricos ya normalizados y etiquetas/unidades explícitas. No interpolar HTML no confiable en tooltips; la documentación de seguridad de ECharts advierte que ciertas opciones aceptan HTML o funciones. Mantener el cálculo de medias, desviación, CV, intervalos y anomalías fuera de ECharts, en funciones puras con pruebas.
8. Ajustar ejes y densidad de etiquetas a anchuras de teléfono sin exigir scroll horizontal. Mostrar un estado de datos insuficientes **antes** de inicializar una gráfica inválida. En pesajes, distinguir pesos individuales de promedios grupales y respetar sus umbrales actuales.
9. Al introducir la primera gráfica con ECharts, medir el tamaño del chunk lazy en `npm run build` y probar móvil, escritorio, claro y oscuro. Después de cambios de dependencias ejecutar `npm audit --omit=dev`; las validaciones del repositorio siguen siendo lint, test y build. ECharts no cambia la configuración nativa de Capacitor.

## Primera integración

El histograma de pesajes individuales usa barras de densidad observada y una línea de densidad normal estimada, con renderizador SVG. La compilación de producción del 7 de octubre de 2026 produjo un chunk lazy `flock-weighings-page` de **629,27 kB sin comprimir** y **176,62 kB de transferencia estimada**. Esta cifra incluye la página de pesajes y sus dependencias; no representa el tamaño aislado de ECharts. El paquete no se incorpora al chunk inicial.

La distribución se calcula exclusivamente con entradas individuales válidas de la jornada seleccionada. Cada entrada aporta una observación; los grupos permanecen en el resumen general y el historial. La desviación usa el denominador muestral **N − 1**. La uniformidad ±10 % cuenta los pesos individuales originales dentro del intervalo cerrado `[0,9 μ, 1,1 μ]`. Desde la corrección del 8 de octubre, el eje Y representa densidad de probabilidad en **1/g**: cada barra tiene altura `conteo / (N × ancho del intervalo)` y la curva usa directamente `exp(-0,5 × ((x − μ)/s)²) / (s × sqrt(2π))`, sin multiplicarla por N ni por el intervalo. El área del histograma completo y de la densidad normal sobre la recta real es uno. Los tooltips muestran conteos observados y densidad, sin presentarla como un porcentaje. Con una única observación se muestra el aviso de datos insuficientes y las métricas disponibles en el resumen; con desviación cero se muestran barras sin fabricar una curva.

El ancho de los intervalos del histograma se basa en la amplitud del rango objetivo de la jornada, con aproximadamente 20 intervalos y valores enteros redondos de la serie `1, 2, 5 × 10ⁿ` gramos (mínimo 1 g). Así, 10–100 g utiliza intervalos de 5 g, 65–95 g utiliza 2 g y 100–1000 g utiliza 50 g. Los pesos anómalos no cambian ese ancho. Si falta un rango objetivo válido, se usa la amplitud observada como respaldo. Solo se materializan los intervalos que contienen aves para evitar grandes secuencias vacías ante valores extremos.

Los intervalos de base se centran en múltiplos enteros del ancho y cubren `[c − ancho/2, c + ancho/2)`. Se dividen en los límites del rango esperado para separar valores cercanos de distintas clases. Con rango 1.000–4.000 g e intervalo base de 200 g, 999 y 1.000 g pertenecen respectivamente a 900–1.000 y 1.000–1.100; 4.000 y 4.001 g pertenecen a 3.900–4.000 y 4.000–4.100. Ambos límites son inclusivos para las observaciones dentro del rango. Las columnas se dibujan con una serie `custom` de ECharts desde sus bordes reales, con un margen interior del 9 % por lado; no se impone un ancho mínimo en píxeles que las haga cruzar un límite. Su altura es `conteo / (N × ancho real del intervalo)`, incluso para los intervalos recortados. Los tooltips muestran esos bordes y su densidad. Se conservan los pesos originales para todas las estadísticas y la curva. El resumen cuenta explícitamente los ingresos individuales y grupales confirmados fuera de rango: cada ingreso grupal cuenta uno, independientemente de su cantidad de aves.

La ventana visible es simétrica alrededor de la **media individual real**, señalada por una línea vertical etiquetada. Su radio incluye cuatro desviaciones muestrales, los intervalos observados y ambos límites esperados de la jornada, más un margen del 6 %. No se redondean sus extremos de forma independiente porque eso movería el centro. Las líneas de mínimo y máximo esperado siguen los valores del snapshot de la API para pollitos o adultos. Una normal no truncada puede extenderse a valores negativos cuando la dispersión es grande: no implica que existan mediciones negativas ni redefine la distribución como truncada. Los pesos anómalos confirmados permanecen en todos los cálculos. La API no persiste ingresos pendientes de confirmación; el intento local tampoco entra en la muestra. El resumen distingue las anomalías individuales confirmadas del total de ingresos anómalos, que puede incluir grupos. Las cuatro métricas de la muestra individual se muestran en el resumen del pesaje seleccionado.

## Fuentes oficiales consultadas

- [ECharts: características y tipos disponibles](https://echarts.apache.org/en/)
- [ECharts: imports selectivos y tipos TypeScript](https://echarts.apache.org/handbook/en/basics/import/)
- [ECharts: SVG frente a Canvas](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/)
- [ECharts: tamaño, `ResizeObserver` y `dispose()`](https://echarts.apache.org/handbook/en/concepts/chart-size/)
- [ECharts: accesibilidad](https://echarts.apache.org/handbook/en/best-practices/aria/)
- [ECharts: interacción táctil](https://echarts.apache.org/handbook/en/how-to/interaction/coarse-pointer/)
- [ECharts: seguridad de opciones](https://echarts.apache.org/handbook/en/best-practices/security/)
- [ECharts 6.1.0: release oficial](https://github.com/apache/echarts/releases/tag/6.1.0)
- [Chart.js: gráficos mixtos y accesibilidad Canvas](https://www.chartjs.org/docs/latest/configuration/), [accesibilidad](https://www.chartjs.org/docs/latest/general/accessibility.html)
- [D3: alcance de la biblioteca](https://d3js.org/what-is-d3)

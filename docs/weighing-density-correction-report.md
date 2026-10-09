# Corrección de la distribución de pesos — 8 de octubre de 2026

## 1. Diagnóstico

El cálculo de media y desviación ya excluía grupos, pero la presentación multiplicaba la densidad normal por `N × ancho del intervalo` para compararla con barras de frecuencia. El eje Y y sus tooltips expresaban cantidades. La ventana se centraba en el rango esperado y podía desplazar la media real del centro visible. El contador general de anomalías incluía ingresos grupales y no distinguía los individuales.

Se revisaron AGENTS.md, la documentación obligatoria y ADR 008, los contratos y servicios del frontend, y el contrato OpenAPI, controlador, modelos, presenter, acción de registro y validaciones del backend. No existen README.md ni una carpeta .codex en este checkout del frontend.

## 2. Archivos intervenidos

| Archivo | Cambio |
| --- | --- |
| `src/app/features/flocks/components/weighing-distribution-chart/daily-weighing-distribution.ts` | Función pura de densidad normal reutilizada; muestreo simétrico sin truncamiento en cero. |
| `src/app/features/flocks/components/weighing-distribution-chart/weighing-distribution-chart.component.ts` | Curva y barras en densidad, ventana centrada en μ, marcador de media, límites independientes, eje y tooltip con unidades correctas. |
| `src/app/features/flocks/components/weighing-distribution-chart/weighing-distribution-chart.component.html` | Estado insuficiente sin gráfica; las métricas individuales se trasladaron al resumen. |
| `src/app/features/flocks/components/weighing-distribution-chart/weighing-distribution-chart.component.scss` | Retirada de los estilos de las tarjetas trasladadas. |
| `src/app/features/flocks/pages/flock-weighings/flock-weighings.page.ts` | Métricas de la muestra individual y contador de anomalías individuales derivados del detalle completo. |
| `src/app/features/flocks/pages/flock-weighings/flock-weighings.page.html` | Cuatro métricas en el resumen y desglose de individuales confirmados. |
| `src/app/features/flocks/pages/flock-weighings/flock-weighings.page.scss` | Composición de las métricas del resumen en dos columnas con tokens de ambos temas. |
| `src/app/features/flocks/components/weighing-distribution-chart/weighing-distribution-chart.component.spec.ts` | Pruebas de normalización, centro, rangos, grupos, anomalías y casos degenerados. |
| `src/app/features/flocks/pages/flock-weighings/flock-weighings.page.spec.ts` | Pruebas de métricas trasladadas y flujo de confirmación/cancelación individual y grupal. |
| `docs/adr/008-charting-library.md` | Contrato de representación actualizado a densidad y centro en la media. |

## 3. Lógica estadística

Una entrada individual válida con cantidad 1 aporta una observación en gramos. Se obtiene `μ = Σpeso / N` y la desviación muestral `s = sqrt(Σ(peso − μ)² / (N − 1))`.

La curva utiliza directamente `f(x) = exp(−0,5 × ((x − μ)/s)²) / (s × sqrt(2π))`. Su altura es densidad en **1/g**, no cantidad ni porcentaje. Cada barra se normaliza como `conteo / (N × ancho)`; su tooltip conserva el conteo real. La integral de la normal en toda la recta real es uno, y el área del histograma completo también es uno. La ventana finita no se renormaliza artificialmente.

La ventana es simétrica respecto a μ e incluye cuatro desviaciones, los intervalos observados y ambos límites esperados, con 6 % de margen. El marcador etiquetado de μ coincide con el vértice normal y el centro del área de trazado. Se mantienen intervalos enteros de 1, 2 o 5 por potencias de diez basados en la amplitud esperada. El CV y la uniformidad ±10 % usan la muestra individual completa.

Sin individuales se muestra el estado vacío. Con uno se informa «No hay registros suficientes como para armar la campana» y no se dibuja la gráfica. Con pesos idénticos se representan las barras y se informa desviación cero, sin inventar una normal.

## 4. Anomalías y reglas existentes

Se conserva `outside_expected_range` de las entradas admitidas por la API. Los límites son inclusivos en la lógica existente del backend. Una anomalía confirmada permanece en media, desviación, CV, uniformidad, barras y curva.

El contrato no expone estados pendientes de confirmación: el backend devuelve `409 DAILY_WEIGHING_OUT_OF_RANGE_CONFIRMATION_REQUIRED` antes de persistir. El intento local no se incorpora a los datos seleccionados. Cancelar limpia ese intento sin reenviarlo; confirmar reutiliza la clave idempotente y envía `confirm_out_of_range: true`.

El resumen conserva el total de ingresos anómalos de la API y añade «Individuales confirmados», calculado exclusivamente con las observaciones individuales válidas. Los grupos anómalos continúan teniendo su confirmación y registro propios.

Se reutiliza el snapshot `expected_range` de cada pesaje, incluyendo su categoría y versión. El backend determina bebé/adulto con `adult_from_week` y la edad del lote; no se cambió esa transición ni los rangos globales.

## 5. Exclusión de grupos

La función `dailyWeighingDistribution` filtra por `mode === 'individual'` y `bird_count === 1` antes de calcular cualquier estadística. Ninguna cantidad de grupos habilita una campana grupal ni aporta pesos ficticios. Los grupos siguen en registro, consulta, historial y promedio general del pesaje. No se implementó evolución temporal.

## 6. Validaciones

- Docker: `npm run lint`, correcto.
- Docker: `npm run test:ci`, **368 pruebas correctas en 65 archivos**.
- Verificación final de los dos archivos de pruebas afectados: **20 pruebas correctas**, incluyendo las opciones de ECharts para los tres marcadores y el eje de densidad.
- Docker: `npm run build`, correcto; conserva avisos de presupuestos SCSS y dependencias CommonJS existentes.
- `git diff --check`, correcto.
- Normalización numérica: integración con 4.000 intervalos entre μ − 8s y μ + 8s en tres escalas, área próxima a uno con tolerancia de 10 decimales.
- Casos cubiertos: media/desviación, 100 grupos sin campana, grupos añadidos/modificados sin afectar estadísticas, anomalías confirmadas, intentos pendientes, cancelación, confirmación idempotente, snapshots bebé/adulto, límites inclusivos, conjunto vacío, un individual, desviación cero y datos inválidos.
- Navegador integrado: escritorio de 1.440 px y teléfono de 390 px, temas claro y oscuro, marcador de media, límites, estadísticas trasladadas y cambio de fecha. En teléfono, ancho del documento y ancho desplazable: 390 px. El 7 de octubre tiene una sola observación individual y muestra el aviso insuficiente; el 8 de octubre usa 11 observaciones individuales, incluida una anomalía confirmada.
- Consola del navegador sin errores al cerrar la verificación. Se restauraron el tema claro y el tamaño original del navegador. Captura: `docs/designs/pesajes-echarts/densidad-media-validada.png`.

## 7. Observaciones

Una normal ajustada no demuestra que la muestra siga una distribución normal. Con dispersión grande puede extenderse matemáticamente a pesos negativos; se conserva esa cola para mantener la media centrada y la densidad normal sin truncar. Esto no crea mediciones negativas. La gráfica y los valores originales permiten ver la diferencia entre la muestra y el modelo.

No fue necesario agregar un endpoint ni modificar el backend. La comprobación de admisión de anomalías en el servidor se basó en su contrato y código; las pruebas del flujo frontend usan respuestas simuladas. No se ejecutaron pruebas PHPUnit ni compilaciones Android/iOS: no hubo cambios de API, plugins ni configuración nativa.

## 8. Casos cercanos a los límites y anomalías grupales

Se corrigieron los casos 999 y 4.001 g con rango 1.000–4.000 g. Por decisión del usuario, los intervalos se dividen al alcanzar cada límite y sus barras se dibujan entre sus bordes reales mediante una serie `custom` de ECharts. Los valores exactos de los límites siguen siendo normales. La altura utiliza el ancho real de cada intervalo recortado; media, desviación, CV y curva mantienen todas las mediciones individuales originales.

El resumen ahora muestra tanto «Individuales confirmados» como «Grupales confirmados», incluso cuando son cero. Se cuentan los ingresos grupales del detalle completo que tienen `outside_expected_range: true`, no la cantidad de aves que representan. Verificación con datos reales del 7 de octubre: 4 anomalías totales, 3 individuales y 1 grupal.

Lint y build correctos. La suite completa ejecutó 371 pruebas: 370 pasaron y una de navegación agotó su tiempo de 5 segundos. Al repetir únicamente ese archivo, sus 10 pruebas pasaron, incluida la que había agotado el tiempo. Las 23 pruebas de gráfica y página de pesajes pasaron en la suite completa. Navegador integrado: escritorio de 1.280 px y móvil de 390 px, temas claro y oscuro, separación de barras y tooltip del intervalo superior. Capturas: `intervalos-divididos-limites-validado.png` y `anomalias-grupales-resumen-validado.png`, en `docs/designs/pesajes-echarts/`.

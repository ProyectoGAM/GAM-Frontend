# Evolución del peso de los lotes

Implementada el 9 de octubre de 2026 con Apache ECharts 6.1.0, según ADR 008. La pestaña «Gráficas» permite alternar entre «Campana de Gauss» y «Evolución del peso». La campana conserva la fecha seleccionada y sus estadísticas individuales al alternar.

## Datos y lectura

- Se consulta `GET /pesajes-diarios` filtrado por lote y período, recorriendo sus cursores con páginas de 100. No requiere el detalle de cada día ni un endpoint nuevo. Los períodos de 7 y 30 días incluyen hoy en America/Montevideo; «Todo el historial» no limita la fecha inicial.
- Cada punto usa el `average_weight_g` calculado por la API para toda la muestra diaria: suma de los pesos individuales y totales grupales dividida entre la cantidad de aves representadas. No se promedian los promedios de los grupos y no se fabrican observaciones individuales.
- El eje X es temporal y conserva la separación real entre fechas. No se agregan puntos para días sin registros. La línea recta entre observaciones permite seguir la tendencia; no equivale a una medición de cada fecha intermedia ni a una curva genética ideal.
- Los límites pertenecen al `expected_range` guardado en cada pesaje. Si todos coinciden se muestra una banda continua con sus límites; si cambian, la banda y sus límites se dibujan en la fecha de cada medición sin interpolar rangos entre fechas sin datos.
- Un promedio diario fuera de su rango se muestra como triángulo rojo y se identifica en el tooltip. Los límites son inclusivos. Esto clasifica el **promedio diario**, no cuenta los ingresos anómalos del día: una muestra puede tener ingresos anómalos y un promedio dentro del rango.
- El tooltip muestra fecha, promedio, cantidad de aves, rango y estado en curso. No se inventa una edad histórica que no expone el resumen diario de la API.
- La tarjeta inferior muestra el último promedio del período. Un solo día tiene un punto y un aviso de tendencia insuficiente. Sin mediciones vigentes se muestra el estado vacío; días vacíos por eliminación y mediciones inválidas no generan puntos.

## Integración

Componente propietario en `features/flocks/components/weighing-growth-chart`, imports selectivos, renderizador SVG, ResizeObserver, actualización por señales y tema, y `dispose()` al desmontar. Colores de los tokens GAM para ambos temas, tooltips `richText`, fechas locales representadas a las 00:00 UTC con ejes y formatos UTC para alinear puntos y etiquetas sin desplazamientos de fecha, y etiquetas adaptadas a móvil sin scroll horizontal. El historial existente permite consultar también los valores en texto.

La gráfica muestra la evolución observada y el rango configurado. Verificar el crecimiento contra una guía genética por edad requeriría que la API expusiera esa referencia; no se presenta el rango actual como sustituto de dicha guía.

## Validación

Lint, 394 pruebas en 66 archivos y build de producción correctos. Verificada en el navegador integrado con una sola fecha, múltiples fechas, historial completo, rangos cambiantes y un promedio extremo confirmado. Comprobados los tooltips, la conservación de la fecha al alternar con la campana y la vista de 390 px en temas claro y oscuro. Evidencia en `docs/designs/weighing-growth-implemented.png`.

# Integración de pesajes diarios

El contrato de `GAM-Backend/contracts/openapi/weighings.yaml` ya expone los pesajes diarios que necesita la pantalla. El frontend consume solo los recursos nuevos; los registros anteriores de `/pesajes` no forman parte de este historial, conforme a la decisión para el entorno de desarrollo.

## Recursos utilizados

| Necesidad | Ruta |
| --- | --- |
| Historial por lote, con cursor | `GET /pesajes-diarios?flock_id=...` |
| Muestra de hoy | `GET /lotes/{lote}/pesajes-diarios/{fecha}` |
| Detalle y sus ingresos | `GET /pesajes-diarios/{jornada}` |
| Ingreso individual o grupal | `POST /lotes/{lote}/pesajes-diarios/ingresos` |
| Eliminar un ingreso | `DELETE /pesajes-diarios/{jornada}/ingresos/{ingreso}` |
| Editar rangos globales | `GET/PUT /configuracion-pesajes` |

El peso grupal ingresado es el **total** del grupo. La API divide ese total entre la cantidad de aves para evaluar el rango y cuenta al grupo fuera de rango como un dato anómalo. Ante `DAILY_WEIGHING_OUT_OF_RANGE_CONFIRMATION_REQUIRED`, el formulario pide confirmación y reenvía el ingreso con la misma `Idempotency-Key` y `confirm_out_of_range: true`; cancelar descarta el intento. Cada eliminación requiere versión, motivo e `Idempotency-Key`, y la API recalcula los agregados de la muestra.

La jornada agrupa los ingresos por fecha local de `America/Montevideo`, se cierra al terminar el día y conserva su rango esperado histórico. La distribución toma únicamente los pesos individuales válidos y vigentes de la jornada seleccionada; cada entrada individual cuenta una vez. Los intervalos se ajustan a la muestra y cada columna cuenta aves individuales observadas. La curva normal de referencia se escala a la frecuencia esperada por intervalo (`densidad × cantidad de aves individuales × ancho del intervalo`). La media, desviación estándar muestral, CV, uniformidad ±10 %, extremos y ejes automáticos usan esa misma muestra. Los grupos conservan su registro, resumen general e historial, y no alimentan la distribución. Sin individuos válidos se muestra un estado vacío; con uno se muestra su barra y la desviación no está disponible; con pesos idénticos se muestran las barras con desviación cero. En los dos últimos casos no se dibuja una curva normal.

El endpoint `GET /pesajes-diarios/{jornada}/distribucion` del contrato también excluye grupos y ofrece una curva en densidad (`1/g`). La pantalla deriva la distribución localmente de todos los ingresos activos paginados para conservar los puntos de peso exacto y mantener una sola carga del detalle.

## Verificación local

La migración `2026_10_07_142233_create_daily_weighing_tables.php` estaba pendiente en la base de desarrollo y se aplicó de forma aislada. Se verificaron en el navegador integrado el registro individual, el registro grupal por peso total, la cancelación y confirmación de un dato grupal anómalo, la eliminación de ese ingreso con motivo y el recálculo de aves y último ingreso. El historial y «Ver registro» cargan el recurso diario nuevo.

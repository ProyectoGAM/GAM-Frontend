# API solicitada: evolución de pesajes grupales

## Motivo

La lista de `/pesajes-diarios` contiene el promedio de cada jornada, pero no los grupos que lo componen. El detalle de cada jornada sí contiene los ingresos, pero construir una evolución histórica con él exigiría una consulta adicional por cada fecha. La API `/pesajes/evolucion` corresponde a los registros anteriores y no cubre las jornadas nuevas.

## Endpoint propuesto

`GET /lotes/{lote}/pesajes-diarios/evolucion-grupal?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&cursor=...&per_page=...`

Responder con paginación por cursor, orden cronológico estable y fechas locales de la operación. Exponer únicamente ingresos grupales vigentes de jornadas nuevas. Aplicar el permiso de lectura de pesajes y los mismos límites de acceso al lote que el resto de la API. El contrato debe fijar el tamaño máximo de página y el comportamiento de fechas sin grupos.

```json
{
  "data": [
    {
      "daily_weighing_id": "01...",
      "date": "2026-10-07",
      "age_days": 5,
      "group_count": 2,
      "bird_count": 150,
      "total_weight_g": "19000",
      "average_weight_g": "126.6667",
      "expected_range": { "min_weight_g": "100", "max_weight_g": "150", "unit": "g", "reference_version": 1 },
      "groups": [
        {
          "id": "01...",
          "occurred_at": "2026-10-07T12:00:00Z",
          "bird_count": 100,
          "total_weight_g": "12000",
          "average_weight_g": "120",
          "outside_expected_range": false
        },
        {
          "id": "01...",
          "occurred_at": "2026-10-07T12:10:00Z",
          "bird_count": 50,
          "total_weight_g": "7000",
          "average_weight_g": "140",
          "outside_expected_range": true
        }
      ]
    }
  ],
  "next_cursor": null
}
```

El peso total debe ser **neto**, descontada la tara si se usa recipiente. Si la API recibe peso bruto, debe exponer también la tara y el peso neto calculado. Para cada grupo, `average_weight_g = total_weight_g / bird_count`. Para la jornada, `average_weight_g = Σ total_weight_g / Σ bird_count`; nunca el promedio simple de los promedios grupales. `age_days` corresponde a la edad del lote en esa fecha; `expected_range` es el rango guardado para esa jornada, incluso si la configuración global cambió después. Los grupos de edades distintas no deben combinarse en una sola distribución.

Con esta respuesta una futura vista de evolución grupal podrá trazar un punto por grupo según edad, dimensionarlo por aves pesadas y unir los promedios conjuntos de cada fecha. Esa vista sería independiente de la distribución de pesos individuales. Una eventual distribución de promedios grupales de una fecha requeriría al menos 10 grupos comparables; no representaría la dispersión ni el CV de pesos individuales.

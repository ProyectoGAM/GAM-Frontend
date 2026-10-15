# Raciones en plantillas y planes de manejo

La actividad `ration_change` se presenta como «Ración». Conserva título,
momento previsto y notas; requiere una receta activa y la cantidad de gramos
enteros que consume cada ave por día. El campo muestra «g» dentro del control.
Admite día, semana y tramo de semanas. No admite condición ni selección «Sin
referencia»; vacunas y medicamentos conservan su referencia opcional.

El catálogo usa `GET /recetas?estado=active&por_pagina=100&page=...`, recorre
todas las páginas y utiliza `id` y `nombre`. Se trata del catálogo global de
recetas: no se filtra por stock de una UP para planificar. La disponibilidad
para el consumo efectivo se resuelve en alimentación.

Creación y revisión envían el ID de receta como `catalog_ref` y
`grams_per_bird` como entero entre 1 y 999999999999, solo para raciones. El
editor bloquea cantidades vacías, decimales, cero y fuera de rango, así como
recetas ausentes, no disponibles o pendientes de cargar. Una consulta fallida
permite reintentar y no habilita guardar una ración sin receta.

La edición restaura `feed_recipe_id` y `grams_per_bird`; puede usar el ID del
snapshot cuando `catalog_type` es `feed_recipe`. Un ID de producto de una
versión antigua nunca se interpreta como ID de receta. Los registros antiguos
sin receta o gramos requieren completar esos datos, sin valores inventados.
El catálogo de raciones no incorpora opciones históricas fuera del catálogo
activo. El detalle del plan muestra receta y gramos por ave y día.

El formulario aclara que se necesita una ración inicial en día 1 o semana 1,
y que las etapas de ración deben tener fechas de inicio diferentes. Esas
invariantes del plan completo siguen validadas por el servidor. Los errores
de envío usan el aviso visible y el foco del editor.

Contratos consultados: `GAM-Backend/contracts/openapi/management-plans.yaml` y
`GAM-Backend/contracts/openapi/feed-recipes.yaml`. No se modificó el backend.

Validación: lint, 606 pruebas en 91 archivos y build dentro de Docker. Las
pruebas cubren obligatoriedad, límites de gramos, payload, paginación de
recetas activas, referencias históricas, reintento y rechazo de referencias
no disponibles. Se comprobó el catálogo real, el bloqueo del envío incompleto
y la presentación en escritorio y 390 × 844, claro y oscuro, sin crear
plantillas ni registrar consumos.

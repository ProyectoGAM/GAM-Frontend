# Stock de raciones

La vista `/administracion/inventario/existencias/raciones` se abre desde Existencias,
junto a Stock de huevos. Usa `contracts/openapi/feed-recipes.yaml` del backend.

Cada saldo corresponde a una **receta + UP**, compartido entre todas sus plantas.
El selector local elige inicialmente la primera UP disponible, igual que Stock de
huevos; no modifica el contexto general del panel. La receta continúa siendo global.
Los productos genéricos de tipo ración no se mezclan con estas cuentas de alimento.

## Consultas

- `GET saldos-alimento`: `up_id`, `receta_id` opcional, `requiere_atencion=1`
  opcional, `por_pagina=25` y `page`. Incluye cuentas materializadas con saldo cero
  y recetas inactivas. El contador de atención corresponde sólo a la página visible.
- `GET unidades-productivas/{up}/recetas/{receta}/saldo`: permite consultar una
  receta sin movimientos antes de configurar su mínimo, sin crear stock al leer.
- `GET recetas`: catálogo completo y paginado, sin excluir recetas inactivas.

El listado presenta `saldo_g` y `minimo_g` como kg, conservando cada gramo sin
redondeos. Los estados y `requiere_atencion` se toman del backend: `sin_configurar`,
`suficiente`, `en_minimo` y `por_debajo`. Los saldos negativos se muestran como
tales, incluso cuando no tienen un mínimo configurado.

Los cambios de UP y filtros vuelven a la primera página. La paginación conserva
los filtros aplicados; las respuestas de consultas anteriores se descartan.
Errores de catálogo, de unidades y de stock ofrecen reintentos independientes.

## Mínimos

`PATCH unidades-productivas/{up}/recetas/{receta}/minimo` envía únicamente
`{ minimo_g: string | null }`, sin clave de idempotencia. No registra ajustes ni
modifica cantidades disponibles. Tras guardar se consulta nuevamente el listado.

El formulario acepta kg con coma o punto y hasta tres decimales, desde cero hasta
999.999.999,999 kg (999999999999 gramos). Un campo vacío envía `null` para quitar el
mínimo. **Cero es un mínimo configurado**, distinto de no configurar un mínimo.
Con mínimo configurado, un saldo igual o inferior requiere atención.

Editar mínimos requiere `inventory.manage` o rol admin. El catálogo requiere
`feed-recipes.view` o admin: habilita buscar recetas y configurar mínimos para
cuentas sin movimientos. Quien puede gestionar inventario pero no ver el catálogo
puede modificar los mínimos de las cuentas existentes, sin consultar ese catálogo.
El backend conserva la autorización definitiva; la consulta de saldos mantiene
su política actual de autenticación y sesión válida.

El diálogo conserva los errores y permite reintentar. Durante el guardado impide
doble envío, edición, cierre y cambio de UP. Al cerrar descarta consultas pendientes
y devuelve el foco al control de origen. La vista usa los tokens GAM de ambos
temas, tarjetas en teléfono y tabla en escritorio, sin cambios en plugins nativos.
Esta integración muestra atención por stock; no envía notificaciones.

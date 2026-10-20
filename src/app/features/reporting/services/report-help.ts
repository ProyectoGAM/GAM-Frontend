export const reportHelpText = {
  period: 'Elige las fechas de los registros que quieres consultar. Desde y Hasta incluyen esos días completos.\nTodo el historial: abarca el historial disponible del reporte elegido, con los demás filtros que hayas seleccionado.\nEste mes: desde el primer día del mes hasta hoy. Puedes cambiar las fechas a mano.',
  reportType: 'Cada registro: muestra una fila por dato cargado, por ejemplo, una fila por recolección de huevos.\nTotales y promedios: reúne los registros para mostrar un resumen, por ejemplo, cuántos huevos produjo cada galpón. Después eliges qué calcular y cómo separar ese resumen.',
  columns: 'Las columnas son los datos que aparecen uno al lado del otro en la tabla, como Fecha, Galpón y Huevos. Marca lo que necesitas.\nSubir y Bajar cambian el orden de las columnas en la tabla y en el archivo; no cambian los registros de la granja.',
  metrics: 'Elige qué quieres calcular con los registros, por ejemplo, sumar los huevos o calcular el peso promedio.\nPuedes elegir varios resultados. Los valores registrados y los estimados se muestran por separado.',
  groupings: 'Permite tener un resumen para cada grupo.\nSi marcas Galpón, verás una fila por galpón. Si marcas Galpón y Mes, verás una fila por galpón en cada mes.\nSin elegir grupos, verás un resumen general. Al sumar productos con medidas diferentes, por ejemplo, gramos y unidades, se muestra un resultado separado para cada medida.',
  conditions: 'Incluir esta opción: muestra sólo lo elegido. Excluir esta opción: muestra todo salvo lo elegido.\nIncluir varias opciones: marca las que quieres ver. Excluir varias opciones: marca las que no quieres ver.\nSin elegir opciones, este filtro no limita el reporte. No se elimina ningún registro.',
  sort: 'Sólo cambia el orden en que aparecen las filas.\nPara Fecha, puedes ver primero los registros más antiguos o los más recientes. Para una cantidad, los valores menores o mayores. Para un nombre, el orden de A a Z o de Z a A. No cambia los totales.',
  exports: 'Excel permite trabajar con una planilla. PDF deja el reporte listo para leer o imprimir.\nAmbos incluyen todas las filas de la consulta aplicada, no sólo las que se ven en esta página. Después encontrarás el archivo en Reportes exportados.',
  saved: 'Guarda el nombre y las elecciones de tu reporte para volver a consultarlo. Al abrirlo otra vez se buscan los datos actuales y se usa la unidad productiva seleccionada en el dashboard.\nUn reporte guardado no es una copia fija de los datos.',
};

const fieldHelp: Record<string, string> = {
  mode: 'Indica cómo se pesaron las aves.\nTodos: incluye pesadas individuales y grupales.\nIndividual: cada ave se pesó por separado.\nGrupal: varias aves se pesaron juntas; se registraron cuántas eran y su peso total. El peso promedio se calcula repartiendo ese peso entre las aves.',
  base_unit: 'Es la medida usada para expresar la cantidad de un producto, por ejemplo, gramos, mililitros o unidades.\nEste filtro sólo muestra productos con esa medida. No convierte ni cambia las cantidades.',
  below_minimum: 'Compara la cantidad disponible con el mínimo configurado para el producto y la ubicación.\nSí: muestra los que están por debajo del mínimo.\nNo: muestra los que alcanzan o superan el mínimo.\nTodos: incluye ambos casos.',
  minimum_quantity: 'La cantidad mínima configurada para ese producto en esa ubicación. Sirve para reconocer cuándo hay que reponer. No es la cantidad que hay disponible.',
  below_minimum_count: 'Cuenta los casos en que un producto está por debajo de su mínimo en una ubicación. El mismo producto puede contar más de una vez si le falta stock en varios lugares. No suma las cantidades que faltan.',
  weighted_average_g: 'Calcula el peso promedio teniendo en cuenta cuántas aves representa cada pesada.\nUna pesada grupal de 10 aves cuenta como 10 aves; una individual cuenta como 1. Así un grupo grande no tiene el mismo peso en el promedio que una sola ave.',
  average_weight_g: 'Peso promedio de un ave en esa pesada. En una pesada grupal, se obtiene repartiendo el peso total entre la cantidad de aves del grupo. En una individual, coincide con el peso de esa ave.',
  represented_birds: 'Cantidad de aves representadas en las pesadas consultadas. Una pesada individual representa 1 ave y una grupal, la cantidad de aves que se cargó.\nNo es el total de aves del lote ni un conteo de aves distintas: un ave puede haberse pesado más de una vez.',
  bird_count: 'Cantidad de aves incluidas en esa pesada. En una pesada individual es 1; en una grupal es la cantidad registrada para el grupo.',
  feed_quantity: 'Suma la ración efectivamente registrada en el sistema. No agrega las cantidades estimadas de los días sin carga.',
  estimated_feed_quantity: 'Para los días sin una carga, repite la última cantidad diaria registrada. La estimación se corta ante una nueva carga, un cambio de galpón, el cierre del lote o el fin del período.\nNo es una medición nueva ni se agrega al total registrado.',
  covered_days: 'Cantidad de días que representa esta fila del reporte de alimentación. Permite distinguir el período cubierto por una cantidad.',
  scheduled_from: 'Fecha inicial que indicaba el manual para realizar la tarea. Puede ser diferente de la fecha en que se hizo. Puede estar vacía si la tarea no tenía una fecha definida.',
  scheduled_to: 'Última fecha prevista por el manual para realizar la tarea. No es la fecha en que se realizó. Puede estar vacía en tareas sin calendario.',
  schedule: 'Indica si el manual daba una fecha, un período o una condición para hacer la tarea. Una tarea sin calendario no recibe una fecha inventada.',
  stock_location_id: 'Lugar donde se guarda el producto, por ejemplo, un depósito o una planta de ración. Permite consultar sus existencias o movimientos dentro de la selección actual.',
};

const scopedHelp: Record<string, Record<string, string>> = {
  'management.feed-supply': { kind: 'Indica de dónde sale la cantidad de ración.\nRegistrado: una persona cargó el suministro.\nEstimado: se repite la última cantidad diaria en días sin carga; no es una medición nueva.\nTodos: incluye ambos orígenes, manteniendo registrados y estimados por separado.' },
  'commerce.egg-outflow': { kind: 'Elige qué salidas de huevos incluir.\nVenta: huevos vendidos. Donación: huevos entregados sin venta.\nTodos: incluye ventas y donaciones; sus cantidades se muestran por separado. No incluye pérdidas ni cargas de reparto.' },
  'lots.weighing-measurements': { origin: 'Indica de qué registro viene la pesada.\nHistórico: el registro anterior de pesajes.\nDiario: las jornadas de pesaje.\nNo indica la edad de las aves ni cambia cómo se calcula el promedio.' },
  'inventory.movements': { type: 'Elige la clase de movimiento.\nSaldo inicial: la cantidad de partida. Ingreso: entra producto. Salida: sale producto. Pérdida: se descuenta producto perdido. Ajuste: corrige una cantidad. Traslado: cambia de ubicación. Reversión: compensa un movimiento anterior.\nTodos: incluye todas las clases.' },
};

export function reportFieldHelp(source: string, field: string): string {
  return scopedHelp[source]?.[field] ?? fieldHelp[field] ?? '';
}

export function reportOptionLabel(source: string, field: string, value: string | number | boolean, label: string): string {
  if (source === 'lots.weighing-measurements' && field === 'mode') return value === 'individual' ? 'Individual' : value === 'group' ? 'Grupal' : label;
  if (field === 'base_unit') return ({ unit: 'Unidades', kg: 'Kilogramos (kg)', g: 'Gramos (g)', l: 'Litros (l)', ml: 'Mililitros (ml)', dose: 'Dosis' } as Record<string, string>)[String(value)] ?? label;
  if (source === 'inventory.movements' && field === 'type') return ({ opening_balance: 'Saldo inicial', receipt: 'Ingreso', issue: 'Salida', loss: 'Pérdida', adjustment: 'Ajuste', transfer: 'Traslado', reversal: 'Reversión' } as Record<string, string>)[String(value)] ?? label;
  return label;
}

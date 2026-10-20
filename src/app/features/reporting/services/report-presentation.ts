export const reportTopics = [
  { key: 'produccion', label: 'Producción y lotes', icon: 'egg-outline', description: 'Huevos recolectados, ingresos de aves y pesadas.', sources: ['lots.egg-production', 'lots.admissions', 'lots.weighing-measurements'] },
  { key: 'manejo', label: 'Alimentación y cuidados', icon: 'heart-outline', description: 'Ración, vacunaciones y tareas realizadas.', sources: ['management.feed-supply', 'management.vaccinations', 'management.executions'] },
  { key: 'inventario', label: 'Inventario y salida de huevos', icon: 'cube-outline', description: 'Existencias, movimientos, ventas y donaciones.', sources: ['inventory.stock-balances', 'inventory.movements', 'commerce.egg-outflow'] },
  { key: 'repartos', label: 'Repartos', icon: 'car-outline', description: 'Entregas y mercadería de cada recorrido.', sources: ['deliveries.deliveries'] },
];

export const reportIcons: Record<string, string> = {
  'lots.egg-production': 'egg-outline', 'lots.admissions': 'enter-outline', 'lots.weighing-measurements': 'scale-outline',
  'management.feed-supply': 'nutrition-outline', 'management.vaccinations': 'medical-outline', 'management.executions': 'clipboard-outline',
  'inventory.stock-balances': 'layers-outline', 'inventory.movements': 'swap-horizontal-outline', 'commerce.egg-outflow': 'basket-outline',
  'deliveries.deliveries': 'car-outline',
};

export const reportHelp: Record<string, string> = {
  'lots.egg-production': 'Consulta cuántos huevos se recolectaron en cada galpón.',
  'lots.admissions': 'Revisa los ingresos de aves y la información de cada lote.',
  'lots.weighing-measurements': 'Consulta las pesadas y el peso promedio de las aves.',
  'management.feed-supply': 'Consulta la ración registrada y la pauta estimada, por separado.',
  'management.vaccinations': 'Revisa qué vacunas se aplicaron, cuándo y a qué lote.',
  'management.executions': 'Revisa los cuidados y las tareas que ya se realizaron.',
  'inventory.stock-balances': 'Consulta las cantidades disponibles en este momento.',
  'inventory.movements': 'Revisa las entradas y salidas de los productos.',
  'commerce.egg-outflow': 'Consulta los huevos vendidos y donados, con sus totales separados.',
  'deliveries.deliveries': 'Revisa las entregas, la mercadería y las observaciones de los repartos.',
};

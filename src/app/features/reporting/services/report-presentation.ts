export const reportTopics = [
  { key: 'produccion', label: 'Producción y lotes', icon: 'egg-outline', description: 'Huevos recolectados, movimientos de aves y seguimiento de cada lote.', sources: ['lots.egg-production', 'lots.admissions', 'lots.summary', 'lots.weighing-measurements', 'lots.mortality'] },
  { key: 'manejo', label: 'Alimentación y cuidados', icon: 'heart-outline', description: 'Alimentación, salud de las aves y tareas de manejo realizadas.', sources: ['management.feed-supply', 'management.feeding', 'management.vaccinations', 'lots.medications', 'management.executions', 'management.overview'] },
  { key: 'inventario', label: 'Inventario y salida de huevos', icon: 'cube-outline', description: 'Existencias, movimientos, elaboración de ración y salida de productos.', sources: ['inventory.stock-balances', 'inventory.movements', 'inventory.feed-manufacturing', 'inventory.feed-balances', 'commerce.egg-outflow'] },
  { key: 'repartos', label: 'Repartos', icon: 'car-outline', description: 'Entregas de huevos y mercadería en cada recorrido.', sources: ['deliveries.deliveries', 'deliveries.collections'] },
  { key: 'clientes', label: 'Clientes y cuentas', icon: 'people-outline', description: 'Cuentas de tus clientes y el detalle de sus movimientos.', sources: ['accounts.movements'] },
  { key: 'vehiculos', label: 'Vehículos', icon: 'car-outline', description: 'Uso de los vehículos de la granja y sus gastos asociados.', sources: ['vehicles.usage', 'vehicles.fuel'] },
  { key: 'gastos', label: 'Gastos', icon: 'construct-outline', description: 'Gastos de mantenimiento de la infraestructura y de los vehículos.', sources: ['expenses.poultry-house-maintenance', 'vehicles.maintenance'] },
];

export const reportNames: Record<string, string> = {
  'lots.egg-production': 'Huevos recolectados', 'lots.admissions': 'Ingresos de aves', 'lots.summary': 'Lotes completos',
  'lots.weighing-measurements': 'Pesajes de aves', 'lots.mortality': 'Mortandad',
  'management.feed-supply': 'Alimentación diaria', 'management.feeding': 'Alimentación histórica',
  'management.vaccinations': 'Vacunación', 'lots.medications': 'Medicación',
  'management.executions': 'Tareas realizadas', 'management.overview': 'Resumen de manejos',
  'inventory.stock-balances': 'Existencias de productos', 'inventory.movements': 'Movimientos de inventario',
  'inventory.feed-manufacturing': 'Elaboraciones de ración', 'inventory.feed-balances': 'Stock de alimento por receta',
  'commerce.egg-outflow': 'Ventas y donaciones', 'deliveries.deliveries': 'Entregas y mercadería',
  'deliveries.collections': 'Reparto completo', 'accounts.movements': 'Cuenta corriente completa',
  'vehicles.usage': 'Uso de vehículos', 'vehicles.fuel': 'Combustible y gastos',
  'expenses.poultry-house-maintenance': 'Mantenimiento de galpones', 'vehicles.maintenance': 'Mantenimiento de vehículos',
};

// The custom creator keeps its existing catalog until its own design is defined.
export const customReportSources = ['lots.egg-production', 'lots.admissions', 'lots.weighing-measurements', 'management.feed-supply', 'management.vaccinations', 'management.executions', 'inventory.stock-balances', 'inventory.movements', 'commerce.egg-outflow', 'deliveries.deliveries'];

export const reportIcons: Record<string, string> = {
  'lots.egg-production': 'egg-outline', 'lots.admissions': 'enter-outline', 'lots.weighing-measurements': 'scale-outline',
  'management.feed-supply': 'nutrition-outline', 'management.vaccinations': 'medical-outline', 'management.executions': 'clipboard-outline',
  'inventory.stock-balances': 'layers-outline', 'inventory.movements': 'swap-horizontal-outline', 'commerce.egg-outflow': 'basket-outline',
  'deliveries.deliveries': 'car-outline',
};

export const reportHelp: Record<string, string> = {
  'lots.egg-production': 'Consulta cuántos huevos se recolectaron en cada galpón.',
  'lots.admissions': 'Revisa los ingresos de aves y la información de cada lote.',
  'lots.weighing-measurements': 'Consulta las posturas y el peso promedio de las aves.',
  'management.feed-supply': 'Consulta la ración registrada y la pauta estimada, por separado.',
  'management.vaccinations': 'Revisa qué vacunas se aplicaron, cuándo y a qué lote.',
  'management.executions': 'Revisa los cuidados y las tareas que ya se realizaron.',
  'inventory.stock-balances': 'Consulta las cantidades disponibles en este momento.',
  'inventory.movements': 'Revisa las entradas y salidas de los productos.',
  'commerce.egg-outflow': 'Consulta los huevos vendidos y donados, con sus totales separados.',
  'deliveries.deliveries': 'Revisa las entregas, la mercadería y las observaciones de los repartos.',
};

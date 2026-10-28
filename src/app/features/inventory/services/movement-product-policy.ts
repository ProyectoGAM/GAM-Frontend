import { AllowedStockProduct, StockLocation, StockLocationType } from '../interfaces/inventory';
import { InventoryOperation } from '../types/inventory-state.type';
import { decimalCompare } from './inventory-format';

export const STOCK_LOCATION_TYPES: readonly { value: StockLocationType; label: string }[] = [
  { value: 'warehouse', label: 'Cámara de insumos' }, { value: 'feed_plant', label: 'Planta de ración' },
  { value: 'egg_account', label: 'Cuenta de huevos de UP' }, { value: 'health', label: 'Sanidad' },
  { value: 'unknown', label: 'Sin clasificar' },
];

export function movementLocationKind(location: StockLocation): StockLocationType {
  return STOCK_LOCATION_TYPES.some((item) => item.value === location.type) ? location.type : 'unknown';
}

export function stockLocationTypeLabel(location: StockLocation): string {
  return STOCK_LOCATION_TYPES.find((item) => item.value === movementLocationKind(location))!.label;
}

export function isMovementProductAllowed(product: AllowedStockProduct, location: StockLocation, operation: InventoryOperation): boolean {
  if (product.kind === 'medicine' || product.kind === 'vaccine' || location.type === 'health') return false;
  if (operation === 'loss' && decimalCompare(product.available_quantity, '0') <= 0) return false;
  if (movementLocationKind(location) === 'unknown' || location.status !== 'active' || location.production_unit?.status === 'inactive') return false;
  if (location.type === 'feed_plant' && product.base_unit !== 'g') return false;
  return location.allowed_product_kinds?.includes(product.kind) === true;
}

export function movementLocationDescription(location: StockLocation): string {
  const description = {
    feed_plant: 'Planta de ración · Solo materias primas',
    egg_account: 'Cuenta de huevos de UP · Solo huevos',
    warehouse: 'Cámara de insumos · Solo insumos y otros',
    health: 'Sanidad histórica · Sin movimientos nuevos',
    unknown: 'Tipo sin identificar · No admite movimientos desde este formulario',
  }[movementLocationKind(location)];
  return location.production_unit ? `${description} · ${location.production_unit.name}` : description;
}

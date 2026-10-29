import { AllowedStockProduct, ProductKind, StockLocation } from '../interfaces/inventory';
import { InventoryOperation } from '../types/inventory-state.type';
import { isMovementProductAllowed, movementLocationKind } from './movement-product-policy';

const baseLocation: StockLocation = { id: 1, name: 'Nombre arbitrario', type: 'warehouse', allowed_product_kinds: ['supply', 'other'], status: 'active', system_managed: false };
const camera: StockLocation = { ...baseLocation, production_unit: { id: 1, name: 'UP' } };
const plant: StockLocation = { ...camera, type: 'feed_plant', allowed_product_kinds: ['raw_material'], system_managed: true, poultry_house_id: 4 };
const eggs: StockLocation = { ...camera, type: 'egg_account', allowed_product_kinds: ['egg'], system_managed: true };
const health: StockLocation = { ...camera, type: 'health', allowed_product_kinds: [], system_managed: true };
const product: AllowedStockProduct = { id: 1, sku: 'SKU', name: 'Producto', kind: 'other', base_unit: 'g', available_quantity: '1.000000' };
const kinds: ProductKind[] = ['raw_material', 'supply', 'finished_feed', 'egg', 'medicine', 'vaccine', 'other'];
const operations: InventoryOperation[] = ['receipt', 'issue', 'transfer', 'loss', 'adjustment'];

describe('Public movement storage restrictions', () => {
  it('applies the complete matrix in every operation, regardless of name or UP ownership of a camera', () => {
    for (const operation of operations) {
      for (const kind of kinds) {
        const item = { ...product, kind };
        expect(isMovementProductAllowed(item, plant, operation)).toBe(kind === 'raw_material');
        expect(isMovementProductAllowed(item, eggs, operation)).toBe(kind === 'egg');
        expect(isMovementProductAllowed(item, camera, operation)).toBe(kind === 'supply' || kind === 'other');
        expect(isMovementProductAllowed(item, baseLocation, operation)).toBe(kind === 'supply' || kind === 'other');
        expect(isMovementProductAllowed(item, health, operation)).toBe(false);
      }
    }
    expect(movementLocationKind({ ...camera, name: 'Cuenta de huevos' })).toBe('warehouse');
    expect(movementLocationKind({ ...plant, name: 'Cámara' })).toBe('feed_plant');
  });

  it('blocks stale health categories even if an older response still advertises physical stock', () => {
    const stale = { ...health, allowed_product_kinds: ['medicine', 'vaccine'] as ProductKind[] };
    expect(isMovementProductAllowed({ ...product, kind: 'medicine' }, stale, 'receipt')).toBe(false);
    expect(isMovementProductAllowed({ ...product, kind: 'vaccine' }, stale, 'transfer')).toBe(false);
  });

  it('blocks unknown locations and does not infer categories from ownership, names or system_managed', () => {
    expect(isMovementProductAllowed(product, { ...baseLocation, type: 'unknown', allowed_product_kinds: [], system_managed: true }, 'receipt')).toBe(false);
    expect(movementLocationKind({ ...health, name: 'Cámara', system_managed: false, poultry_house_id: 4 })).toBe('health');
    for (const location of [camera, plant, eggs]) {
      expect(isMovementProductAllowed({ ...product, kind: 'medicine' }, location, 'receipt')).toBe(false);
      expect(isMovementProductAllowed({ ...product, kind: 'vaccine' }, location, 'receipt')).toBe(false);
    }
  });

  it('obeys the returned allowed categories and excludes inactive storage and non-gram raw material', () => {
    expect(isMovementProductAllowed(product, { ...camera, allowed_product_kinds: [] }, 'receipt')).toBe(false);
    expect(isMovementProductAllowed(product, { ...camera, status: 'inactive' }, 'receipt')).toBe(false);
    expect(isMovementProductAllowed(product, { ...camera, production_unit: { id: 1, name: 'UP', status: 'inactive' } }, 'receipt')).toBe(false);
    expect(isMovementProductAllowed({ ...product, kind: 'raw_material', base_unit: 'kg' }, plant, 'receipt')).toBe(false);
  });

  it('requires strictly positive stock for losses without losing decimal precision', () => {
    for (const available_quantity of ['0.000000', '-1.000000', '-9007199254740993.000001']) {
      expect(isMovementProductAllowed({ ...product, available_quantity }, camera, 'loss')).toBe(false);
    }
    expect(isMovementProductAllowed({ ...product, available_quantity: '0.000001' }, camera, 'loss')).toBe(true);
    expect(isMovementProductAllowed({ ...product, available_quantity: '0.000000' }, camera, 'receipt')).toBe(true);
    expect(isMovementProductAllowed({ ...product, available_quantity: '-1.000000' }, camera, 'adjustment')).toBe(true);
  });
});

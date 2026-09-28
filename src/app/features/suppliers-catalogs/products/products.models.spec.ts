import {
  baseUnitLabel,
  Product,
  productKindLabel,
  productStatusLabel,
  stockTrackedLabel,
} from './products.models';

describe('product catalog labels', () => {
  it('models ownership and capabilities metadata and keeps specialized public IDs as strings', () => {
    const vaccine: Product = {
      id: 17,
      sku: 'VAC-01', name: 'Vacuna', kind: 'vaccine', base_unit: 'dose', stock_tracked: true, status: 'active',
      system_managed: false,
      specialized_owner: { type: 'vaccine', id: '01J6M8F7Y2KV5P1R9WQ0T6Z3AB' },
      capabilities: { editable_fields: [], activate: false, deactivate: false },
    };
    expect(vaccine.specialized_owner).toEqual({ type: 'vaccine', id: '01J6M8F7Y2KV5P1R9WQ0T6Z3AB' });
    expect(vaccine.capabilities).toEqual({ editable_fields: [], activate: false, deactivate: false });
  });

  it('maps every product kind to its Spanish label', () => {
    expect([
      productKindLabel('raw_material'),
      productKindLabel('supply'),
      productKindLabel('finished_feed'),
      productKindLabel('egg'),
      productKindLabel('medicine'),
      productKindLabel('vaccine'),
      productKindLabel('other'),
    ]).toEqual([
      'Materia prima', 'Insumo', 'Ración', 'Huevo', 'Medicamento', 'Vacuna', 'Otro',
    ]);
  });

  it('maps every base unit, product status, and stock flag to Spanish copy', () => {
    expect(['unit', 'kg', 'g', 'l', 'ml', 'dose'].map((unit) => baseUnitLabel(unit as Parameters<typeof baseUnitLabel>[0])))
      .toEqual(['Unidad', 'Kilogramo', 'Gramo', 'Litro', 'Mililitro', 'Dosis']);
    expect(productStatusLabel('active')).toBe('Activo');
    expect(productStatusLabel('inactive')).toBe('Inactivo');
    expect(stockTrackedLabel(true)).toBe('Sí');
    expect(stockTrackedLabel(false)).toBe('No');
  });
});

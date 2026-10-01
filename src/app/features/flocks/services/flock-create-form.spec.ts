import { describe, expect, it } from 'vitest';

import { FlockCreateDraft, FlockCreateChoices, buildCreateFlockRequest, validateFlockCreateStep } from './flock-create-form';

const template = { id: '01J00000000000000000000000', name: 'Ponedoras', status: 'active' as const, published_version: 3 };
const choices: FlockCreateChoices = {
  unitId: 7,
  houseIds: [22],
  houseCapacity: 1800,
  breedIds: [4],
  supplierIds: [9],
  templates: [template],
  todayIso: '2026-10-01',
};
const draft: FlockCreateDraft = {
  code: 'ponedoras-a24', houseId: 22, entryDate: '2026-09-29', initialQuantity: '1200',
  breedId: 4, source: 'supplier', supplierId: 9, origin: '', notes: 'Ingreso inicial', templateId: template.id,
};

describe('flock creation form', () => {
  it('validates each step and sends the exact published plan version', () => {
    expect(validateFlockCreateStep(1, draft, choices)).toEqual({});
    expect(validateFlockCreateStep(2, draft, choices)).toEqual({});
    expect(validateFlockCreateStep(3, draft, choices)).toEqual({});
    expect(buildCreateFlockRequest(draft, template)).toEqual({
      code: 'PONEDORAS-A24', breed_id: 4, poultry_house_id: 22, initial_quantity: 1200,
      entry_date: '2026-09-29', plan_template_id: template.id, plan_template_version: 3,
      supplier_id: 9, notes: 'Ingreso inicial',
    });
  });

  it('rejects future dates and unavailable galpones', () => {
    expect(validateFlockCreateStep(1, { ...draft, entryDate: '2027-08-14', houseId: 24 }, choices))
      .toMatchObject({ entryDate: expect.any(String), houseId: expect.any(String) });
  });

  it('rejects quantities beyond the selected galpón capacity', () => {
    expect(validateFlockCreateStep(1, { ...draft, initialQuantity: '1801' }, choices).initialQuantity)
      .toContain('capacidad del galpón');
  });

  it('accepts a written origin instead of a supplier', () => {
    const originDraft = { ...draft, source: 'origin' as const, supplierId: null, origin: 'Criadero externo' };
    expect(validateFlockCreateStep(2, originDraft, choices)).toEqual({});
    expect(buildCreateFlockRequest(originDraft, template)).toMatchObject({ origin: 'Criadero externo' });
    expect(buildCreateFlockRequest(originDraft, template)).not.toHaveProperty('supplier_id');
  });

  it('requires a published active template', () => {
    expect(validateFlockCreateStep(3, draft, { ...choices, templates: [{ ...template, published_version: null }] }))
      .toHaveProperty('templateId');
  });
});

import { CreateFlockRequest, FlockPlanTemplateOption } from '../interfaces/flock.interface';
import { formatFlockEntryDate } from './flock-entry-date';

export type FlockCreateStep = 1 | 2 | 3;
export type FlockCreateField = 'unitId' | 'code' | 'houseId' | 'entryDate' | 'initialQuantity'
  | 'breedId' | 'supplierId' | 'origin' | 'notes' | 'templateId';
export type FlockCreateErrors = Partial<Record<FlockCreateField, string>>;

export interface FlockCreateDraft {
  code: string;
  houseId: number | null;
  entryDate: string;
  initialQuantity: string;
  breedId: number | null;
  source: 'supplier' | 'origin';
  supplierId: number | null;
  origin: string;
  notes: string;
  templateId: string;
}

export interface FlockCreateChoices {
  unitId: number | null;
  houseIds: readonly number[];
  houseCapacity: number | null;
  breedIds: readonly number[];
  supplierIds: readonly number[];
  templates: readonly FlockPlanTemplateOption[];
  todayIso: string;
}

export function validateFlockCreateStep(
  step: FlockCreateStep,
  draft: FlockCreateDraft,
  choices: FlockCreateChoices,
): FlockCreateErrors {
  const errors: FlockCreateErrors = {};

  if (step === 1) {
    if (choices.unitId === null) errors.unitId = 'Seleccioná una unidad productiva.';
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(draft.code.trim()) || draft.code.trim().length > 60) {
      errors.code = 'Usá hasta 60 letras, números, guiones o guiones bajos, sin espacios.';
    }
    if (draft.houseId === null || !choices.houseIds.includes(draft.houseId)) {
      errors.houseId = 'Seleccioná un galpón operativo y vacío de esta UP.';
    }
    if (!formatFlockEntryDate(draft.entryDate) || draft.entryDate > choices.todayIso) {
      errors.entryDate = 'Ingresá una fecha válida que no sea futura.';
    }
    if (!/^[1-9]\d*$/.test(draft.initialQuantity)
      || Number(draft.initialQuantity) > 2147483647) {
      errors.initialQuantity = 'Ingresá una cantidad entera mayor que cero.';
    } else if (choices.houseCapacity !== null && Number(draft.initialQuantity) > choices.houseCapacity) {
      errors.initialQuantity = `La cantidad supera la capacidad del galpón (${choices.houseCapacity} aves).`;
    }
  }

  if (step === 2) {
    if (draft.breedId === null || !choices.breedIds.includes(draft.breedId)) {
      errors.breedId = 'Seleccioná una raza activa.';
    }
    if (draft.source === 'supplier') {
      if (draft.supplierId === null || !choices.supplierIds.includes(draft.supplierId)) {
        errors.supplierId = 'Seleccioná un proveedor activo o indicá el origen.';
      }
    } else if (!draft.origin.trim() || draft.origin.trim().length > 255) {
      errors.origin = 'Describí el origen de las aves (hasta 255 caracteres).';
    }
    if (draft.notes.length > 5000) errors.notes = 'Las notas no pueden superar 5000 caracteres.';
  }

  if (step === 3 && !choices.templates.some((template) => template.id === draft.templateId
    && template.status === 'active' && template.published_version !== null)) {
    errors.templateId = 'Seleccioná una plantilla de manejo publicada.';
  }

  return errors;
}

export function buildCreateFlockRequest(
  draft: FlockCreateDraft,
  template: FlockPlanTemplateOption | null,
): CreateFlockRequest | null {
  if (draft.houseId === null || draft.breedId === null || template?.published_version === null
    || template === null || (draft.source === 'supplier' && draft.supplierId === null)) return null;

  return {
    code: draft.code.trim().toUpperCase(),
    breed_id: draft.breedId,
    poultry_house_id: draft.houseId,
    initial_quantity: Number(draft.initialQuantity),
    entry_date: draft.entryDate,
    plan_template_id: template.id,
    plan_template_version: template.published_version,
    ...(draft.source === 'supplier'
      ? { supplier_id: draft.supplierId as number }
      : { origin: draft.origin.trim() }),
    notes: draft.notes.trim() || null,
  };
}

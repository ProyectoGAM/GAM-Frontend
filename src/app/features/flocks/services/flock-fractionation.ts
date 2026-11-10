import { FractionationContext, FractionationDraft, FractionationRequest, FractionationTarget } from '../interfaces/flock-fractionation.interface';

export type FractionationErrors = Partial<Record<'quantity' | 'target' | 'code' | 'occurredAt' | 'reason', string>>;

export function fractionationTargets(context: FractionationContext, destination: FractionationDraft['destination']): FractionationTarget[] {
  const source = context.source;
  const flocks = context.flocks.filter((flock) => flock.production_unit_id === source.production_unit_id);
  const open = flocks.filter((flock) => flock.status !== 'finished');
  const living = open.filter((flock) => flock.current_quantity > 0);
  return context.houses.filter((house) => house.type === 'poultry' && house.status === 'operational'
    && house.id !== source.poultry_house_id).flatMap((house): FractionationTarget[] => {
    if (destination === 'empty') {
      return living.some((flock) => flock.poultry_house_id === house.id) ? [] : [{
        value: String(house.id), label: house.name, description: 'Sin aves · ' + context.unitName, house,
      }];
    }
    return open.filter((flock) => flock.poultry_house_id === house.id && flock.id !== source.id
      && flock.breed_id === source.breed_id).map((flock) => ({
      value: flock.id, label: house.name + ' · ' + flock.code,
      description: new Intl.NumberFormat('es-UY').format(flock.current_quantity) + ' aves · Misma raza · ' + context.unitName,
      house, flock,
    }));
  }).sort((left, right) => left.label.localeCompare(right.label, 'es'));
}

export function fractionationQuantity(draft: FractionationDraft, context: FractionationContext): number | null {
  if (draft.kind === 'total') return context.source.current_quantity;
  const value = draft.quantity.trim();
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

export function validateFractionation(draft: FractionationDraft, context: FractionationContext, now = Date.now()): FractionationErrors {
  const errors: FractionationErrors = {};
  const quantity = fractionationQuantity(draft, context);
  if (quantity === null || quantity <= 0 || quantity > context.source.current_quantity
    || (draft.kind === 'partial' && quantity >= context.source.current_quantity)) {
    errors.quantity = draft.kind === 'partial' ? 'Ingresá una cantidad entera mayor que cero y menor que las aves vivas.' : 'El lote no tiene aves disponibles.';
  }
  if (!fractionationTargets(context, draft.destination).some((target) => target.value === draft.target)) {
    errors.target = 'Seleccioná un destino disponible de la misma UP del lote original.';
  }
  if (draft.kind === 'partial' && draft.destination === 'empty' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(draft.code.trim())) {
    errors.code = 'Ingresá un código de hasta 60 caracteres, con letras, números, guiones o guiones bajos.';
  }
  if (draft.occurredAt && (!Number.isFinite(Date.parse(draft.occurredAt)) || Date.parse(draft.occurredAt) > now)) {
    errors.occurredAt = 'Ingresá una fecha y hora válidas que no sean futuras.';
  }
  if (draft.reason.trim().length > 500) errors.reason = 'El motivo admite hasta 500 caracteres.';
  return errors;
}

export function buildFractionation(draft: FractionationDraft, context: FractionationContext): FractionationRequest | null {
  if (Object.keys(validateFractionation(draft, context)).length || context.source.status === 'finished') return null;
  const target = fractionationTargets(context, draft.destination).find((option) => option.value === draft.target)!;
  return {
    version: context.source.version, quantity: fractionationQuantity(draft, context)!,
    ...(draft.destination === 'existing' && target.flock
      ? { destination_flock_id: target.flock.id, destination_version: target.flock.version }
      : { destination_poultry_house_id: target.house.id,
        ...(draft.kind === 'partial' ? { destination_code: draft.code.trim().toUpperCase() } : {}) }),
    ...(draft.occurredAt ? { occurred_at: new Date(draft.occurredAt).toISOString() } : {}),
    ...(draft.reason.trim() ? { reason: draft.reason.trim() } : {}),
  };
}

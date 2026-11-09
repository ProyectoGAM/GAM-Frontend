import { HttpErrorResponse } from '@angular/common/http';

import { BreedReferences, CreateBreed, UpdateBreed } from '../interfaces/breed-catalog';
import { BreedWeighingSettings, WeighingSettings } from '../interfaces/flock-weighing.interface';

export const breedStages = [{ key: 'chick', label: 'Pollitos' }, { key: 'adult', label: 'Adultas' }] as const;
type BreedStage = typeof breedStages[number]['key'];

const gramsFormat = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 });
const gramsPattern = /^\d{1,13}(?:\.\d)?$/;

export function breedGrams(value: string): string | null {
  const normalized = value.trim().replace(',', '.');
  return gramsPattern.test(normalized) && Number(normalized) > 0 ? normalized : null;
}

function rangeLabel(min: string, max: string): string {
  return `${gramsFormat.format(Number(min))}–${gramsFormat.format(Number(max))} g`;
}

export function breedRange(breed: BreedWeighingSettings, stage: BreedStage) {
  const effective = breed.expected_ranges?.[stage];
  if (effective) return {
    weight: rangeLabel(effective.min_weight_g, effective.max_weight_g),
    source: effective.source === 'breed' ? 'Rango propio' : 'Rango global',
  };
  const min = breed.range_overrides[`${stage}_min_weight_g`];
  const max = breed.range_overrides[`${stage}_max_weight_g`];
  return min !== null && max !== null
    ? { weight: rangeLabel(min, max), source: 'Rango propio guardado' }
    : { weight: 'Sin rango global', source: null };
}

export function breedReferences(settings: WeighingSettings | null, breeds: readonly BreedWeighingSettings[]): BreedReferences {
  const first = breeds.find(({ expected_ranges }) => expected_ranges)?.expected_ranges;
  const reference = (stage: BreedStage) => {
    if (settings) return rangeLabel(settings[`${stage}_min_weight_g`], settings[`${stage}_max_weight_g`]);
    const inherited = breeds.map(({ expected_ranges }) => expected_ranges)
      .find((ranges) => ranges?.reference_version === first?.reference_version && ranges?.[stage].source === 'global')?.[stage];
    return inherited ? rangeLabel(inherited.min_weight_g, inherited.max_weight_g) : null;
  };
  return {
    adultWeek: settings?.adult_from_week ?? first?.adult_from_week ?? null,
    chick: reference('chick'), adult: reference('adult'),
  };
}

export function breedChanges(breed: BreedWeighingSettings, values: CreateBreed): UpdateBreed {
  const changes: UpdateBreed = { version: breed.version };
  if (values.name !== breed.name) changes.name = values.name;
  if (values.status !== breed.status) changes.status = values.status;
  for (const { key } of breedStages) {
    const min = `${key}_min_weight_g` as const;
    const max = `${key}_max_weight_g` as const;
    const minimum = values[min] ?? null;
    const maximum = values[max] ?? null;
    // Los decimales equivalentes no deben activar una reclasificación de pesajes.
    if (Number(minimum) !== Number(breed.range_overrides[min]) || Number(maximum) !== Number(breed.range_overrides[max])) {
      changes[min] = minimum;
      changes[max] = maximum;
    }
  }
  return changes;
}

export function breedError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'Sin conexión. Revisá tu conexión y volvé a intentar.';
  if (error.status === 403) return 'Tu cuenta no tiene permiso para realizar esta acción.';
  if (error.status === 404) return 'La raza ya no está disponible.';
  if (error.status === 409 || error.status === 422) {
    const body = error.error as { detail?: unknown; errors?: Record<string, string[]> } | null;
    const detail = Object.values(body?.errors ?? {})[0]?.[0] ?? body?.detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

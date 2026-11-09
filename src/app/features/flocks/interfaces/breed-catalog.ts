import { BreedWeighingSettings, SaveBreedWeighingSettings } from './flock-weighing.interface';

export interface BreedCatalogQuery {
  search: string;
  status: BreedWeighingSettings['status'] | '';
  page: number;
}

export interface BreedCatalogPage {
  data: BreedWeighingSettings[];
  meta: { current_page: number; last_page: number; total: number };
}

export interface CreateBreed extends Partial<Omit<SaveBreedWeighingSettings, 'version'>> {
  name: string;
  status: BreedWeighingSettings['status'];
}

export interface UpdateBreed extends Partial<CreateBreed> {
  version: number;
}

export interface BreedDraft {
  breed: BreedWeighingSettings | null;
  values: CreateBreed;
}

export interface BreedReferences {
  adultWeek: number | null;
  chick: string | null;
  adult: string | null;
}

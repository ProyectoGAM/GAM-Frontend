export interface EggPresentation {
  id: string;
  label: string;
  category: string;
  eggs_per_unit: number;
  default_unit_price: number | null;
  currency: 'UYU';
}

export interface EggPresentationInput {
  name: string;
  eggs_per_unit: number;
  default_unit_price: number;
}

export interface EggPresentationList {
  data: EggPresentation[];
  meta: { locked: boolean };
}

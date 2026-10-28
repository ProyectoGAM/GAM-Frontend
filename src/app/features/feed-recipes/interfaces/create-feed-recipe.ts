export interface CreateFeedRecipe {
  nombre: string;
  nota: string | null;
  rendimiento_g: string;
  ingredientes: { producto_id: number; cantidad_g: string }[];
}

export interface RecipeMaterial {
  id: number;
  name: string;
  sku: string;
  kind: string;
  base_unit: string;
  stock_tracked: boolean;
  status: 'active' | 'inactive';
}

export interface RecipeMaterialsPage {
  data: RecipeMaterial[];
  meta: { current_page: number; last_page: number };
}

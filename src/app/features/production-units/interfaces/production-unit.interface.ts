export interface ProductionUnit {
  id: number;
  name: string;
  status: 'active' | 'inactive';
  locality_id?: number;
  latitude?: number | string | null;
  longitude?: number | string | null;
  locality: {
    id: number;
    department_id: number;
    name: string;
    department: {
      id: number;
      name: string;
    };
  };
}

export type PoultryHouseStatus = 'operational' | 'maintenance' | 'out_of_service' | 'inactive';
export type PoultryHouseType = 'poultry' | 'feed';

export interface PoultryHouse {
  id: number;
  name: string;
  type: PoultryHouseType;
  status: PoultryHouseStatus;
  bird_capacity: number | null;
  current_occupancy?: number | null;
}

export interface PoultryHouseListItem extends PoultryHouse {
  productionUnit: ProductionUnit;
}

export interface PoultryHouseDetail extends PoultryHouse {
  production_unit_id: number;
  production_unit: ProductionUnit;
}

export interface HouseFlock {
  id: string;
  code: string;
  poultry_house_id: number;
  current_quantity: number;
  current_week: number;
  status: 'active' | 'quarantined' | 'finished';
}

export interface FeedStockItem {
  product_id: number;
  product: { id: number; name: string; sku: string };
  total_g: string;
  is_negative: boolean;
  details: Array<{ plant_id: number; poultry_house_id: number; stock_g: string; included_in_totals: boolean }>;
}

export interface FeedStock {
  scope: 'plant' | 'production_unit' | 'global';
  scope_id: number | null;
  items: FeedStockItem[];
}

export interface CreateFeedIngredientRequest {
  sku: string;
  nombre: string;
  cantidad: string;
  unidad: 'g' | 'kg';
}

export interface GeographyDepartment {
  id: number;
  name: string;
}

export interface GeographyLocality {
  id: number;
  department_id: number;
  name: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
  };
}

export interface CreateProductionUnitRequest {
  locality_id: number;
  name: string;
  latitude: number;
  longitude: number;
  status: 'active' | 'inactive';
}

export interface CreateProductionUnitResponse {
  data: {
    id: number;
    name: string;
  };
}

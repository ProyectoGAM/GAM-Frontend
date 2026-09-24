export interface ProductionUnit {
  id: number;
  name: string;
  status?: 'active' | 'inactive' | 'archived';
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

export interface PoultryHouse {
  id: number;
  name: string;
  status: PoultryHouseStatus;
  bird_capacity: number;
  current_occupancy?: number | null;
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

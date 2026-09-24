export interface ProductionUnit {
  id: number;
  name: string;
  locality: {
    name: string;
    department: {
      name: string;
    };
  };
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

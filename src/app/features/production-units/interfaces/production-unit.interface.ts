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

export interface ProductionUnitPage {
  data: ProductionUnit[];
  meta: {
    current_page: number;
    last_page: number;
  };
}

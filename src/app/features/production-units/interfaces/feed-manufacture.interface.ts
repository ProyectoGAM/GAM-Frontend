export interface ManufactureRecipe {
  id: number;
  nombre: string;
  rendimiento_g: string;
  estado: 'active' | 'inactive';
}

export interface ManufactureCalculation {
  receta_id: number;
  rendimiento_g: string;
  cantidad_g: string;
  factor: string;
  ingredientes: {
    producto_id: number;
    nombre: string;
    cantidad_base_g: string;
    cantidad_requerida_g: string;
  }[];
}

export interface ManufactureRequest {
  receta_id: number;
  planta_id: number;
  cantidad_g: string;
}

export interface PendingManufacture {
  request: ManufactureRequest;
  key: string;
}

export interface FeedManufacture extends ManufactureCalculation {
  id: number;
  operacion_id: string;
  planta_id: number;
  up_id: number;
  nombre_receta: string;
  nombre_planta: string;
  registrado_en: string;
  saldo_anterior_g: string;
  saldo_resultante_g: string;
  estado: 'elaborada' | 'cancelada';
  distribucion: {
    producto_id: number;
    planta_id: number;
    nombre_planta: string;
    cantidad_g: string;
    linea_movimiento_id: number;
  }[];
}

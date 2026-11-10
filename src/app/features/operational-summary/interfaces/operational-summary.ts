import type { NotificationUrgency } from '../../notifications/types/notification.type';

export interface SummaryPeriod {
  from: string;
  to: string;
}

export interface EggMetrics {
  total_eggs: number;
  daily_average: number;
  by_day: readonly { date: string; quantity: number }[];
  comparacion: { desde: string; hasta: string; total_huevos: number; variacion_porcentual: number | null };
}

export interface LiveBirds {
  aves_vivas: number;
  consultado_en: string;
}

export interface MortalityMetrics {
  bajas_registradas: number;
  poblacion_referencia: number | null;
  tasa_porcentual: number | null;
  estado_tasa: 'calculada' | 'sin_poblacion' | 'historial_indeterminado' | 'bajas_superan_poblacion';
}

export interface OperationalAlertSummary {
  total: number;
  por_urgencia: Record<NotificationUrgency, number>;
}

export interface ExpenseSummary {
  fuentes_sin_permiso: string[];
  totales: { moneda: string; importe: string; por_fuente: { fuente: string; importe: string }[] }[];
}

export interface DeliveredValue {
  amount: string | null;
  deliveries: number;
  unpriced: number;
}

export interface FeedBalance {
  receta_id: number;
  nombre_receta: string;
  saldo_g: string;
  requiere_atencion: boolean;
}

export interface SummaryFlock {
  id: string;
  code: string;
  poultry_house_id: number;
  current_quantity: number;
  status: 'active' | 'quarantined' | 'finished';
}

export interface SummaryList<T> {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
}

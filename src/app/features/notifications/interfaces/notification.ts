import { NotificationOrder, NotificationUrgency, NotificationView } from '../types/notification.type';

export interface AppNotification {
  id: string;
  tipo: string;
  urgencia: NotificationUrgency;
  modulo: string;
  titulo: string;
  mensaje: string;
  fecha: string;
  leida_en: string | null;
  estado_resolucion: 'no_resuelto' | 'resuelto' | null;
  resuelta_en: string | null;
  entidad: { tipo: string; id: string; ruta: string | null } | null;
}

export interface NotificationQuery {
  page?: number;
  perPage?: number;
  order: NotificationOrder;
  urgency?: NotificationUrgency;
  view: NotificationView;
}

export interface NotificationSummary {
  no_leidas: number;
  tiempo_real: { clave: string; canal: string } | null;
}

export interface NotificationPage {
  data: AppNotification[];
  meta: { current_page: number; last_page: number; total: number };
}

export interface OperationalAlertEpisode {
  id: string;
  tipo: string;
  modulo: string;
  up_id: number | null;
  urgencia: NotificationUrgency;
  titulo: string;
  ocurrida_en: string;
  entidad: NonNullable<AppNotification['entidad']>;
}

export interface OperationalAlertPage {
  data: OperationalAlertEpisode[];
  meta: NotificationPage['meta'];
}

export interface AppNotification {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  fecha: string;
  leida_en: string | null;
  entidad: { tipo: string; id: string; ruta: string | null } | null;
}

export interface NotificationSummary {
  no_leidas: number;
  tiempo_real: { clave: string; canal: string } | null;
}

export interface NotificationPage {
  data: AppNotification[];
  meta: { current_page: number; last_page: number };
}

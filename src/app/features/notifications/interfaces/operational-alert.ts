import { AlertLevel } from '../types/alert-settings.type';
import { OperationalAlertModule, OperationalAlertValues } from '../types/operational-alert.type';

export interface OperationalAlertField {
  clave: string;
  etiqueta: string;
  tipo: 'booleano' | 'seleccion' | 'entero';
  minimo?: number;
  maximo?: number;
  opciones?: readonly (AlertLevel | null)[];
}

export interface OperationalAlert {
  tipo: string;
  nombre: string;
  modulo: OperationalAlertModule;
  unidad_productiva_id: number | null;
  configuracion: OperationalAlertValues & { habilitada: boolean; urgencia_fija: AlertLevel | null };
  campos: readonly OperationalAlertField[];
}

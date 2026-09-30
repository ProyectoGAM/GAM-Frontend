import { PlanActivity } from '../interfaces/management-plan';

const TYPES: Record<string, string> = {
  vaccination: 'Vacunación', medication: 'Medicación', ration_change: 'Alimentación',
  weighing: 'Pesaje', manual_practice: 'Práctica manual', flock_movement: 'Movimiento',
  egg_collection: 'Recolección', mortality: 'Mortalidad',
};

export function activityTypeLabel(type: string): string { return TYPES[type] ?? type; }

export function activityTimingLabel(activity: PlanActivity): string {
  switch (activity.timing_kind) {
    case 'day': return activity.start_day ? `Día ${activity.start_day}` : 'Día sin definir';
    case 'week': return activity.start_week ? `Semana ${activity.start_week}` : 'Semana sin definir';
    case 'week_range':
      if (!activity.start_week) return 'Tramo sin definir';
      return activity.end_week
        ? `Semanas ${activity.start_week}–${activity.end_week} (inclusive)`
        : `Desde semana ${activity.start_week} hasta fin de ciclo`;
    case 'day_recurrence': {
      const interval = activity.interval_days;
      const frequency = interval === 7 ? 'Cada semana' : interval === 14 ? 'Cada 2 semanas' : `Cada ${interval ?? '—'} días`;
      const end = activity.end_day ? ` hasta día ${activity.end_day}`
        : activity.end_week ? ` hasta semana ${activity.end_week}` : '';
      return `${frequency} desde día ${activity.start_day ?? '—'}${end}`;
    }
    case 'unscheduled': return 'Sin fecha prevista';
  }
}

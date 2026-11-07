import { AlertModule, AlertThresholdField, AlertThresholds } from '../interfaces/alert-settings';
import { AlertLevel, AlertRuleKind } from '../types/alert-settings.type';

export const alertModules: readonly AlertModule[] = [
  {
    id: 'lotes', title: 'Lotes', description: 'Recolección diaria de huevos', icon: 'egg-outline',
    rules: [
      {
        id: 'daily_egg_collection_missing', kind: 'daily', title: 'Falta de recolección diaria',
        description: 'Jornadas cerradas consecutivas sin una recolección registrada.',
      },
    ],
  },
  {
    id: 'planes', title: 'Planes de manejo', description: 'Alimentación, sanidad y tareas previstas', icon: 'clipboard-outline',
    rules: [
      {
        id: 'vaccination_due', kind: 'scheduled', title: 'Vacunación',
        description: 'Avisos respecto de la fecha prevista de vacunación.',
      },
      {
        id: 'medication_due', kind: 'scheduled', title: 'Medicación',
        description: 'Avisos respecto de la fecha prevista de medicación.',
      },
      {
        id: 'beak_trimming_due', kind: 'scheduled', title: 'Despique',
        description: 'Avisos respecto de la fecha prevista de despique.',
      },
      {
        id: 'feed_coverage', kind: 'coverage', title: 'Cobertura de ración',
        description: 'Días de ración disponibles según el stock y el consumo.',
      },
      {
        id: 'manual_feeding_review_due', kind: 'feeding-review', title: 'Revisión de ración manual',
        description: 'Días desde la última confirmación de la pauta de alimentación.',
      },
      {
        id: 'manual_practice_due', kind: 'scheduled', title: 'Práctica manual programada',
        description: 'Avisos respecto de la fecha prevista de la práctica.',
      },
      {
        id: 'flock_movement_due', kind: 'scheduled', title: 'Movimiento de lote programado',
        description: 'Avisos respecto de la fecha prevista del movimiento.',
      },
      {
        id: 'egg_collection_due', kind: 'scheduled', title: 'Recolección programada',
        description: 'Avisos para una tarea de recolección del plan de manejo.',
      },
      {
        id: 'mortality_due', kind: 'scheduled', title: 'Registro de mortalidad programado',
        description: 'Avisos respecto de la fecha prevista del registro.',
      },
    ],
  },
];

const levels = [
  { level: 'bajo', label: 'Baja' },
  { level: 'medio', label: 'Media' },
  { level: 'alto', label: 'Alta' },
] as const;

function supportedLevels(kind: AlertRuleKind) {
  return kind === 'feeding-review' ? levels.slice(1) : levels;
}

export function describeThresholds(kind: AlertRuleKind, values: AlertThresholds) {
  return supportedLevels(kind).map(({ level, label }) => ({
    level, label, active: values[level] !== null, description: describeDays(kind, level, values[level]),
  }));
}

function describeDays(kind: AlertRuleKind, level: AlertLevel, value: number | null): string {
  if (value === null) return 'Sin aviso';
  const days = Math.abs(value) === 1 ? '1 día' : `${Math.abs(value)} días`;
  if (kind === 'scheduled') {
    if (value === 0) return 'Día previsto';
    return value < 0 ? `${days} antes` : `${days} de atraso`;
  }
  if (kind === 'coverage') return level === 'alto' ? `Hasta ${days}` : `Menos de ${days}`;
  return days;
}

export function thresholdFields(kind: AlertRuleKind, values: AlertThresholds): AlertThresholdField[] {
  return supportedLevels(kind).map(({ level, label }) => {
    const value = values[level];
    const optional = level === 'bajo' || (level === 'medio' && (kind === 'daily' || kind === 'scheduled'));
    const coverage = kind === 'coverage';
    const options: AlertThresholdField['options'] = [
      ...(optional ? [{ value: 'off', label: 'Sin aviso' } as const] : []),
      ...(kind === 'scheduled' ? [
        { value: 'before', label: 'Días antes' },
        { value: 'on-date', label: 'Día previsto' },
        { value: 'after', label: 'Días de atraso' },
      ] as const : [
        { value: 'after', label: coverage ? (level === 'alto' ? 'Hasta (días)' : 'Menos de (días)') : 'Desde (días)' },
      ] as const),
    ];
    const onDate = kind === 'scheduled' && value === 0;
    return {
      level, label, options,
      min: coverage && level === 'alto' ? 0 : coverage && level === 'bajo' ? 2 : 1,
      max: coverage && level === 'alto' ? 364 : 365,
      moment: value === null ? 'off' : onDate ? 'on-date' : value < 0 ? 'before' : 'after',
      days: value === null || onDate ? null : Math.abs(value),
    };
  });
}

export function usesDayCount(moment: AlertThresholdField['moment']): boolean {
  return moment === 'before' || moment === 'after';
}

export function readThresholds(kind: AlertRuleKind, fields: readonly AlertThresholdField[]): AlertThresholds | string {
  const values: AlertThresholds = { bajo: null, medio: null, alto: 0 };
  for (const { level, label, moment, days, min, max } of fields) {
    if (usesDayCount(moment) && (days === null || !Number.isInteger(days) || days < min || days > max)) {
      return `Urgencia ${label.toLowerCase()}. Ingresá un número entero de días entre ${min} y ${max}.`;
    }
    if (moment === 'off') continue;
    values[level] = moment === 'on-date' ? 0 : (days ?? 0) * (moment === 'before' ? -1 : 1);
  }
  if (kind === 'coverage') {
    if (values.medio === null || values.alto >= values.medio || (values.bajo !== null && values.medio >= values.bajo)) {
      return 'La urgencia debe aumentar a medida que quedan menos días de ración.';
    }
  } else {
    const active = levels.map(({ level }) => values[level]).filter((value) => value !== null);
    if (active.some((value, index) => index > 0 && value <= active[index - 1])) {
      return 'Cada nivel activo debe comenzar después del nivel anterior.';
    }
  }
  return values;
}

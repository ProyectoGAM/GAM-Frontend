import { CreatePlanTemplateRequest, PlanActivityInput, PlanActivityType, PlanTemplate, PlanTimingKind } from '../interfaces/management-plan';

export interface ActivityDraft {
  clientId: number;
  type: PlanActivityType | '';
  title: string;
  timingKind: PlanTimingKind | '';
  startDay: string;
  endDay: string;
  startWeek: string;
  endWeek: string;
  intervalDays: string;
  recurrenceEnd: 'day' | 'week';
  conditional: boolean;
  condition: string;
  notes: string;
  catalogRef: string;
}

export interface TemplateDraft {
  name: string;
  description: string;
  activities: ActivityDraft[];
}

export type EditorErrors = Record<string, string>;

export function emptyActivity(clientId: number): ActivityDraft {
  return {
    clientId, type: '', title: '', timingKind: '', startDay: '', endDay: '', startWeek: '', endWeek: '',
    intervalDays: '', recurrenceEnd: 'day', conditional: false, condition: '', notes: '', catalogRef: '',
  };
}

export function draftFromTemplate(template: PlanTemplate): TemplateDraft {
  return {
    name: template.name,
    description: template.description ?? '',
    activities: template.activities.map((activity, index) => {
      const reference = activity.catalog_snapshot?.['id'];
      return {
        clientId: index + 1,
        type: activity.type as PlanActivityType,
        title: activity.title,
        timingKind: activity.timing_kind,
        startDay: activity.start_day?.toString() ?? '',
        endDay: activity.end_day?.toString() ?? '',
        startWeek: activity.start_week?.toString() ?? '',
        endWeek: activity.end_week?.toString() ?? '',
        intervalDays: activity.interval_days?.toString() ?? '',
        recurrenceEnd: activity.end_week === null ? 'day' : 'week',
        conditional: activity.conditional,
        condition: activity.condition ?? '',
        notes: activity.notes ?? '',
        catalogRef: typeof reference === 'string' || typeof reference === 'number' ? String(reference) : '',
      };
    }),
  };
}

export function describeTemplateChanges(previous: PlanTemplate, current: PlanTemplate): string[] {
  const changes: string[] = [];
  if (previous.current_version !== current.current_version) changes.push(`La versión actual pasó de ${previous.current_version} a ${current.current_version}.`);
  if (previous.published_version !== current.published_version) changes.push(`La versión publicada pasó de ${previous.published_version ?? 'ninguna'} a ${current.published_version ?? 'ninguna'}.`);
  if (previous.status !== current.status) changes.push(current.status === 'retired' ? 'La plantilla fue retirada.' : 'Cambió el estado de la plantilla.');
  if (previous.name !== current.name) changes.push('Cambió el nombre.');
  if (previous.description !== current.description) changes.push('Cambió la descripción.');
  if (previous.activities.length !== current.activities.length) changes.push(`Las actividades pasaron de ${previous.activities.length} a ${current.activities.length}.`);
  const oldActivities = draftFromTemplate(previous).activities;
  const newActivities = draftFromTemplate(current).activities;
  for (let index = 0; index < Math.min(oldActivities.length, newActivities.length); index++) {
    if (JSON.stringify(oldActivities[index]) !== JSON.stringify(newActivities[index])) {
      changes.push(`Cambió la actividad ${index + 1}: ${newActivities[index].title}.`);
    }
  }
  return changes.length ? changes : ['La plantilla cambió en el servidor. Revisá la versión actual.'];
}

function positiveInteger(value: string, max: number): number | null {
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed <= max ? parsed : null;
}

export function validateTemplateDraft(draft: TemplateDraft): EditorErrors {
  const errors: EditorErrors = {};
  const name = draft.name.trim();
  if (!name) errors['name'] = 'Ingresá un nombre para la plantilla.';
  else if (name.length > 160) errors['name'] = 'El nombre no puede superar 160 caracteres.';
  if (draft.description.trim().length > 5000) errors['description'] = 'La descripción no puede superar 5000 caracteres.';
  if (draft.activities.length < 1 || draft.activities.length > 100) errors['activities'] = 'La plantilla debe tener entre 1 y 100 actividades.';

  draft.activities.forEach((activity, index) => {
    const field = (key: string) => `activities.${index}.${key}`;
    if (!activity.type) errors[field('type')] = 'Seleccioná el tipo de actividad.';
    const title = activity.title.trim();
    if (!title) errors[field('title')] = 'Ingresá un título.';
    else if (title.length > 200) errors[field('title')] = 'El título no puede superar 200 caracteres.';
    if (!activity.timingKind) errors[field('timing_kind')] = 'Seleccioná el momento previsto.';
    if (activity.type === 'ration_change' && activity.timingKind && !['week', 'week_range'].includes(activity.timingKind)) {
      errors[field('timing_kind')] = 'El cambio de ración requiere una semana o un tramo de semanas.';
    }

    const day = activity.startDay ? positiveInteger(activity.startDay, 100000) : null;
    const week = activity.startWeek ? positiveInteger(activity.startWeek, 10000) : null;
    if (activity.timingKind === 'day' || activity.timingKind === 'day_recurrence') {
      if (day === null) errors[field('start_day')] = 'Ingresá un día válido entre 1 y 100000.';
    }
    if (activity.timingKind === 'week' || activity.timingKind === 'week_range') {
      if (week === null) errors[field('start_week')] = 'Ingresá una semana válida entre 1 y 10000.';
    }
    if (activity.timingKind === 'week_range' && activity.endWeek.trim()) {
      const end = positiveInteger(activity.endWeek, 10000);
      if (end === null || (week !== null && end < week)) errors[field('end_week')] = 'La semana final debe ser igual o posterior a la inicial.';
    }
    if (activity.timingKind === 'day_recurrence') {
      if (positiveInteger(activity.intervalDays, 100000) === null) errors[field('interval_days')] = 'Ingresá un intervalo válido en días.';
      if (activity.recurrenceEnd === 'day') {
        const end = positiveInteger(activity.endDay, 100000);
        if (end === null || (day !== null && end < day)) errors[field('end_day')] = 'El día final debe ser igual o posterior al inicial.';
      } else {
        const end = positiveInteger(activity.endWeek, 10000);
        if (end === null || (day !== null && end * 7 < day)) errors[field('end_week')] = 'La semana final debe incluir o seguir al día inicial.';
      }
    }
    if (activity.conditional && !activity.condition.trim()) errors[field('condition')] = 'Describí la condición de esta actividad.';
    else if (activity.condition.trim().length > 1000) errors[field('condition')] = 'La condición no puede superar 1000 caracteres.';
    if (activity.notes.trim().length > 5000) errors[field('notes')] = 'Las notas no pueden superar 5000 caracteres.';
    if (activity.catalogRef && activity.type === 'ration_change' && positiveInteger(activity.catalogRef, Number.MAX_SAFE_INTEGER) === null) {
      errors[field('catalog_ref')] = 'Seleccioná un producto válido.';
    }
  });
  return errors;
}

export function createTemplateRequest(draft: TemplateDraft): CreatePlanTemplateRequest {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    activities: draft.activities.map((activity): PlanActivityInput => ({
      type: activity.type as PlanActivityType,
      title: activity.title.trim(),
      timing_kind: activity.timingKind as PlanTimingKind,
      start_day: ['day', 'day_recurrence'].includes(activity.timingKind) ? Number(activity.startDay) : null,
      end_day: activity.timingKind === 'day_recurrence' && activity.recurrenceEnd === 'day' ? Number(activity.endDay) : null,
      start_week: ['week', 'week_range'].includes(activity.timingKind) ? Number(activity.startWeek) : null,
      end_week: (activity.timingKind === 'week_range' || (activity.timingKind === 'day_recurrence' && activity.recurrenceEnd === 'week')) && activity.endWeek.trim() ? Number(activity.endWeek) : null,
      interval_days: activity.timingKind === 'day_recurrence' ? Number(activity.intervalDays) : null,
      conditional: activity.conditional,
      condition: activity.conditional ? activity.condition.trim() : null,
      notes: activity.notes.trim() || null,
      catalog_ref: activity.catalogRef ? (activity.type === 'ration_change' ? Number(activity.catalogRef) : activity.catalogRef) : null,
    })),
  };
}

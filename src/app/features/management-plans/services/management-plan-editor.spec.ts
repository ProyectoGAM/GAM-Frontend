import { PlanTemplate } from '../interfaces/management-plan';
import { ActivityDraft, createTemplateRequest, describeTemplateChanges, draftFromTemplate, emptyActivity, validateTemplateDraft } from './management-plan-editor';

const activity = (id: number, patch: Partial<ActivityDraft>): ActivityDraft => ({ ...emptyActivity(id), ...patch });

describe('Management plan template editor', () => {
  it('keeps activity order and sends only the fields for each timing kind', () => {
    const draft = {
      name: '  Ponedora estándar  ', description: '  Manejo previsto  ',
      activities: [
        activity(7, { type: 'ration_change', title: '  Adaptación  ', timingKind: 'week_range', startWeek: '1', endWeek: '', catalogRef: '42', gramsPerBird: '20' }),
        activity(3, { type: 'weighing', title: 'Control', timingKind: 'day_recurrence', startDay: '14', intervalDays: '7', recurrenceEnd: 'week', endWeek: '8', conditional: true, condition: '  Si corresponde  ' }),
        activity(9, { type: 'manual_practice', title: 'Observación', timingKind: 'unscheduled' }),
      ],
    };

    expect(validateTemplateDraft(draft)).toEqual({});
    const request = createTemplateRequest(draft);
    expect(request.name).toBe('Ponedora estándar');
    expect(request.description).toBe('Manejo previsto');
    expect(request.activities.map((item) => item.title)).toEqual(['Adaptación', 'Control', 'Observación']);
    expect(request.activities[0]).toMatchObject({ timing_kind: 'week_range', start_week: 1, end_week: null, start_day: null, catalog_ref: 42, grams_per_bird: 20 });
    expect(request.activities[1]).toMatchObject({ timing_kind: 'day_recurrence', start_day: 14, end_day: null, end_week: 8, interval_days: 7, conditional: true, condition: 'Si corresponde' });
    expect(request.activities[2]).toMatchObject({ timing_kind: 'unscheduled', start_day: null, start_week: null, end_week: null });
    expect(request.activities[1]).not.toHaveProperty('grams_per_bird');
    expect(request.activities[2]).not.toHaveProperty('grams_per_bird');
  });

  it('rejects inconsistent timing, missing condition and out-of-range activity count', () => {
    const draft = {
      name: 'Plan', description: '', activities: [
        activity(1, { type: 'ration_change', title: 'Ración', timingKind: 'unscheduled', conditional: true }),
        activity(2, { type: 'weighing', title: 'Peso', timingKind: 'day_recurrence', startDay: '15', intervalDays: '0', endDay: '14' }),
        activity(3, { type: 'manual_practice', title: 'Revisión', timingKind: 'week_range', startWeek: '9', endWeek: '8' }),
      ],
    };

    const errors = validateTemplateDraft(draft);
    expect(errors['activities.0.timing_kind']).toContain('semana');
    expect(errors['activities.0.condition']).toContain('condición');
    expect(errors['activities.1.interval_days']).toBeTruthy();
    expect(errors['activities.1.end_day']).toBeTruthy();
    expect(errors['activities.2.end_week']).toBeTruthy();
    expect(validateTemplateDraft({ ...draft, activities: [] })['activities']).toBeTruthy();
    expect(validateTemplateDraft({ ...draft, activities: Array.from({ length: 101 }, (_, index) => emptyActivity(index)) })['activities']).toBeTruthy();
  });

  it.each(['', '0', '-1', '1.5', '1e3', '1000000000000', 'abc'])('rejects invalid grams per bird (%s)', (gramsPerBird) => {
    const errors = validateTemplateDraft({ name: 'Plan', description: '', activities: [
      activity(1, { type: 'ration_change', title: 'BB', timingKind: 'day', startDay: '1', catalogRef: '42', gramsPerBird }),
    ] });
    expect(errors['activities.0.grams_per_bird']).toBeTruthy();
  });

  it.each(['1', '999999999999'])('supports the exact integer limits and day-based rations (%s)', (gramsPerBird) => {
    const draft = { name: 'Plan', description: '', activities: [
      activity(1, { type: 'ration_change', title: 'BB', timingKind: 'day', startDay: '1', catalogRef: '42', gramsPerBird }),
    ] };
    expect(validateTemplateDraft(draft)).toEqual({});
    expect(createTemplateRequest(draft).activities[0]).toMatchObject({ catalog_ref: 42, grams_per_bird: Number(gramsPerBird), start_day: 1 });
  });

  it('requires a recipe and rejects a conditional ration', () => {
    const errors = validateTemplateDraft({ name: 'Plan', description: '', activities: [
      activity(1, { type: 'ration_change', title: 'BB', timingKind: 'week', startWeek: '1', gramsPerBird: '20', conditional: true, condition: 'Si corresponde' }),
    ] });
    expect(errors['activities.0.catalog_ref']).toContain('receta');
    expect(errors['activities.0.conditional']).toContain('no puede');
  });

  it('loads stable recipe IDs and quantities without mistaking a legacy product ID for a recipe', () => {
    const template: PlanTemplate = { id: 'template', name: 'Plan', description: null, status: 'active',
      current_version: 1, published_version: null, version_status: 'draft', activities: [{
        id: 'a', type: 'ration_change', title: 'BB', timing_kind: 'week', start_week: 1,
        start_day: null, end_day: null, end_week: null, interval_days: null, conditional: false, condition: null,
        notes: null, catalog_type: 'feed_recipe', catalog_snapshot: { id: 999, name: 'BB' }, feed_recipe_id: 42, grams_per_bird: 20,
      }] };
    expect(draftFromTemplate(template).activities[0]).toMatchObject({ catalogRef: '42', gramsPerBird: '20' });
    expect(draftFromTemplate({ ...template, activities: [{ ...template.activities[0], catalog_type: 'product', feed_recipe_id: null, grams_per_bird: null }] }).activities[0])
      .toMatchObject({ catalogRef: '', gramsPerBird: '' });
    expect(describeTemplateChanges(template, { ...template, activities: [{ ...template.activities[0], grams_per_bird: 25 }] }))
      .toContain('Cambió la actividad 1: BB.');
  });

  it('loads the current version for editing, including its catalogue snapshot, and explains a later change', () => {
    const previous: PlanTemplate = {
      id: 'template', name: 'Plan base', description: 'Inicio', status: 'active', current_version: 1,
      published_version: 1, version_status: 'published', activities: [{
        id: 'activity', type: 'vaccination', title: 'Vacuna inicial', timing_kind: 'day',
        start_day: 1, end_day: null, start_week: null, end_week: null, interval_days: null,
        conditional: false, condition: null, notes: null, catalog_type: 'vaccine',
        catalog_snapshot: { id: 'vaccine-id', name: 'Vacuna A' },
      }],
    };
    expect(draftFromTemplate(previous).activities[0]).toMatchObject({
      timingKind: 'day', startDay: '1', catalogRef: 'vaccine-id', title: 'Vacuna inicial',
    });

    const latest: PlanTemplate = {
      ...previous, current_version: 2, version_status: 'draft', name: 'Plan actualizado',
      activities: [{ ...previous.activities[0], title: 'Vacuna revisada' }],
    };
    expect(describeTemplateChanges(previous, latest)).toEqual([
      'La versión actual pasó de 1 a 2.', 'Cambió el nombre.', 'Cambió la actividad 1: Vacuna revisada.',
    ]);
  });
});

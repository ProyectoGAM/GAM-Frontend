import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { PlanActivityType, PlanCatalogOption, PlanCatalogType, PlanTemplate, PlanTimingKind } from '../interfaces/management-plan';
import { ActivityDraft, EditorErrors, createTemplateRequest, describeTemplateChanges, draftFromTemplate, emptyActivity, validateTemplateDraft } from '../services/management-plan-editor';
import { ManagementPlansService } from '../services/management-plans.service';

const TEMPLATES_PATH = '/administracion/manejo-lotes/planes/plantillas';
type CatalogState = 'idle' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-template-create',
  imports: [RouterLink],
  templateUrl: './template-create.page.html',
})
export class TemplateCreatePage {
  private readonly service = inject(ManagementPlansService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly templateId = this.route.snapshot.paramMap.get('id');
  readonly editing = this.templateId !== null;
  private sourceTemplate: PlanTemplate | null = null;
  private nextActivityId = 2;
  private requestSignature: string | null = null;
  private requestKey: string | null = null;

  readonly name = signal('');
  readonly description = signal('');
  readonly activities = signal<ActivityDraft[]>([emptyActivity(1)]);
  readonly expandedId = signal<number | null>(1);
  readonly errors = signal<EditorErrors>({});
  readonly submitError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly loadState = signal<'loading' | 'ready' | 'error'>(this.editing ? 'loading' : 'ready');
  readonly latestTemplate = signal<PlanTemplate | null>(null);
  readonly conflictChanges = signal<string[]>([]);
  readonly catalogOptions = signal<Record<PlanCatalogType, PlanCatalogOption[]>>({ vaccination: [], medication: [], ration_change: [] });
  readonly catalogState = signal<Record<PlanCatalogType, CatalogState>>({ vaccination: 'idle', medication: 'idle', ration_change: 'idle' });

  constructor() {
    if (this.editing) void this.loadForEdit();
  }

  detailPath(): string { return this.templateId ? `${TEMPLATES_PATH}/${this.templateId}` : TEMPLATES_PATH; }
  sourceRetired(): boolean { return this.sourceTemplate?.status === 'retired'; }

  async loadForEdit(): Promise<void> {
    if (!this.templateId) return;
    this.loadState.set('loading');
    try {
      const summary = (await firstValueFrom(this.service.template(this.templateId))).data;
      const current = (await firstValueFrom(this.service.template(this.templateId, summary.current_version))).data;
      this.sourceTemplate = current;
      this.applyTemplate(current);
      this.latestTemplate.set(null);
      this.conflictChanges.set([]);
      this.submitError.set(null);
      this.loadState.set('ready');
    } catch {
      this.loadState.set('error');
    }
  }

  useLatestTemplate(): void {
    const latest = this.latestTemplate();
    if (!latest || latest.status === 'retired') return;
    this.sourceTemplate = latest;
    this.applyTemplate(latest);
    this.latestTemplate.set(null);
    this.conflictChanges.set([]);
    this.clearFeedback();
  }

  private applyTemplate(template: PlanTemplate): void {
    const draft = draftFromTemplate(template);
    this.name.set(draft.name);
    this.description.set(draft.description);
    this.activities.set(draft.activities);
    this.nextActivityId = draft.activities.length + 1;
    this.expandedId.set(draft.activities[0]?.clientId ?? null);
    for (const activity of template.activities) {
      if (this.hasCatalog(activity.type as PlanActivityType)) {
        const type = activity.type as PlanCatalogType;
        const reference = activity.catalog_snapshot?.['id'];
        const name = activity.catalog_snapshot?.['name'];
        if ((typeof reference === 'string' || typeof reference === 'number') && typeof name === 'string') {
          const option = { value: String(reference), label: `${name} (referencia de esta versión)` };
          this.catalogOptions.update((all) => ({ ...all, [type]: [...all[type].filter((item) => item.value !== option.value), option] }));
        }
        void this.loadCatalog(type);
      }
    }
  }

  readonly activityTypes: readonly { value: PlanActivityType; label: string }[] = [
    { value: 'vaccination', label: 'Vacunación' },
    { value: 'medication', label: 'Medicación' },
    { value: 'ration_change', label: 'Cambio de ración' },
    { value: 'weighing', label: 'Pesaje' },
    { value: 'manual_practice', label: 'Práctica manual' },
    { value: 'flock_movement', label: 'Movimiento del lote' },
    { value: 'egg_collection', label: 'Recolección de huevos' },
    { value: 'mortality', label: 'Mortalidad' },
  ];
  readonly timingKinds: readonly { value: PlanTimingKind; label: string }[] = [
    { value: 'day', label: 'Día' },
    { value: 'week', label: 'Semana' },
    { value: 'week_range', label: 'Tramo de semanas' },
    { value: 'day_recurrence', label: 'Recurrencia en días' },
    { value: 'unscheduled', label: 'Sin fecha prevista' },
  ];

  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
  fieldError(field: string): string | null { return this.errors()[field] ?? null; }
  activityError(index: number, field: string): string | null { return this.fieldError(`activities.${index}.${field}`); }
  hasCatalog(type: ActivityDraft['type']): type is PlanCatalogType {
    return type === 'vaccination' || type === 'medication' || type === 'ration_change';
  }
  catalogLabel(type: ActivityDraft['type']): string {
    return type === 'vaccination' ? 'Vacuna de catálogo' : type === 'medication' ? 'Medicamento de catálogo' : 'Producto de catálogo';
  }
  optionsFor(type: ActivityDraft['type']): PlanCatalogOption[] { return this.hasCatalog(type) ? this.catalogOptions()[type] : []; }
  catalogStateFor(type: ActivityDraft['type']): CatalogState { return this.hasCatalog(type) ? this.catalogState()[type] : 'idle'; }
  timingSummary(activity: ActivityDraft): string {
    switch (activity.timingKind) {
      case 'day': return activity.startDay ? `Día ${activity.startDay}` : 'Día sin definir';
      case 'week': return activity.startWeek ? `Semana ${activity.startWeek}` : 'Semana sin definir';
      case 'week_range': return activity.startWeek ? `Desde semana ${activity.startWeek}${activity.endWeek ? ` hasta ${activity.endWeek}` : ' hasta fin de ciclo'}` : 'Tramo sin definir';
      case 'day_recurrence': return activity.startDay && activity.intervalDays ? `Cada ${activity.intervalDays} días desde día ${activity.startDay}` : 'Recurrencia sin definir';
      case 'unscheduled': return 'Sin fecha prevista';
      default: return 'Momento sin definir';
    }
  }

  setName(event: Event): void { this.name.set(this.inputValue(event)); this.clearFeedback(); }
  setDescription(event: Event): void { this.description.set(this.inputValue(event)); this.clearFeedback(); }

  patchActivity(clientId: number, patch: Partial<ActivityDraft>): void {
    this.activities.update((items) => items.map((item) => item.clientId === clientId ? { ...item, ...patch } : item));
    this.clearFeedback();
  }

  changeType(clientId: number, event: Event): void {
    const type = this.inputValue(event) as PlanActivityType | '';
    const activity = this.activities().find((item) => item.clientId === clientId);
    const timingKind = type === 'ration_change' && activity?.timingKind !== 'week' && activity?.timingKind !== 'week_range'
      ? 'week_range' : activity?.timingKind ?? '';
    this.patchActivity(clientId, { type, timingKind, catalogRef: '' });
    if (this.hasCatalog(type)) void this.loadCatalog(type);
  }

  changeTiming(clientId: number, event: Event): void {
    this.patchActivity(clientId, {
      timingKind: this.inputValue(event) as PlanTimingKind | '',
      startDay: '', endDay: '', startWeek: '', endWeek: '', intervalDays: '', recurrenceEnd: 'day',
    });
  }

  changeRecurrenceEnd(clientId: number, event: Event): void {
    const recurrenceEnd = this.inputValue(event) as 'day' | 'week';
    this.patchActivity(clientId, { recurrenceEnd, endDay: '', endWeek: '' });
  }

  addActivity(): void {
    if (this.activities().length >= 100) return;
    const activity = emptyActivity(this.nextActivityId++);
    this.activities.update((items) => [...items, activity]);
    this.expandedId.set(activity.clientId);
    this.clearFeedback();
  }

  removeActivity(clientId: number): void {
    if (this.activities().length <= 1) return;
    this.activities.update((items) => items.filter((item) => item.clientId !== clientId));
    if (this.expandedId() === clientId) this.expandedId.set(this.activities()[0].clientId);
    this.clearFeedback();
  }

  moveActivity(clientId: number, direction: -1 | 1): void {
    const items = [...this.activities()];
    const index = items.findIndex((item) => item.clientId === clientId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    this.activities.set(items);
    this.clearFeedback();
  }

  async submit(): Promise<void> {
    if (this.saving() || this.latestTemplate() || (this.editing && (this.loadState() !== 'ready' || this.sourceTemplate?.status !== 'active'))) return;
    const draft = { name: this.name(), description: this.description(), activities: this.activities() };
    const errors = validateTemplateDraft(draft);
    this.errors.set(errors);
    if (Object.keys(errors).length) {
      this.submitError.set('Revisá los campos señalados antes de crear el borrador.');
      this.expandFirstActivityError(errors);
      return;
    }

    const request = createTemplateRequest(draft);
    const expectedVersion = this.sourceTemplate?.current_version;
    const signature = JSON.stringify({ request, expectedVersion });
    if (signature !== this.requestSignature || !this.requestKey) {
      this.requestSignature = signature;
      this.requestKey = globalThis.crypto.randomUUID();
    }
    this.submitError.set(null);
    this.saving.set(true);
    try {
      if (this.editing && (!this.templateId || !expectedVersion)) return;
      const result = await firstValueFrom(this.editing && this.templateId && expectedVersion
        ? this.service.reviseTemplate(this.templateId, { ...request, expected_version: expectedVersion }, this.requestKey)
        : this.service.createTemplate(request, this.requestKey));
      await this.router.navigate([TEMPLATES_PATH, result.data.id], { queryParams: { version: result.data.current_version } });
    } catch (error) {
      if (this.editing && error instanceof HttpErrorResponse && error.status === 409) await this.loadConflict(error);
      else this.handleSubmitError(error);
    } finally {
      this.saving.set(false);
    }
  }

  private async loadConflict(error: HttpErrorResponse): Promise<void> {
    if (!this.templateId) return;
    try {
      const summary = (await firstValueFrom(this.service.template(this.templateId))).data;
      const latest = (await firstValueFrom(this.service.template(this.templateId, summary.current_version))).data;
      if (this.sourceTemplate?.current_version === latest.current_version
        && this.sourceTemplate.status === latest.status
        && this.sourceTemplate.published_version === latest.published_version
        && JSON.stringify(draftFromTemplate(this.sourceTemplate)) === JSON.stringify(draftFromTemplate(latest))) {
        this.handleSubmitError(error);
        return;
      }
      this.conflictChanges.set(this.sourceTemplate ? describeTemplateChanges(this.sourceTemplate, latest) : ['La plantilla cambió.']);
      this.latestTemplate.set(latest);
      this.submitError.set('La plantilla cambió mientras editabas. Tus datos siguen en pantalla; revisá los cambios antes de volver a guardar.');
    } catch {
      this.submitError.set('La plantilla cambió, pero no se pudo cargar la versión actual. Volvé al detalle y reabrí el editor.');
    }
  }

  private async loadCatalog(type: PlanCatalogType): Promise<void> {
    if (this.catalogState()[type] !== 'idle') return;
    this.catalogState.update((states) => ({ ...states, [type]: 'loading' }));
    try {
      const options = await this.service.catalogOptions(type);
      this.catalogOptions.update((all) => ({ ...all, [type]: [...options, ...all[type].filter((item) => !options.some((option) => option.value === item.value))] }));
      this.catalogState.update((states) => ({ ...states, [type]: 'ready' }));
    } catch {
      this.catalogState.update((states) => ({ ...states, [type]: 'error' }));
    }
  }

  private clearFeedback(): void { this.errors.set({}); if (!this.latestTemplate()) this.submitError.set(null); }

  private expandFirstActivityError(errors: EditorErrors): void {
    const match = Object.keys(errors).find((field) => field.startsWith('activities.'))?.match(/^activities\.(\d+)\./);
    if (match) this.expandedId.set(this.activities()[Number(match[1])]?.clientId ?? null);
  }

  private handleSubmitError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      this.submitError.set('No se pudo crear el borrador. Intentá nuevamente.');
      return;
    }
    if (error.status === 422) {
      const problem: unknown = error.error;
      if (typeof problem === 'object' && problem !== null && 'errors' in problem && typeof problem.errors === 'object' && problem.errors !== null) {
        const errors: EditorErrors = {};
        for (const [field, value] of Object.entries(problem.errors)) {
          const message = Array.isArray(value) ? value.find((item): item is string => typeof item === 'string') : null;
          if (message) errors[field] = message;
        }
        this.errors.set(errors);
        this.expandFirstActivityError(errors);
      }
      this.submitError.set('Revisá los campos señalados e intentá nuevamente.');
    } else if (error.status === 409) {
      const problem: unknown = error.error;
      const detail = typeof problem === 'object' && problem !== null && 'detail' in problem && typeof problem.detail === 'string' ? problem.detail : null;
      this.submitError.set(detail ?? 'La plantilla no pudo crearse por un conflicto. Revisá los datos e intentá nuevamente.');
    } else if (error.status === 401 || error.status === 403) {
      this.submitError.set('Tu sesión no tiene permiso para crear plantillas.');
    } else if (error.status === 0) {
      this.submitError.set('Sin conexión. Revisá tu conexión e intentá nuevamente.');
    } else {
      this.submitError.set('No se pudo crear el borrador. Intentá nuevamente.');
    }
  }
}

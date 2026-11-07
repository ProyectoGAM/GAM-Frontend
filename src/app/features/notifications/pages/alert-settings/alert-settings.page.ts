import { afterNextRender, Component, computed, ElementRef, inject, Injector, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { businessOutline, clipboardOutline, eggOutline } from 'ionicons/icons';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { AlertEditorDialogComponent } from '../../components/alert-editor-dialog/alert-editor-dialog.component';
import { OperationalAlertSettingsComponent } from '../../components/operational-alert-settings/operational-alert-settings.component';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { AlertRule, AlertSettingsResult, AlertThresholdField, AlertThresholds } from '../../interfaces/alert-settings';
import { alertModules, describeThresholds, readThresholds, thresholdFields, usesDayCount } from '../../services/alert-settings-form';
import { AlertSettingsService, alertSettingsError } from '../../services/alert-settings.service';
import { AlertRuleId } from '../../types/alert-settings.type';

interface AlertSettingsLoad {
  unitId: number | null;
  result: ReadonlyMap<AlertRuleId, AlertSettingsResult> | null;
}

interface AlertEditor {
  rule: AlertRule;
  scope: string;
  fields: readonly AlertThresholdField[];
  error: string;
}

@Component({
  selector: 'app-alert-settings-page',
  imports: [IonButton, IonIcon, AlertEditorDialogComponent, OperationalAlertSettingsComponent],
  templateUrl: './alert-settings.page.html',
  styleUrl: './alert-settings.page.scss',
})
export class AlertSettingsPage {
  protected readonly units = inject(AdminUnitContextService);
  private readonly auth = inject(AuthStore);
  private readonly settings = inject(AlertSettingsService);
  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly unitId = computed(() => this.units.state() === 'ready' ? this.units.selectedUnit()?.id ?? null : null);
  protected readonly canListUnits = computed(() =>
    this.auth.isAdmin() || this.auth.user()?.permissions.includes('can_view_production_units') === true);
  private readonly retry = signal(0);
  private readonly query = computed(() => ({ unitId: this.unitId(), retry: this.retry() }));
  private readonly ruleIds = alertModules.flatMap(({ rules }) => rules.map(({ id }) => id));
  private readonly loaded = toSignal(toObservable(this.query).pipe(
    switchMap(({ unitId }) => {
      const empty: AlertSettingsLoad = { unitId, result: null };
      if (unitId === null) return of(empty);
      return this.settings.load(unitId, this.ruleIds).pipe(
        map((result): AlertSettingsLoad => ({ unitId, result })),
        startWith(empty),
      );
    }),
  ), { initialValue: { unitId: null, result: null } as AlertSettingsLoad });
  private readonly data = linkedSignal(() => this.loaded());
  protected readonly result = computed(() => {
    const data = this.data();
    return data.unitId === this.unitId() ? data.result : null;
  });
  protected readonly modules = computed(() => {
    const result = this.result();
    return alertModules.map((module) => ({
      ...module,
      rules: module.rules.map((rule) => {
        const item = result?.get(rule.id);
        return { ...rule, levels: item?.thresholds ? describeThresholds(rule.kind, item.thresholds) : [], error: item?.error };
      }),
    }));
  });
  protected readonly hasErrors = computed(() => [...(this.result()?.values() ?? [])].some(({ error }) => !!error));

  protected readonly editor = linkedSignal<number | null, AlertEditor | null>({
    source: this.unitId,
    computation: () => null,
  });
  protected readonly saved = linkedSignal<number | null, AlertRuleId | null>({
    source: this.unitId,
    computation: () => null,
  });
  protected readonly saving = signal(false);
  protected readonly usesDayCount = usesDayCount;
  private readonly saveRequests = new Subject<{ unitId: number; editor: AlertEditor; thresholds: AlertThresholds }>();

  constructor() {
    addIcons({ 'business-outline': businessOutline, 'clipboard-outline': clipboardOutline, 'egg-outline': eggOutline });
    this.saveRequests.pipe(
      switchMap(({ unitId, editor, thresholds }) => this.settings.save(unitId, editor.rule.id, thresholds).pipe(
        map((saved) => ({ unitId, editor, saved })),
        catchError((error: unknown) => of({ unitId, editor, error: alertSettingsError(error, 'No se pudieron guardar los cambios. Volvé a intentar.') })),
      )),
      takeUntilDestroyed(),
    ).subscribe((result) => {
      this.saving.set(false);
      if (this.unitId() !== result.unitId) return;
      const id = result.editor.rule.id;
      if ('error' in result) {
        if (this.editor() === result.editor) this.editor.set({ ...result.editor, error: result.error });
        return;
      }

      const current = this.result();
      if (current) {
        this.data.set({ unitId: result.unitId, result: new Map(current).set(id, { thresholds: result.saved, error: '' }) });
      } else {
        this.reload();
      }
      this.saved.set(id);
      if (this.editor() === result.editor) this.closeEditor();
    });
  }

  protected selectUnit(value: string): void {
    this.units.select(value ? Number(value) : null);
  }

  protected reload(): void {
    this.retry.update((retry) => retry + 1);
  }

  protected edit(rule: AlertRule, moduleTitle: string): void {
    const unit = this.units.selectedUnit();
    const values = this.result()?.get(rule.id)?.thresholds;
    if (!unit || !values || this.saving()) return;
    this.saved.set(null);
    this.editor.set({
      rule,
      scope: `${unit.name} · ${moduleTitle}`,
      fields: thresholdFields(rule.kind, values),
      error: '',
    });
  }

  protected setMoment(field: AlertThresholdField, value: string): void {
    const option = field.options.find(({ value: optionValue }) => optionValue === value);
    if (option) this.updateField({ ...field, moment: option.value });
  }

  protected setDays(field: AlertThresholdField, value: number): void {
    this.updateField({ ...field, days: Number.isNaN(value) ? null : value });
  }

  protected closeEditor(): void {
    if (this.saving()) return;
    const id = this.editor()?.rule.id;
    this.editor.set(null);
    if (id) this.focusAfterRender(`#edit-${id}`);
  }

  protected save(event: Event): void {
    event.preventDefault();
    const unitId = this.unitId();
    const editor = this.editor();
    if (unitId === null || !editor || this.saving()) return;
    const thresholds = readThresholds(editor.rule.kind, editor.fields);
    if (typeof thresholds === 'string') {
      this.editor.set({ ...editor, error: thresholds });
      return;
    }
    this.saving.set(true);
    this.saveRequests.next({ unitId, editor, thresholds });
  }

  private updateField(field: AlertThresholdField): void {
    if (this.saving()) return;
    this.editor.update((editor) => editor && {
      ...editor,
      error: '',
      fields: editor.fields.map((current) => current.level === field.level ? field : current),
    });
  }

  private focusAfterRender(selector: string): void {
    afterNextRender({
      write: () => this.element.nativeElement.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }),
    }, { injector: this.injector });
  }
}

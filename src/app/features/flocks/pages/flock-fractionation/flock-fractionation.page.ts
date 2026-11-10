import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, DestroyRef, ElementRef, HostListener, Injector, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AlertController, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, informationCircleOutline, warningOutline } from 'ionicons/icons';
import { map } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { SearchableSelectComponent } from '../../../../shared/ui/searchable-select/searchable-select.component';
import { FractionationContext, FractionationDraft, FractionationRequest, FractionationResult } from '../../interfaces/flock-fractionation.interface';
import { buildFractionation, FractionationErrors, fractionationQuantity, fractionationTargets, validateFractionation } from '../../services/flock-fractionation';
import { FlockFractionationService } from '../../services/flock-fractionation.service';

type LoadState = 'loading' | 'ready' | 'offline' | 'forbidden' | 'not-found' | 'error';

@Component({
  selector: 'app-flock-fractionation',
  imports: [ReactiveFormsModule, RouterLink, IonIcon, IonSpinner, SearchableSelectComponent],
  templateUrl: './flock-fractionation.page.html',
  styleUrl: './flock-fractionation.page.scss',
})
export class FlockFractionationPage {
  private readonly api = inject(FlockFractionationService);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly alerts = inject(AlertController);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('fractionationForm');
  private readonly routeId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), { initialValue: '' });
  private readonly query = toSignal(this.route.queryParamMap);
  private version = 0;
  private attempt: { body: FractionationRequest; fingerprint: string; key: string } | null = null;
  private leavePromise: Promise<boolean> | null = null;
  readonly state = signal<LoadState>('loading');
  readonly context = signal<FractionationContext | null>(null);
  readonly kind = signal<FractionationDraft['kind']>('partial');
  readonly destination = signal<FractionationDraft['destination']>('empty');
  readonly saving = signal(false);
  readonly uncertain = signal(false);
  readonly result = signal<FractionationResult | null>(null);
  readonly error = signal<string | null>(null);
  readonly errors = signal<FractionationErrors>({});
  readonly canEdit = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('flocks.redistribute') === true);
  readonly locked = computed(() => this.saving() || this.uncertain() || !!this.result() || !this.canEdit());
  readonly form = new FormGroup({
    target: new FormControl('', { nonNullable: true }),
    quantity: new FormControl('', { nonNullable: true }),
    code: new FormControl('', { nonNullable: true }),
    occurredAt: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true }),
  });
  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly draft = computed<FractionationDraft>(() => ({
    kind: this.kind(), destination: this.destination(), target: this.values().target ?? '',
    quantity: this.values().quantity ?? '', code: this.values().code ?? '',
    occurredAt: this.values().occurredAt ?? '', reason: this.values().reason ?? '',
  }));
  readonly targets = computed(() => {
    const context = this.context();
    return context ? fractionationTargets(context, this.destination()) : [];
  });
  readonly selected = computed(() => this.targets().find((target) => target.value === this.draft().target));
  readonly quantity = computed(() => this.context() ? fractionationQuantity(this.draft(), this.context()!) : null);
  readonly validQuantity = computed(() => {
    const count = this.quantity(), source = this.context()?.source;
    return !!source && count !== null && count > 0 && count <= source.current_quantity
      && (this.kind() === 'total' || count < source.current_quantity);
  });
  readonly remaining = computed(() => this.validQuantity() ? this.context()!.source.current_quantity - this.quantity()! : null);
  readonly received = computed(() => this.validQuantity() && this.selected()
    ? (this.selected()!.flock?.current_quantity ?? 0) + this.quantity()! : null);
  readonly finalizes = computed(() => this.kind() === 'total' && this.destination() === 'existing');
  readonly sourceHouse = computed(() => this.context()?.houses.find((house) => house.id === this.context()?.source.poultry_house_id)?.name ?? 'Galpón de origen');
  readonly available = computed(() => this.context()?.source.status !== 'finished' && (this.context()?.source.current_quantity ?? 0) > 0);
  readonly backLink = computed(() => ['/administracion/lotes/lotes', this.routeId()]);
  readonly backQuery = computed(() => {
    const params = this.query(), unitId = params?.get('unitId') ?? '', houseId = params?.get('houseId') ?? '';
    return params?.get('lotFrom') === 'house' && /^[1-9]\d*$/.test(unitId) && /^[1-9]\d*$/.test(houseId)
      && Number.isSafeInteger(Number(unitId)) && Number.isSafeInteger(Number(houseId))
      ? { lotFrom: 'house', unitId, houseId } : {};
  });

  constructor() {
    addIcons({ arrowBackOutline, informationCircleOutline, warningOutline });
    effect(() => {
      const id = this.routeId(), actor = this.auth.user()?.id, allowed = this.canEdit();
      untracked(() => {
        this.version++; this.attempt = null; this.context.set(null); this.result.set(null);
        this.saving.set(false); this.uncertain.set(false); this.error.set(null); this.errors.set({});
        this.kind.set('partial'); this.destination.set('empty'); this.form.reset();
        if (actor === undefined || !allowed) this.state.set('forbidden');
        else if (!id) this.state.set('not-found');
        else this.load();
      });
    });
    effect(() => { if (this.locked()) this.form.disable({ emitEvent: false }); else this.form.enable({ emitEvent: false }); });
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.errors.set({}); this.error.set(null);
    });
  }

  load(): void {
    if (this.locked()) return;
    const version = ++this.version;
    this.state.set('loading'); this.context.set(null); this.attempt = null;
    this.api.load(this.routeId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (context) => {
        if (version !== this.version) return;
        this.context.set(context); this.state.set('ready');
        if (!this.targets().some((target) => target.value === this.form.controls.target.value)) this.form.controls.target.setValue('');
      },
      error: (error: unknown) => {
        if (version !== this.version) return;
        this.state.set(error instanceof HttpErrorResponse
          ? error.status === 0 ? 'offline' : [401, 403].includes(error.status) ? 'forbidden' : error.status === 404 ? 'not-found' : 'error'
          : 'error');
      },
    });
  }

  setKind(kind: FractionationDraft['kind']): void {
    if (this.locked()) return;
    this.kind.set(kind); this.form.markAsDirty(); this.form.controls.code.setValue('');
    if (kind === 'total') this.form.controls.quantity.setValue('');
  }

  setDestination(destination: FractionationDraft['destination']): void {
    if (this.locked()) return;
    this.destination.set(destination); this.form.markAsDirty();
    this.form.controls.target.setValue(''); this.form.controls.code.setValue('');
  }

  submit(): void {
    if (this.saving() || this.result() || !this.canEdit() || !this.available() || this.state() !== 'ready') return;
    const context = this.context();
    if (!context) return;
    if (!this.uncertain()) {
      const errors = validateFractionation(this.draft(), context);
      this.errors.set(errors);
      const body = buildFractionation(this.draft(), context);
      if (!body) { this.error.set('Revisá los campos señalados.'); this.focusError(); return; }
      const fingerprint = JSON.stringify(body);
      if (fingerprint !== this.attempt?.fingerprint) this.attempt = { body, fingerprint, key: crypto.randomUUID() };
    }
    if (!this.attempt) return;
    const version = this.version;
    this.saving.set(true); this.error.set(null);
    this.api.submit(context.source.id, this.attempt.body, this.attempt.key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        if (version !== this.version) return;
        this.saving.set(false); this.uncertain.set(false); this.result.set(result); this.attempt = null; this.form.markAsPristine();
      },
      error: (error: unknown) => { if (version === this.version) this.saveError(error); },
    });
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.auth.user() || this.result()) return true;
    if (this.saving() || this.uncertain()) { this.error.set('Hay un fraccionamiento pendiente de confirmación. Reintentá antes de salir.'); return false; }
    if (!this.form.dirty) return true;
    this.leavePromise ??= this.confirmLeave().finally(() => { this.leavePromise = null; });
    return this.leavePromise;
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.auth.user() && !this.result() && (this.form.dirty || this.saving() || this.uncertain())) { event.preventDefault(); event.returnValue = ''; }
  }

  private async confirmLeave(): Promise<boolean> {
    const dialog = await this.alerts.create({ header: '¿Salir del fraccionamiento?', message: 'Los datos sin guardar se perderán.',
      buttons: [{ text: 'Seguir editando', role: 'cancel' }, { text: 'Salir', role: 'confirm' }] });
    await dialog.present();
    return (await dialog.onDidDismiss()).role === 'confirm';
  }

  private saveError(error: unknown): void {
    this.saving.set(false);
    if (!(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500 || (error.status >= 200 && error.status < 300)) {
      this.uncertain.set(true); this.error.set('No pudimos confirmar el resultado. Reintentá con los mismos datos para evitar duplicados.');
    } else {
      this.uncertain.set(false); this.attempt = null;
      const problem: unknown = error.error;
      const detail = problem && typeof problem === 'object' && 'detail' in problem && typeof problem.detail === 'string' ? problem.detail : null;
      this.error.set([401, 403].includes(error.status) ? 'No tenés permiso para fraccionar este lote.'
        : detail ?? (error.status === 409 ? 'El lote o su destino cambió. Actualizá los destinos y revisá el resumen.' : 'No se pudo registrar el fraccionamiento. Revisá los datos.'));
      if (error.status === 422 && problem && typeof problem === 'object' && 'errors' in problem && problem.errors && typeof problem.errors === 'object') {
        const fields: Record<string, keyof FractionationErrors> = { quantity: 'quantity', destination_code: 'code', destination_poultry_house_id: 'target', destination_flock_id: 'target', destination_version: 'target', occurred_at: 'occurredAt', reason: 'reason' };
        const errors: FractionationErrors = {};
        for (const [name, messages] of Object.entries(problem.errors)) if (fields[name] && Array.isArray(messages) && typeof messages[0] === 'string') errors[fields[name]] = messages[0];
        this.errors.set(errors);
      }
    }
    this.focusError();
  }

  private focusError(): void {
    afterNextRender(() => {
      const target = this.formElement()?.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]');
      target?.focus(); target?.scrollIntoView?.({ block: 'center' });
    }, { injector: this.injector });
  }
}

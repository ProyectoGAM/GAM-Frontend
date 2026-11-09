import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, closeOutline, cutOutline } from 'ionicons/icons';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { ManagementPlansService } from '../../../management-plans/services/management-plans.service';
import { BeakTrimmingCommand, BeakTrimmingRow } from '../../interfaces/flock-beak-trimming';
import { Flock } from '../../interfaces/flock.interface';
import { beakTrimmingError, canChangeBeakTrimmings, canViewBeakTrimmings } from '../../services/flock-beak-trimming';
import { FlockDetailService, todayInLotsTimezone } from '../../services/flock-detail.service';
import { FlockHealthService } from '../../services/flock-health.service';
import { healthOccurredAt } from '../../services/flock-health';

interface Scope {
  id: string;
  actor: number | null;
  session: string | null;
  allowed: boolean;
  mayRecord: boolean;
}

interface PageState {
  scope: Scope;
  result: { flock: Flock; rows: BeakTrimmingRow[] } | null;
  error: string;
}

type Editor = { kind: 'record' } | { kind: 'reverse'; row: BeakTrimmingRow };
interface Attempt { scope: Scope; key: string; command: BeakTrimmingCommand }

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Montevideo', hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
});

@Component({
  selector: 'app-flock-beak-trimmings',
  imports: [RouterLink, ReactiveFormsModule, IonIcon],
  templateUrl: './flock-beak-trimmings.page.html',
  styleUrl: './flock-beak-trimmings.page.scss',
})
export class FlockBeakTrimmingsPage {
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly detail = inject(FlockDetailService);
  private readonly health = inject(FlockHealthService);
  private readonly plans = inject(ManagementPlansService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');
  private readonly params = toSignal(this.route.paramMap);
  private readonly queryParams = toSignal(this.route.queryParamMap);
  private readonly scope = computed<Scope>(() => {
    const user = this.auth.user();
    return {
      id: this.params()?.get('id') ?? '',
      actor: user?.id ?? null,
      session: this.auth.session()?.id ?? null,
      allowed: canViewBeakTrimmings(user),
      mayRecord: canChangeBeakTrimmings(user, 'record'),
    };
  });
  protected readonly backLink = computed(() => ['/administracion/lotes/lotes', this.scope().id]);
  protected readonly backQuery = computed(() => {
    const params = this.queryParams();
    return params?.get('lotFrom') === 'house'
      ? { lotFrom: 'house', unitId: params.get('unitId'), houseId: params.get('houseId') } : null;
  });
  private readonly revision = signal(0);
  private readonly query = computed(() => ({ scope: this.scope(), revision: this.revision() }));
  private readonly loaded = toSignal(toObservable(this.query).pipe(
    switchMap(({ scope }) => {
      const waiting: PageState = { scope, result: null, error: '' };
      if (!scope.allowed) return of({ ...waiting, error: 'Tu cuenta no tiene permiso para consultar los despiques.' });
      if (!scope.id) return of({ ...waiting, error: 'El lote solicitado no está disponible.' });
      return forkJoin({ flock: this.detail.flock(scope.id), rows: this.health.beakTrimmingHistory(scope.id) }).pipe(
        map((result): PageState => ({ scope, result, error: '' })),
        startWith(waiting),
        catchError((error: unknown) => of({ ...waiting, error: beakTrimmingError(error, 'No se pudo cargar el historial de despiques.') })),
      );
    }),
  ));
  protected readonly state = computed(() => {
    const loaded = this.loaded();
    return loaded?.scope === this.scope() ? loaded : undefined;
  });
  protected readonly canRecord = computed(() => {
    const flock = this.state()?.result?.flock;
    return !!flock && flock.status !== 'finished' && this.scope().mayRecord;
  });
  protected readonly canReverse = computed(() => canChangeBeakTrimmings(this.auth.user(), 'reverse'));
  protected readonly currentUser = computed(() => this.auth.user()?.name ?? 'Usuario actual');
  protected readonly visible = signal(20);
  protected readonly activities = toSignal(toObservable(this.scope).pipe(
    switchMap((scope) => scope.id && scope.mayRecord ? this.plans.flockPlan(scope.id, true).pipe(
      map(({ data }) => data.revisions.find(({ number }) => number === data.current_revision)?.activities
        .filter(({ type, practice_type }) => type === 'manual_practice' && practice_type === 'beak_trimming') ?? []),
      startWith([]),
      catchError(() => of([])),
    ) : of([])),
  ), { initialValue: [] });

  protected readonly editor = signal<Editor | null>(null);
  protected readonly saving = signal(false);
  protected readonly uncertain = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly today = signal(todayInLotsTimezone());
  protected readonly form = new FormGroup({
    date: new FormControl('', { nonNullable: true }),
    time: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    activity: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true }),
  });
  private attempt: Attempt | null = null;

  constructor() {
    addIcons({ addOutline, arrowBackOutline, closeOutline, cutOutline });
    effect(() => {
      this.scope();
      untracked(() => {
        this.close();
        this.attempt = null;
        this.saving.set(false);
        this.uncertain.set(false);
        this.success.set('');
        this.visible.set(20);
      });
    });
  }

  canLeave(): boolean { return !this.saving() && !this.uncertain(); }

  protected reload(): void { this.revision.update((value) => value + 1); }

  protected openRecord(): void {
    if (!this.canRecord() || !this.canLeave()) return;
    const now = new Date();
    const date = todayInLotsTimezone(now);
    this.today.set(date);
    this.form.reset({ date, time: clock.format(now) });
    this.open({ kind: 'record' });
  }

  protected openReverse(row: BeakTrimmingRow): void {
    if (!this.canReverse() || row.antecedent || row.reversal || !this.canLeave()) return;
    this.form.reset();
    this.open({ kind: 'reverse', row });
  }

  protected cancel(event?: Event): void {
    event?.preventDefault();
    if (this.canLeave()) this.close();
  }

  protected submit(): void {
    if (this.saving()) return;
    const scope = this.scope();
    if (this.uncertain() && this.attempt?.scope === scope) {
      this.send(this.attempt);
      return;
    }
    const editor = this.editor();
    if (!editor) return;
    const command = this.command(editor);
    if (!command) return;
    const attempt = { scope, command, key: globalThis.crypto.randomUUID() };
    this.attempt = attempt;
    this.send(attempt);
  }

  private command(editor: Editor): BeakTrimmingCommand | null {
    const form = this.form.getRawValue();
    if (editor.kind === 'reverse') {
      if (!this.canReverse() || !this.state()?.result?.rows.some((row) => row.id === editor.row.id && !row.antecedent && !row.reversal)) {
        this.error.set('Este registro ya no está disponible para revertir.');
        return null;
      }
      const reason = form.reason.trim();
      if (!reason || reason.length > 500) {
        this.error.set('Ingresá un motivo de hasta 500 caracteres.');
        return null;
      }
      return { kind: 'reverse', id: editor.row.id, body: { reason } };
    }
    if (!this.canRecord()) return null;
    const occurredAt = healthOccurredAt(form.date, form.time);
    const established = this.state()?.result?.flock.established_at;
    if (!occurredAt || Date.parse(occurredAt) > Date.now() || (established && Date.parse(occurredAt) < Date.parse(established))) {
      this.error.set('Ingresá una fecha y hora de la existencia del lote que no sean futuras.');
      return null;
    }
    const notes = form.notes.trim();
    if (notes.length > 5000) {
      this.error.set('Las observaciones admiten hasta 5.000 caracteres.');
      return null;
    }
    if (form.activity && !this.activities().some(({ id }) => id === form.activity)) {
      this.error.set('Seleccioná una actividad del plan vigente o dejá el registro sin vincular.');
      return null;
    }
    return { kind: 'record', body: {
      practice_type: 'beak_trimming', occurred_at: occurredAt,
      ...(notes ? { notes } : {}), ...(form.activity ? { plan_activity_id: form.activity } : {}),
    } };
  }

  private send(attempt: Attempt): void {
    this.saving.set(true);
    this.error.set('');
    this.health.saveBeakTrimming(attempt.scope.id, attempt.command, attempt.key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        if (attempt.scope !== this.scope()) return;
        this.saving.set(false);
        this.uncertain.set(false);
        this.attempt = null;
        this.close();
        this.success.set(attempt.command.kind === 'record' ? 'Despique registrado.' : 'Registro de despique revertido.');
        this.reload();
        afterNextRender({ write: () => this.heading()?.nativeElement.focus({ preventScroll: true }) }, { injector: this.injector });
      },
      error: (error: unknown) => {
        if (attempt.scope !== this.scope()) return;
        this.saving.set(false);
        const uncertain = !(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500;
        this.uncertain.set(uncertain);
        if (!uncertain) this.attempt = null;
        this.error.set(uncertain ? 'No se pudo confirmar el guardado. Reintentá con los mismos datos.'
          : beakTrimmingError(error, 'No se pudo guardar la operación.'));
        if (error instanceof HttpErrorResponse && error.status === 409) this.reload();
      },
    });
  }

  private open(editor: Editor): void {
    this.editor.set(editor);
    this.error.set('');
    this.success.set('');
    this.attempt = null;
    afterNextRender({
      write: () => {
        const dialog = this.dialog()?.nativeElement;
        if (dialog && !dialog.open && this.editor() === editor) {
          dialog.showModal();
          dialog.scrollTop = 0;
        }
      },
    }, { injector: this.injector });
  }

  private close(): void {
    const dialog = this.dialog()?.nativeElement;
    if (dialog?.open) dialog.close();
    this.editor.set(null);
  }
}

import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, input, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { ManagementPlansService } from '../../../management-plans/services/management-plans.service';
import { BeakTrimmingCommand, BeakTrimmingRow } from '../../interfaces/flock-beak-trimming';
import { Flock } from '../../interfaces/flock.interface';
import { beakTrimmingError, canChangeBeakTrimmings } from '../../services/flock-beak-trimming';
import { todayInLotsTimezone } from '../../services/flock-detail.service';
import { FlockHealthService } from '../../services/flock-health.service';
import { healthOccurredAt } from '../../services/flock-health';

interface Scope {
  id: string;
  actor: number | null;
  session: string | null;
  mayRecord: boolean;
  mayReverse: boolean;
}

type Editor = { kind: 'record' } | { kind: 'reverse'; row: BeakTrimmingRow };
interface Attempt { scope: Scope; key: string; command: BeakTrimmingCommand }

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Montevideo', hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
});

@Component({
  selector: 'app-beak-trimming-dialog',
  imports: [ReactiveFormsModule, IonIcon],
  templateUrl: './beak-trimming-dialog.component.html',
  styleUrl: './beak-trimming-dialog.component.scss',
})
export class BeakTrimmingDialogComponent {
  readonly flockId = input.required<string>();
  readonly flock = input<Flock | null>(null);
  readonly rows = input<readonly BeakTrimmingRow[]>([]);
  readonly context = input('');
  readonly saved = output<string>();
  readonly cancelled = output<void>();
  readonly conflict = output<void>();
  private readonly auth = inject(AuthStore);
  private readonly health = inject(FlockHealthService);
  private readonly plans = inject(ManagementPlansService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly scope = computed<Scope>(() => {
    const user = this.auth.user();
    return { id: this.flockId(), actor: user?.id ?? null, session: this.auth.session()?.id ?? null,
      mayRecord: canChangeBeakTrimmings(user, 'record'), mayReverse: canChangeBeakTrimmings(user, 'reverse') };
  });
  private readonly canRecord = computed(() => {
    const flock = this.flock();
    const scope = this.scope();
    return flock?.id === scope.id && flock.status !== 'finished' && scope.mayRecord;
  });
  private readonly canReverse = computed(() => this.scope().mayReverse);
  protected readonly currentUser = computed(() => this.auth.user()?.name ?? 'Usuario actual');
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
  protected readonly today = signal(todayInLotsTimezone());
  protected readonly form = new FormGroup({
    date: new FormControl('', { nonNullable: true }),
    time: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    activity: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true }),
  });
  private attempt: Attempt | null = null;
  private editorScope: Scope | null = null;

  constructor() {
    addIcons({ closeOutline });
    effect(() => {
      const scope = this.scope();
      if (this.editorScope && this.editorScope !== scope) untracked(() => {
        this.close(); this.attempt = null; this.saving.set(false); this.uncertain.set(false);
      });
    });
  }

  canLeave(): boolean { return !this.saving() && !this.uncertain(); }

  openRecord(): void {
    if (this.editor() || !this.canRecord() || !this.canLeave()) return;
    const now = new Date();
    const date = todayInLotsTimezone(now);
    this.today.set(date);
    this.form.reset({ date, time: clock.format(now) });
    this.open({ kind: 'record' });
  }

  openReverse(row: BeakTrimmingRow): void {
    if (this.editor() || !this.canReverse() || row.antecedent || row.reversal || !this.canLeave()) return;
    this.form.reset();
    this.open({ kind: 'reverse', row });
  }

  protected cancel(event?: Event): void {
    event?.preventDefault();
    if (this.canLeave()) { this.close(); this.cancelled.emit(); }
  }

  protected submit(): void {
    if (this.saving() || this.editorScope !== this.scope()) return;
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
      if (!this.canReverse() || !this.rows().some((row) => row.id === editor.row.id && !row.antecedent && !row.reversal)) {
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
    const established = this.flock()?.established_at;
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
        this.saved.emit(attempt.command.kind === 'record' ? 'Despique registrado.' : 'Registro de despique revertido.');
      },
      error: (error: unknown) => {
        if (attempt.scope !== this.scope()) return;
        this.saving.set(false);
        const uncertain = !(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500;
        this.uncertain.set(uncertain);
        if (!uncertain) this.attempt = null;
        this.error.set(uncertain ? 'No se pudo confirmar el guardado. Reintentá con los mismos datos.'
          : beakTrimmingError(error, 'No se pudo guardar la operación.'));
        if (error instanceof HttpErrorResponse && error.status === 409) this.conflict.emit();
      },
    });
  }

  private open(editor: Editor): void {
    this.editorScope = this.scope();
    this.editor.set(editor);
    this.error.set('');
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
    this.editorScope = null;
    this.editor.set(null);
  }
}

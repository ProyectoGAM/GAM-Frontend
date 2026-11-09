import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, signal, untracked, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline } from 'ionicons/icons';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { BeakTrimmingDialogComponent } from '../../components/beak-trimming-dialog/beak-trimming-dialog.component';
import { BeakTrimmingRow } from '../../interfaces/flock-beak-trimming';
import { Flock } from '../../interfaces/flock.interface';
import { beakTrimmingError, canChangeBeakTrimmings, canViewBeakTrimmings } from '../../services/flock-beak-trimming';
import { FlockDetailService } from '../../services/flock-detail.service';
import { FlockHealthService } from '../../services/flock-health.service';

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

@Component({
  selector: 'app-flock-beak-trimmings',
  imports: [RouterLink, IonIcon, BeakTrimmingDialogComponent],
  templateUrl: './flock-beak-trimmings.page.html',
  styleUrl: './flock-beak-trimmings.page.scss',
})
export class FlockBeakTrimmingsPage {
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly detail = inject(FlockDetailService);
  private readonly health = inject(FlockHealthService);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild(BeakTrimmingDialogComponent);
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
  protected readonly flockId = computed(() => this.scope().id);
  protected readonly state = computed(() => {
    const loaded = this.loaded();
    return loaded?.scope === this.scope() ? loaded : undefined;
  });
  protected readonly canRecord = computed(() => {
    const flock = this.state()?.result?.flock;
    return !!flock && flock.status !== 'finished' && this.scope().mayRecord;
  });
  protected readonly canReverse = computed(() => canChangeBeakTrimmings(this.auth.user(), 'reverse'));
  protected readonly visible = signal(20);
  protected readonly success = signal('');

  constructor() {
    addIcons({ addOutline, arrowBackOutline });
    effect(() => { this.scope(); untracked(() => { this.success.set(''); this.visible.set(20); }); });
  }

  canLeave(): boolean { return this.dialog()?.canLeave() ?? true; }

  protected reload(): void { this.revision.update((value) => value + 1); }

  protected onSaved(message: string): void {
    this.success.set(message);
    this.reload();
    afterNextRender({ write: () => this.heading()?.nativeElement.focus({ preventScroll: true }) }, { injector: this.injector });
  }
}

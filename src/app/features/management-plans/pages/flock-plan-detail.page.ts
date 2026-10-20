import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlanActivitiesComponent } from '../components/plan-activities.component';
import { FlockPlan, FlockSummary } from '../interfaces/management-plan';
import { ManagementPlansService } from '../services/management-plans.service';
import { currentPlanActivityIds, currentPlanPosition } from '../services/management-plan-progress';

@Component({
  selector: 'app-flock-plan-detail', imports: [RouterLink, PlanActivitiesComponent],
  templateUrl: './flock-plan-detail.page.html',
  styleUrl: './flock-plan-detail.page.scss',
})
export class FlockPlanDetailPage {
  private readonly service = inject(ManagementPlansService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private loadVersion = 0;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  readonly now = signal(new Date());
  readonly flockId = this.route.snapshot.paramMap.get('id') ?? '';
  private readonly queryParams = toSignal(this.route.queryParamMap);
  readonly fromFlock = computed(() => this.queryParams()?.get('from') === 'flock');
  readonly backQueryParams = computed(() => {
    const params = this.queryParams();
    return this.fromFlock() && params?.get('lotFrom') === 'house'
      ? { lotFrom: 'house', unitId: params.get('unitId'), houseId: params.get('houseId') } : null;
  });
  readonly backLink = computed(() => this.fromFlock()
    ? ['/administracion/lotes/lotes', this.flockId]
    : ['/administracion/manejo-lotes/planes/lotes']);
  readonly flock = signal<FlockSummary | null>(null);
  readonly flockState = signal<'loading' | 'ready' | 'unavailable'>('loading');
  readonly plan = signal<FlockPlan | null>(null);
  readonly state = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  readonly selectedRevision = signal<number | null>(null);
  readonly currentRevision = computed(() => this.plan()?.revisions.find((item) => item.number === (this.selectedRevision() ?? this.plan()?.current_revision)) ?? null);
  readonly pastRevisions = computed(() => this.plan()?.revisions.filter((item) => item.number < this.plan()!.current_revision) ?? []);
  readonly revisionsExpanded = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly position = computed(() => this.plan() ? currentPlanPosition(this.plan()!.baseline_date, this.now()) : null);
  readonly viewingCurrentRevision = computed(() => this.currentRevision()?.number === this.plan()?.current_revision);
  readonly currentIds = computed(() => {
    const position = this.position();
    const status = this.flock()?.status;
    return position && (status === 'active' || status === 'quarantined') && this.viewingCurrentRevision()
      ? currentPlanActivityIds(this.currentRevision()?.activities ?? [], position.day) : new Set<string>();
  });

  constructor() {
    void this.load();
    this.clockTimer = setInterval(() => this.now.set(new Date()), 60_000);
    this.destroyRef.onDestroy(() => { if (this.clockTimer !== null) clearInterval(this.clockTimer); });
  }

  async load(): Promise<void> {
    const version = ++this.loadVersion;
    this.state.set('loading');
    this.flock.set(null);
    this.flockState.set('loading');
    this.plan.set(null);
    this.actionError.set(null);
    this.selectedRevision.set(null);
    this.revisionsExpanded.set(false);
    void firstValueFrom(this.service.flock(this.flockId)).then((response) => {
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.flock.set(response.data);
      this.flockState.set('ready');
    }).catch(() => {
      if (version === this.loadVersion && !this.destroyRef.destroyed) this.flockState.set('unavailable');
    });
    try {
      const plan = (await firstValueFrom(this.service.flockPlan(this.flockId))).data;
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.plan.set(plan);
      this.state.set('ready');
    } catch (error) {
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'empty' : 'error');
    }
  }

  async showRevisions(): Promise<void> {
    if (this.revisionsExpanded()) { this.revisionsExpanded.set(false); this.selectedRevision.set(null); return; }
    this.actionError.set(null);
    try {
      this.plan.set((await firstValueFrom(this.service.flockPlan(this.flockId, true))).data);
      this.revisionsExpanded.set(true);
    } catch { this.actionError.set('No se pudieron cargar las revisiones anteriores.'); }
  }

  selectRevision(event: Event): void {
    const number = Number((event.target as HTMLSelectElement).value);
    this.selectedRevision.set(Number.isSafeInteger(number) ? number : null);
  }
}

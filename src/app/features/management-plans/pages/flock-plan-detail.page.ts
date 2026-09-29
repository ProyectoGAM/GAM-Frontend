import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlanActivitiesComponent } from '../components/plan-activities.component';
import { FlockPlan, FlockSummary } from '../interfaces/management-plan';
import { ManagementPlansService } from '../services/management-plans.service';

@Component({
  selector: 'app-flock-plan-detail', imports: [RouterLink, PlanActivitiesComponent],
  templateUrl: './flock-plan-detail.page.html',
})
export class FlockPlanDetailPage {
  private readonly service = inject(ManagementPlansService);
  private readonly route = inject(ActivatedRoute);
  readonly flockId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly flock = signal<FlockSummary | null>(null);
  readonly plan = signal<FlockPlan | null>(null);
  readonly state = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  readonly selectedRevision = signal<number | null>(null);
  readonly currentRevision = computed(() => this.plan()?.revisions.find((item) => item.number === (this.selectedRevision() ?? this.plan()?.current_revision)) ?? null);
  readonly pastRevisions = computed(() => this.plan()?.revisions.filter((item) => item.number < this.plan()!.current_revision) ?? []);
  readonly revisionsExpanded = signal(false);
  readonly actionError = signal<string | null>(null);

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.state.set('loading');
    this.selectedRevision.set(null);
    this.revisionsExpanded.set(false);
    void firstValueFrom(this.service.flock(this.flockId)).then((response) => this.flock.set(response.data)).catch(() => undefined);
    try {
      this.plan.set((await firstValueFrom(this.service.flockPlan(this.flockId))).data);
      this.state.set('ready');
    } catch (error) {
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

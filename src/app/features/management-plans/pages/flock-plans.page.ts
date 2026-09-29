import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FlockSummary, PlanPage } from '../interfaces/management-plan';
import { ManagementPlansService } from '../services/management-plans.service';

@Component({
  selector: 'app-flock-plans', imports: [RouterLink],
  templateUrl: './flock-plans.page.html',
})
export class FlockPlansPage {
  private readonly service = inject(ManagementPlansService);
  readonly state = signal<'loading' | 'ready' | 'error' | 'forbidden'>('loading');
  readonly flocks = signal<FlockSummary[]>([]);
  readonly meta = signal<PlanPage<FlockSummary>['meta'] | null>(null);
  readonly search = signal('');
  readonly directId = signal('');

  constructor() { void this.load(); }

  async load(page = 1): Promise<void> {
    this.state.set('loading');
    try {
      const result = await firstValueFrom(this.service.flocks(page, this.search().trim()));
      this.flocks.set(result.data);
      this.meta.set(result.meta);
      this.state.set('ready');
    } catch (error) { this.state.set(error instanceof HttpErrorResponse && error.status === 403 ? 'forbidden' : 'error'); }
  }

  setSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  setDirectId(event: Event): void { this.directId.set((event.target as HTMLInputElement).value.trim()); }
}

import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { hasManagementPlansPermission } from '../../../core/auth/access-policy';
import { PlanPage, PlanTemplate } from '../interfaces/management-plan';
import { ManagementPlansService } from '../services/management-plans.service';

@Component({
  selector: 'app-plan-templates',
  imports: [RouterLink],
  templateUrl: './templates.page.html',
})
export class TemplatesPage {
  private readonly service = inject(ManagementPlansService);
  private readonly auth = inject(AuthStore);
  readonly canManage = computed(() => hasManagementPlansPermission(this.auth.user(), 'manage'));
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly templates = signal<PlanTemplate[]>([]);
  readonly meta = signal<PlanPage<PlanTemplate>['meta'] | null>(null);
  readonly status = signal<'all' | 'active' | 'retired'>('all');
  readonly search = signal('');
  readonly visible = computed(() => this.templates().filter((item) =>
    `${item.name} ${item.description ?? ''}`.toLocaleLowerCase().includes(this.search().trim().toLocaleLowerCase()),
  ));

  constructor() { void this.load(); }

  async load(page = 1): Promise<void> {
    this.state.set('loading');
    try {
      const status = this.status();
      const result = await firstValueFrom(this.service.templates(page, status === 'all' ? undefined : status));
      this.templates.set(result.data);
      this.meta.set(result.meta);
      this.state.set('ready');
    } catch { this.state.set('error'); }
  }

  setStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as 'all' | 'active' | 'retired');
    void this.load();
  }

  setSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  publishedPath(template: PlanTemplate): string[] { return ['/administracion/manejo-lotes/planes/plantillas', template.id]; }
  draftPath(template: PlanTemplate): string[] { return ['/administracion/manejo-lotes/planes/plantillas', template.id]; }
}

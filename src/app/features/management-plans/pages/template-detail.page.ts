import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { hasManagementPlansPermission } from '../../../core/auth/access-policy';
import { PlanActivitiesComponent } from '../components/plan-activities.component';
import { PlanTemplate } from '../interfaces/management-plan';
import { ManagementPlansService } from '../services/management-plans.service';

@Component({
  selector: 'app-template-detail', imports: [RouterLink, PlanActivitiesComponent],
  templateUrl: './template-detail.page.html',
})
export class TemplateDetailPage {
  private readonly service = inject(ManagementPlansService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthStore);
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly template = signal<PlanTemplate | null>(null);
  readonly selectedVersion = signal<number | null>(null);
  readonly canManage = computed(() => hasManagementPlansPermission(this.auth.user(), 'manage'));

  constructor() {
    this.route.queryParamMap.subscribe(() => void this.load());
  }

  async load(): Promise<void> {
    this.state.set('loading');
    const raw = Number(this.route.snapshot.queryParamMap.get('version'));
    const version = this.canManage() && Number.isSafeInteger(raw) && raw > 0 ? raw : undefined;
    this.selectedVersion.set(version ?? null);
    try {
      this.template.set((await firstValueFrom(this.service.template(this.route.snapshot.paramMap.get('id') ?? '', version))).data);
      this.state.set('ready');
    } catch { this.state.set('error'); }
  }
}

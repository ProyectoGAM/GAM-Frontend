import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { hasManagementPlansPermission } from '../../../core/auth/access-policy';
import { PlanActivitiesComponent } from '../components/plan-activities.component';
import { PlanTemplate } from '../interfaces/management-plan';
import { describeTemplateChanges } from '../services/management-plan-editor';
import { ManagementPlansService } from '../services/management-plans.service';

@Component({
  selector: 'app-template-detail', imports: [RouterLink, PlanActivitiesComponent],
  templateUrl: './template-detail.page.html',
})
export class TemplateDetailPage {
  private readonly service = inject(ManagementPlansService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly actionKeys = new Map<string, string>();
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly template = signal<PlanTemplate | null>(null);
  readonly selectedVersion = signal<number | null>(null);
  readonly canManage = computed(() => hasManagementPlansPermission(this.auth.user(), 'manage'));
  readonly canPublish = computed(() => {
    const item = this.template();
    return this.canManage() && item?.status === 'active' && item.version_status === 'draft'
      && (this.selectedVersion() === null || this.selectedVersion() === item.current_version);
  });
  readonly confirmation = signal<'publish' | 'retire' | null>(null);
  readonly workingAction = signal<'publish' | 'retire' | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly conflictChanges = signal<string[]>([]);
  readonly conflictVersion = signal<number | null>(null);

  constructor() {
    this.route.queryParamMap.subscribe(() => void this.load());
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.actionError.set(null);
    this.conflictChanges.set([]);
    this.conflictVersion.set(null);
    this.confirmation.set(null);
    const raw = Number(this.route.snapshot.queryParamMap.get('version'));
    const version = this.canManage() && Number.isSafeInteger(raw) && raw > 0 ? raw : undefined;
    this.selectedVersion.set(version ?? null);
    try {
      this.template.set((await firstValueFrom(this.service.template(this.route.snapshot.paramMap.get('id') ?? '', version))).data);
      this.state.set('ready');
    } catch { this.state.set('error'); }
  }

  detailPath(): string { return `/administracion/manejo-lotes/planes/plantillas/${this.route.snapshot.paramMap.get('id') ?? ''}`; }

  async showCurrentVersion(): Promise<void> {
    const version = this.conflictVersion();
    if (version) {
      await this.router.navigate([], { relativeTo: this.route, queryParams: { version } });
      await this.load();
    }
  }

  async confirmAction(action: 'publish' | 'retire'): Promise<void> {
    const item = this.template();
    if (!item || !this.canManage() || item.status !== 'active' || this.workingAction() || this.conflictVersion()) return;
    if (action === 'publish' && !this.canPublish()) return;
    this.workingAction.set(action);
    this.actionError.set(null);
    const keyName = `${action}:${item.id}:${item.current_version}`;
    let idempotencyKey = this.actionKeys.get(keyName);
    if (!idempotencyKey) {
      idempotencyKey = globalThis.crypto.randomUUID();
      this.actionKeys.set(keyName, idempotencyKey);
    }
    try {
      await firstValueFrom(action === 'publish'
        ? this.service.publishTemplate(item.id, item.current_version, idempotencyKey)
        : this.service.retireTemplate(item.id, item.current_version, idempotencyKey));
      this.actionKeys.delete(keyName);
      this.confirmation.set(null);
      await this.router.navigate([], { relativeTo: this.route, queryParams: {} });
      await this.load();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) await this.loadConflict(item);
      else if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) this.actionError.set('Tu sesión no tiene permiso para modificar esta plantilla.');
      else if (error instanceof HttpErrorResponse && error.status === 0) this.actionError.set('Sin conexión. Revisá tu conexión e intentá nuevamente.');
      else this.actionError.set('No se pudo completar la acción. Intentá nuevamente.');
    } finally {
      this.workingAction.set(null);
    }
  }

  private async loadConflict(previous: PlanTemplate): Promise<void> {
    try {
      const summary = (await firstValueFrom(this.service.template(previous.id))).data;
      const latest = (await firstValueFrom(this.service.template(previous.id, summary.current_version))).data;
      this.conflictChanges.set(describeTemplateChanges(previous, latest));
      this.conflictVersion.set(latest.current_version);
      this.actionError.set('La plantilla cambió antes de confirmar. Revisá la versión actual antes de intentar otra acción.');
      this.confirmation.set(null);
    } catch {
      this.actionError.set('La plantilla cambió, pero no se pudo consultar la versión actual. Volvé a cargar el detalle.');
      this.confirmation.set(null);
    }
  }
}

import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth.store';
import { ApiProblem } from '../../../core/auth/auth.types';
import { ManagedRoleDefinition, ManagedRolesResponse, RoleFieldErrors, RoleMetadata, RolePermissionModule, RoleSelectionPlan } from '../interfaces/role-management.interface';
import { canEditRole, permissionItems, roleSelectionError, roleSelectionPlan } from './role-permissions';
import { userManagementError } from './users-presentation';

@Injectable()
export class RolesService {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private alive = true;
  private listRequest = 0;
  private detailRequest = 0;
  private catalogRequest = 0;
  readonly canManage = computed(() => this.auth.isAdmin() && this.auth.isAuthenticated() && !this.auth.isShared());
  readonly roles = signal<ManagedRoleDefinition[]>([]);
  readonly roleRows = computed(() => this.roles().map((role) => ({ ...role, canEdit: canEditRole(role) })));
  readonly query = signal('');
  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly total = signal<number | null>(null);
  readonly listLoading = signal(false);
  readonly listLoaded = signal(false);
  readonly listError = signal('');
  readonly modules = signal<RolePermissionModule[]>([]);
  readonly catalogLoading = signal(false);
  readonly catalogLoaded = signal(false);
  readonly catalogError = signal('');
  readonly editor = signal(false);
  readonly creating = signal(false);
  readonly detailLoading = signal(false);
  readonly selected = signal<ManagedRoleDefinition | null>(null);
  readonly detailId = signal<number | null>(null);
  readonly selection = signal<string[]>([]);
  readonly selectedModule = signal('');
  readonly permissionQuery = signal('');
  readonly pendingSelection = signal<RoleSelectionPlan | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly fields = signal<RoleFieldErrors>({});
  readonly blocked = signal<'version' | 'uncertain' | 'missing' | 'forbidden' | null>(null);
  readonly latest = signal<ManagedRoleDefinition | null>(null);
  readonly items = computed(() => permissionItems(this.modules()));
  readonly permissionLabels = computed(() => new Map(this.items().map((item) => [item.nombre, item.etiqueta])));
  readonly readOnly = computed(() => !this.canManage() || (!this.creating() && (!this.selected() || !canEditRole(this.selected()))));
  readonly selectedSet = computed(() => new Set(this.selection()));
  readonly dirty = computed(() => {
    const original = this.selected()?.permisos ?? [];
    return original.length !== this.selection().length || original.some((name) => !this.selectedSet().has(name));
  });
  readonly added = computed(() => this.items().filter((item) => this.selectedSet().has(item.nombre) && !this.selected()?.permisos.includes(item.nombre)));
  readonly removed = computed(() => this.items().filter((item) => !this.selectedSet().has(item.nombre) && this.selected()?.permisos.includes(item.nombre)));
  readonly addedSet = computed(() => new Set(this.added().map((item) => item.nombre)));
  readonly removedSet = computed(() => new Set(this.removed().map((item) => item.nombre)));
  readonly removedChannels = computed(() => this.removed().filter((item) => ['can_login_web', 'can_login_native', 'can_login_shared'].includes(item.nombre)));
  readonly selectionError = computed(() => this.catalogLoaded() ? roleSelectionError(this.items(), this.selection(), this.readOnly()) : '');
  readonly moduleViews = computed(() => {
    const query = this.permissionQuery().trim().toLocaleLowerCase();
    return this.modules().map((module) => ({
      ...module,
      selectedCount: module.permisos.filter((item) => this.selectedSet().has(item.nombre)).length,
      assignableCount: module.permisos.filter((item) => item.asignable).length,
      missingCount: module.permisos.filter((item) => item.asignable && !this.selectedSet().has(item.nombre)).length,
      visiblePermissions: this.items().filter((item) => item.module === module.modulo
        && (!query || `${item.etiqueta} ${item.descripcion} ${module.etiqueta}`.toLocaleLowerCase().includes(query))),
    }));
  });
  readonly currentModule = computed(() => this.moduleViews().find((module) => module.modulo === this.selectedModule()) ?? null);
  readonly canReview = computed(() => !this.readOnly() && !this.busy() && !this.detailLoading() && this.catalogLoaded()
    && !this.catalogLoading() && !this.selectionError() && !this.blocked() && (this.creating() || this.dirty()));
  readonly canDelete = computed(() => this.canManage() && !this.busy() && !this.blocked() && !!this.selected()
    && !this.selected()!.protegido && this.selected()!.usuarios_count === 0);

  constructor() {
    const owner = this.owner();
    effect(() => { if (!this.canManage() || this.owner() !== owner) this.clear(); });
    this.destroyRef.onDestroy(() => { this.alive = false; this.clear(); });
  }

  private owner(): string { return `${this.auth.user()?.id ?? ''}:${this.auth.session()?.id ?? ''}:${this.auth.status()}`; }
  private current(owner: string): boolean { return this.alive && this.canManage() && this.owner() === owner; }
  private request<T>(response: Observable<T>): Promise<T> { return firstValueFrom(response.pipe(takeUntilDestroyed(this.destroyRef))); }

  async loadList(query = this.query(), page = this.page()): Promise<void> {
    if (!this.canManage()) return;
    const request = ++this.listRequest; const owner = this.owner();
    this.query.set(query.trim()); this.page.set(page); this.listLoading.set(true); this.listLoaded.set(false); this.listError.set('');
    try {
      const result = await this.request(this.api.get<ManagedRolesResponse>('roles', { params: { buscar: query.trim() || undefined, page, por_pagina: 25 } }));
      if (!this.current(owner) || request !== this.listRequest) return;
      this.roles.set(result.data); this.page.set(result.meta.current_page); this.lastPage.set(result.meta.last_page);
      this.total.set(result.meta.total); this.listLoaded.set(true);
    } catch (error) {
      if (this.current(owner) && request === this.listRequest) this.listError.set(userManagementError(error, 'No se pudieron cargar los roles.'));
    } finally { if (this.alive && request === this.listRequest) this.listLoading.set(false); }
  }

  async loadCatalog(): Promise<void> {
    if (!this.canManage()) return;
    const request = ++this.catalogRequest; const owner = this.owner();
    this.catalogLoading.set(true); this.catalogLoaded.set(false); this.catalogError.set('');
    try {
      const result = await this.request(this.api.get<{ data: RolePermissionModule[] }>('permisos'));
      if (!this.current(owner) || request !== this.catalogRequest) return;
      this.modules.set(result.data); this.catalogLoaded.set(true);
      if (!result.data.some((module) => module.modulo === this.selectedModule())) this.selectedModule.set(result.data[0]?.modulo ?? '');
    } catch (error) {
      if (this.current(owner) && request === this.catalogRequest) this.catalogError.set(userManagementError(error, 'No se pudo cargar el catálogo de permisos.'));
    } finally { if (this.alive && request === this.catalogRequest) this.catalogLoading.set(false); }
  }

  async open(id: number | null): Promise<void> {
    if (!this.canManage() || this.busy()) return;
    const request = ++this.detailRequest; const owner = this.owner();
    this.editor.set(true); this.creating.set(id === null); this.selected.set(null); this.detailId.set(id); this.selection.set([]);
    this.permissionQuery.set(''); this.pendingSelection.set(null); this.blocked.set(null); this.latest.set(null);
    this.error.set(''); this.message.set(''); this.fields.set({});
    this.detailLoading.set(id !== null);
    if (id === null) return;
    try {
      const result = await this.request(this.api.get<{ data: ManagedRoleDefinition }>(`roles/${id}`));
      if (!this.current(owner) || request !== this.detailRequest) return;
      this.selected.set(result.data); this.selection.set([...result.data.permisos]);
    } catch (error) {
      if (this.current(owner) && request === this.detailRequest) this.fail(error);
    } finally { if (this.alive && request === this.detailRequest) this.detailLoading.set(false); }
  }

  back(): void {
    if (this.busy()) return;
    this.detailRequest++; this.editor.set(false); this.creating.set(false); this.selected.set(null); this.selection.set([]);
    this.pendingSelection.set(null); this.blocked.set(null); this.latest.set(null); this.error.set(''); this.fields.set({});
  }

  togglePermission(name: string, checked: boolean): void { this.plan([name], checked, false); }

  searchPermissions(query: string): void {
    this.permissionQuery.set(query);
    if (query.trim() && !this.currentModule()?.visiblePermissions.length) {
      const match = this.moduleViews().find((module) => module.visiblePermissions.length);
      if (match) this.selectedModule.set(match.modulo);
    }
  }

  addModule(): void {
    const module = this.currentModule();
    if (module) this.plan(module.permisos.filter((item) => item.asignable && !this.selectedSet().has(item.nombre)).map((item) => item.nombre), true, !!this.permissionQuery().trim());
  }

  private plan(names: string[], enable: boolean, confirm: boolean): void {
    if (this.readOnly() || this.busy() || this.blocked() || !this.catalogLoaded() || this.catalogLoading() || this.pendingSelection()) return;
    this.error.set('');
    try {
      const plan = roleSelectionPlan(this.items(), this.selection(), names, enable);
      if (!plan.added.length && !plan.removed.length) return;
      const changes = enable ? plan.added : plan.removed;
      if (confirm || changes.some((item) => !names.includes(item.nombre))) this.pendingSelection.set(plan);
      else this.selection.set(plan.selection);
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo preparar la selección.'); }
  }

  acceptSelection(): void {
    if (!this.readOnly() && !this.busy() && !this.blocked() && this.pendingSelection()) this.selection.set([...this.pendingSelection()!.selection]);
    this.pendingSelection.set(null);
  }

  async savePermissions(): Promise<boolean> {
    const role = this.selected();
    if (!role || !this.canReview() || this.creating()) return false;
    return this.mutate(this.api.put<{ data: ManagedRoleDefinition }>(`roles/${role.id}/permisos`, { permisos: [...this.selection()], version: role.version }), 'Permisos guardados.', false);
  }

  async create(metadata: RoleMetadata): Promise<boolean> {
    if (!this.creating() || !this.canReview()) return false;
    return this.mutate(this.api.post<{ data: ManagedRoleDefinition }>('roles', { ...metadata, permisos: [...this.selection()] }), 'Rol creado. Podés asignarlo desde la cuenta de cada persona.', false);
  }

  async saveMetadata(metadata: RoleMetadata): Promise<boolean> {
    const role = this.selected();
    if (!role || this.readOnly() || this.busy() || this.blocked()) return false;
    return this.mutate(this.api.patch<{ data: ManagedRoleDefinition }>(`roles/${role.id}`, { ...metadata, version: role.version }), 'Nombre y descripción guardados.', true);
  }

  private async mutate(response: Observable<{ data: ManagedRoleDefinition }>, message: string, preserveDraft: boolean): Promise<boolean> {
    const owner = this.owner(); const request = this.detailRequest; const draft = [...this.selection()];
    const previousCount = this.selected()?.usuarios_count;
    this.busy.set(true); this.error.set(''); this.fields.set({});
    try {
      const result = await this.request(response);
      if (!this.current(owner) || request !== this.detailRequest) return false;
      const saved = result.data;
      this.selected.set({ ...saved, usuarios_count: saved.usuarios_count ?? previousCount });
      this.creating.set(false); this.selection.set(preserveDraft ? draft : [...saved.permisos]);
      this.message.set(message);
      // Mutations may omit usuarios_count. Refresh it without inventing zero.
      try {
        const fresh = await this.request(this.api.get<{ data: ManagedRoleDefinition }>(`roles/${saved.id}`));
        if (!this.current(owner) || request !== this.detailRequest) return false;
        if (preserveDraft && fresh.data.version !== saved.version) {
          this.latest.set(fresh.data); this.blocked.set('version');
          this.error.set('Los datos se guardaron, pero otro administrador cambió el rol. Compará la configuración actual antes de guardar permisos.');
        } else {
          this.selected.set(fresh.data);
          if (!preserveDraft) this.selection.set([...fresh.data.permisos]);
        }
      } catch {
        if (this.current(owner)) this.error.set('El cambio se guardó, pero no pudimos actualizar el detalle. Volvé a cargarlo antes de realizar otro cambio.');
        this.blocked.set('uncertain');
      }
      if (this.current(owner)) await this.loadList();
      return true;
    } catch (error) {
      if (this.current(owner)) {
        this.fail(error);
        if (error instanceof HttpErrorResponse && error.status === 409 && this.problem(error).code === 'ROLE_IN_USE') await this.reloadConflict();
      }
      return false;
    } finally { if (this.alive) this.busy.set(false); }
  }

  async deleteRole(): Promise<boolean> {
    const role = this.selected();
    if (!role || !this.canDelete()) return false;
    const owner = this.owner();
    this.busy.set(true); this.error.set('');
    try {
      await this.request(this.api.delete<void>(`roles/${role.id}`, { body: { version: role.version } }));
      if (!this.current(owner)) return false;
      this.busy.set(false); this.back(); this.message.set('Rol eliminado.');
      await this.loadList(this.query(), 1);
      return true;
    } catch (error) {
      if (this.current(owner)) {
        this.fail(error);
        if (error instanceof HttpErrorResponse && this.problem(error).code === 'ROLE_IN_USE') await this.reloadConflict();
      }
      return false;
    } finally { if (this.alive) this.busy.set(false); }
  }

  async reloadConflict(): Promise<void> {
    const role = this.selected();
    if (!role || this.detailLoading()) return;
    const owner = this.owner(); const request = this.detailRequest;
    this.detailLoading.set(true);
    try {
      const result = await this.request(this.api.get<{ data: ManagedRoleDefinition }>(`roles/${role.id}`));
      if (!this.current(owner) || request !== this.detailRequest) return;
      this.latest.set(result.data); this.blocked.set('version');
    } catch (error) { if (this.current(owner)) this.error.set(userManagementError(error, 'No se pudo recargar el rol.')); }
    finally { if (this.alive) this.detailLoading.set(false); }
  }

  adoptLatest(preserveDraft: boolean): void {
    const latest = this.latest();
    if (!latest || this.busy()) return;
    this.selected.set(latest);
    if (!preserveDraft) this.selection.set([...latest.permisos]);
    this.latest.set(null); this.blocked.set(null); this.error.set('');
    this.message.set(preserveDraft ? 'Borrador conservado. Revisá sus diferencias con la configuración actual.' : 'Se cargó la configuración actual.');
  }

  private problem(error: HttpErrorResponse): ApiProblem {
    return error.error && typeof error.error === 'object' ? error.error as ApiProblem : {};
  }

  private fail(error: unknown): void {
    this.fields.set({});
    if (error instanceof HttpErrorResponse) {
      const body = this.problem(error);
      if (error.status === 409 && body.code === 'ROLE_VERSION_CONFLICT') {
        this.blocked.set('version'); this.latest.set(null);
        this.error.set('Otro administrador modificó el rol. Recargá y compará los cambios antes de guardar.'); return;
      }
      if (error.status === 404) { this.blocked.set('missing'); this.error.set('El rol ya no está disponible. Volvé al listado.'); return; }
      if (error.status === 403) {
        this.blocked.set('forbidden'); this.error.set('No tenés autorización para modificar este rol.');
        void this.auth.refreshIdentity?.(); return;
      }
      if (error.status === 0 || error.status >= 500) {
        this.blocked.set('uncertain'); this.error.set('No pudimos confirmar el resultado. Actualizá la información antes de volver a intentar.'); return;
      }
      if (error.status === 422) {
        const first = (key: string) => Array.isArray(body.errors?.[key]) ? body.errors[key][0] : undefined;
        this.fields.set({ nombre: first('nombre'), descripcion: first('descripcion'), permisos: first('permisos') });
      }
      if (body.code === 'ROLE_IN_USE') { this.error.set('El rol tiene usuarios asignados, incluidas cuentas deshabilitadas. No se puede eliminar.'); return; }
    }
    this.error.set(userManagementError(error, 'No se pudo guardar el rol. Conservamos el borrador para revisarlo.'));
  }

  private clear(): void {
    this.listRequest++; this.detailRequest++; this.catalogRequest++;
    this.roles.set([]); this.modules.set([]); this.selected.set(null); this.selection.set([]); this.latest.set(null);
    this.editor.set(false); this.creating.set(false); this.pendingSelection.set(null);
    this.catalogLoaded.set(false); this.listLoaded.set(false); this.error.set(''); this.message.set(''); this.fields.set({});
  }
}


import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../../core/auth/auth.store';
import { API_CONFIG } from '../../../core/config/api.config';
import { ManagedRoleDefinition } from '../interfaces/role-management.interface';
import { roleModules, rolePage, testRole } from '../testing/role-fixtures';
import { RolesService } from './roles.service';

describe('RolesService contract and behavior', () => {
  let service: RolesService;
  let http: HttpTestingController;
  const user = signal({ id: 1 });
  beforeEach(() => {
    user.set({ id: 1 });
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), RolesService,
      { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      { provide: AuthStore, useValue: { user, session: () => ({ id: 'personal' }), status: () => 'personal_authenticated', isAdmin: () => true, isAuthenticated: () => true, isShared: () => false } },
    ] });
    service = TestBed.inject(RolesService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  async function ready(role = testRole) {
    const catalog = service.loadCatalog(); http.expectOne('/api/v1/permisos').flush({ data: roleModules }); await catalog;
    const detail = service.open(role.id); http.expectOne('/api/v1/roles/' + role.id).flush({ data: role }); await detail;
  }
  async function savedDetail(role: ManagedRoleDefinition) {
    await Promise.resolve();
    http.expectOne('/api/v1/roles/' + role.id).flush({ data: role });
    await Promise.resolve();
    http.expectOne('/api/v1/roles?page=1&por_pagina=25').flush({ ...rolePage, data: [role] });
  }

  it('searches the server with pagination and ignores outdated results', async () => {
    const first = service.loadList('anterior', 2);
    const older = http.expectOne('/api/v1/roles?buscar=anterior&page=2&por_pagina=25');
    const second = service.loadList('alimento', 1);
    http.expectOne('/api/v1/roles?buscar=alimento&page=1&por_pagina=25').flush(rolePage); await second;
    older.flush({ data: [], meta: { current_page: 2, last_page: 2, total: 0 } }); await first;
    expect(service.roles()).toEqual([testRole]); expect(service.query()).toBe('alimento'); expect(service.page()).toBe(1);
  });

  it('adds an entire module without losing other modules, excluding Admin-only permissions', async () => {
    await ready(); service.selectedModule.set('feed_stock'); service.addModule();
    expect(service.selection()).toEqual(expect.arrayContaining(['can_login_shared', 'can_view_feed_stock', 'can_manufacture_feed', 'can_adjust_feed_stock']));
    expect(service.currentModule()?.missingCount).toBe(0);
    service.selectedModule.set('health'); service.addModule();
    expect(service.selection()).not.toContain('can_manage_medicines'); expect(service.currentModule()?.assignableCount).toBe(0);
    expect(service.dirty()).toBe(true);
  });

  it('previews dependencies and all-module selection hidden by search before changing the draft', async () => {
    await ready({ ...testRole, permisos: ['can_login_shared'] });
    service.togglePermission('can_adjust_feed_stock', true);
    expect(service.selection()).toEqual(['can_login_shared']); expect(service.pendingSelection()?.added).toHaveLength(2);
    service.acceptSelection(); expect(service.selection()).toContain('can_view_feed_stock');
    service.selectedModule.set('feed_stock'); service.permissionQuery.set('Ajustar');
    service.addModule(); expect(service.pendingSelection()?.added[0].nombre).toBe('can_manufacture_feed');
    expect(service.selection()).not.toContain('can_manufacture_feed'); service.acceptSelection();
    expect(service.selection()).toContain('can_manufacture_feed');
  });

  it('sends complete permissions with the loaded version and prevents duplicate mutations', async () => {
    await ready(); service.selectedModule.set('feed_stock'); service.addModule();
    const saving = service.savePermissions(); expect(await service.savePermissions()).toBe(false);
    const request = http.expectOne('/api/v1/roles/7/permisos');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ permisos: service.selection(), version: 3 });
    const updated = { ...testRole, version: 4, permisos: [...service.selection()] };
    request.flush({ data: { ...updated, usuarios_count: undefined } });
    await savedDetail(updated); expect(await saving).toBe(true);
    expect(service.selected()?.usuarios_count).toBe(6); expect(service.dirty()).toBe(false);
  });

  it('creates a role with an empty valid selection and server-generated key', async () => {
    const catalog = service.loadCatalog(); http.expectOne('/api/v1/permisos').flush({ data: roleModules }); await catalog; await service.open(null);
    const saving = service.create({ nombre: 'Consulta', descripcion: null });
    const request = http.expectOne('/api/v1/roles');
    expect(request.request.body).toEqual({ nombre: 'Consulta', descripcion: null, permisos: [] });
    const created = { ...testRole, id: 9, clave: 'consulta_servidor', nombre: 'Consulta', permisos: [], usuarios_count: 0, version: 1 };
    request.flush({ data: created }); await savedDetail(created); expect(await saving).toBe(true);
    expect(service.selected()?.clave).toBe('consulta_servidor');
  });

  it('edits metadata separately while preserving the permission draft and adopting its new version', async () => {
    await ready(); service.selectedModule.set('feed_stock'); service.addModule();
    const draft = [...service.selection()];
    const saving = service.saveMetadata({ nombre: 'Operador nuevo', descripcion: 'Nueva descripción' });
    const request = http.expectOne('/api/v1/roles/7');
    expect(request.request.method).toBe('PATCH'); expect(request.request.body).toEqual({ nombre: 'Operador nuevo', descripcion: 'Nueva descripción', version: 3 });
    const updated = { ...testRole, nombre: 'Operador nuevo', version: 4 };
    request.flush({ data: updated }); await savedDetail(updated); expect(await saving).toBe(true);
    expect(service.selection()).toEqual(draft); expect(service.dirty()).toBe(true); expect(service.selected()?.version).toBe(4);
  });

  it('preserves a conflicting draft until an explicit reload and review against the current version', async () => {
    await ready(); service.selectedModule.set('feed_stock'); service.addModule();
    const saving = service.savePermissions();
    http.expectOne('/api/v1/roles/7/permisos').flush({ code: 'ROLE_VERSION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    expect(await saving).toBe(false); expect(service.blocked()).toBe('version');
    expect(await service.savePermissions()).toBe(false);
    const draft = [...service.selection()];
    const reload = service.reloadConflict(); http.expectOne('/api/v1/roles/7').flush({ data: { ...testRole, version: 5, permisos: [] } }); await reload;
    expect(service.selection()).toEqual(draft); expect(service.selected()?.version).toBe(3);
    service.adoptLatest(true); expect(service.selected()?.version).toBe(5); expect(service.selection()).toEqual(draft); expect(service.canReview()).toBe(true);
  });

  it('blocks all mutations on Admin and Sin rol even when editable is incorrectly true', async () => {
    for (const clave of ['admin', 'unassigned']) {
      await ready({ ...testRole, clave, protegido: true, editable: true });
      const original = [...service.selection()]; service.selectedModule.set('feed_stock'); service.addModule();
      expect(service.selection()).toEqual(original); expect(service.readOnly()).toBe(true);
      expect(await service.saveMetadata({ nombre: 'Cambio', descripcion: null })).toBe(false);
      expect(await service.deleteRole()).toBe(false);
    }
  });

  it('deletes only unprotected empty roles and sends the version in the DELETE body', async () => {
    await ready(); expect(await service.deleteRole()).toBe(false);
    await ready({ ...testRole, usuarios_count: 0 });
    const deleting = service.deleteRole();
    const request = http.expectOne('/api/v1/roles/7'); expect(request.request.method).toBe('DELETE'); expect(request.request.body).toEqual({ version: 3 });
    request.flush(null); await Promise.resolve();
    http.expectOne('/api/v1/roles?page=1&por_pagina=25').flush({ ...rolePage, data: [], meta: { current_page: 1, last_page: 1, total: 0 } });
    expect(await deleting).toBe(true); expect(service.editor()).toBe(false);
  });

  it('preserves field errors and does not retry an uncertain creation automatically', async () => {
    const catalog = service.loadCatalog(); http.expectOne('/api/v1/permisos').flush({ data: roleModules }); await catalog; await service.open(null);
    let saving = service.create({ nombre: '', descripcion: null });
    http.expectOne('/api/v1/roles').flush({ errors: { nombre: ['Ingresá un nombre.'] } }, { status: 422, statusText: 'Invalid' });
    expect(await saving).toBe(false); expect(service.fields().nombre).toBe('Ingresá un nombre.');
    saving = service.create({ nombre: 'Prueba', descripcion: null });
    http.expectOne('/api/v1/roles').flush(null, { status: 500, statusText: 'Failure' });
    expect(await saving).toBe(false); expect(service.blocked()).toBe('uncertain'); expect(await service.create({ nombre: 'Prueba', descripcion: null })).toBe(false);
  });

  it('recovers a concurrent assignment conflict without deleting or losing the draft', async () => {
    await ready({ ...testRole, usuarios_count: 0 });
    const deleting = service.deleteRole();
    http.expectOne('/api/v1/roles/7').flush({ code: 'ROLE_IN_USE' }, { status: 409, statusText: 'Conflict' });
    await Promise.resolve();
    http.expectOne('/api/v1/roles/7').flush({ data: { ...testRole, usuarios_count: 2 } });
    expect(await deleting).toBe(false); expect(service.latest()?.usuarios_count).toBe(2);
    expect(service.canDelete()).toBe(false); expect(service.selection()).toEqual(testRole.permisos);
    service.adoptLatest(false); expect(service.selected()?.usuarios_count).toBe(2); expect(await service.deleteRole()).toBe(false);
  });

  it('ignores a successful response after the operator changes', async () => {
    await ready(); service.selectedModule.set('feed_stock'); service.addModule();
    const saving = service.savePermissions(); const request = http.expectOne('/api/v1/roles/7/permisos');
    user.set({ id: 2 }); request.flush({ data: { ...testRole, version: 4 } });
    expect(await saving).toBe(false); expect(service.selected()?.version).not.toBe(4);
  });

  it('stops offering changes after authorization is denied', async () => {
    await ready(); service.selectedModule.set('feed_stock'); service.addModule();
    const saving = service.savePermissions();
    http.expectOne('/api/v1/roles/7/permisos').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(await saving).toBe(false); expect(service.blocked()).toBe('forbidden'); expect(service.canReview()).toBe(false);
    expect(await service.savePermissions()).toBe(false);
  });
});


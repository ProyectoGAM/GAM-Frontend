import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { ApiClient } from '../../../../core/api/api-client';
import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../inventory/testing/native-dialog-test';
import { roleModules, rolePage, testRole } from '../../testing/role-fixtures';
import { RolesPanelComponent } from './roles-panel.component';

describe('Roles panel', () => {
  const actor = signal({ id: 1 });
  const get = vi.fn();
  const post = vi.fn();
  const put = vi.fn();
  const patch = vi.fn();
  const remove = vi.fn();
  let restore: () => void;

  beforeEach(() => {
    actor.set({ id: 1 }); restore = stubNativeDialog();
    get.mockReset().mockImplementation((path: string) => of(path === 'permisos' ? { data: roleModules } : path === 'roles' ? rolePage : { data: testRole }));
    post.mockReset().mockReturnValue(of({ data: testRole })); put.mockReset().mockReturnValue(of({ data: testRole }));
    patch.mockReset().mockReturnValue(of({ data: testRole })); remove.mockReset().mockReturnValue(of(null));
    TestBed.configureTestingModule({ providers: [
      { provide: ApiClient, useValue: { get, post, put, patch, delete: remove } },
      { provide: AuthStore, useValue: { user: actor, session: () => ({ id: 'personal' }), status: () => 'personal_authenticated', isAdmin: () => true, isAuthenticated: () => true, isShared: () => false } },
    ] });
  });
  afterEach(() => { TestBed.resetTestingModule(); restore(); });

  async function render() {
    const fixture = TestBed.createComponent(RolesPanelComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture;
  }

  it('renders real roles, server counts and search without placeholders', async () => {
    const fixture = await render(); const panel = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Operador de alimento');
    expect(fixture.nativeElement.textContent).toContain('6');
    expect(fixture.nativeElement.textContent).not.toContain('Por implementar');
    panel.search.setValue('alimento'); panel.searchRoles(); await fixture.whenStable();
    expect(get).toHaveBeenCalledWith('roles', { params: { buscar: 'alimento', page: 1, por_pagina: 25 } });
  });

  it('previews a searched module batch and applies it only to the draft before reviewing', async () => {
    const fixture = await render(); const panel = fixture.componentInstance; await panel.open(7); fixture.detectChanges();
    panel.state.selectedModule.set('feed_stock'); panel.state.permissionQuery.set('Ajustar'); fixture.detectChanges();
    const bulk = [...fixture.nativeElement.querySelectorAll('button')].find((element) => (element as HTMLButtonElement).textContent?.includes('Agregar todo el módulo')) as HTMLButtonElement;
    bulk.click(); fixture.detectChanges();
    expect(panel.dialog()).toBe('selection'); expect(panel.state.selection()).not.toContain('can_manufacture_feed');
    expect(fixture.nativeElement.querySelector('dialog').textContent).toContain('Elaborar alimento');
    panel.acceptSelection(); fixture.detectChanges();
    expect(panel.state.selection()).toContain('can_manufacture_feed'); expect(put).not.toHaveBeenCalled();
    panel.review(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog').textContent).toContain('Afecta a 6 usuarios asignados');
    panel.closeDialog(); expect(put).not.toHaveBeenCalled();
  });

  it('validates creation metadata, allows a role with no permissions and submits after review', async () => {
    const fixture = await render(); const panel = fixture.componentInstance; await panel.open(null); fixture.detectChanges();
    panel.review(); expect(panel.dialog()).toBeNull(); expect(post).not.toHaveBeenCalled();
    panel.details.setValue({ nombre: '  Consulta  ', descripcion: '' }); panel.review(); fixture.detectChanges();
    expect(panel.reviewMetadata()?.nombre).toBe('Consulta');
    expect(fixture.nativeElement.querySelector('dialog').textContent).toContain('sin permisos');
    await panel.save();
    expect(post).toHaveBeenCalledWith('roles', { nombre: 'Consulta', descripcion: null, permisos: [] });
  });

  it('blocks duplicate saves and keeps the modal and draft on validation errors', async () => {
    const fixture = await render(); const panel = fixture.componentInstance; await panel.open(7);
    panel.state.selectedModule.set('feed_stock'); panel.state.addModule(); panel.review(); fixture.detectChanges();
    const pending = new Subject<unknown>(); put.mockReturnValueOnce(pending);
    const saving = panel.save(); await panel.save(); expect(put).toHaveBeenCalledTimes(1);
    pending.error(new HttpErrorResponse({ status: 422, error: { errors: { permisos: ['Revisá los permisos.'] } } })); await saving;
    expect(panel.dialog()).toBe('review'); expect(panel.state.dirty()).toBe(true);
    expect(panel.state.fields().permisos).toContain('Revisá');
  });

  it('protects Sin rol even if the API editable flag is true and exposes no bulk editing', async () => {
    get.mockImplementation((path: string) => of(path === 'permisos' ? { data: roleModules } : path === 'roles' ? rolePage : { data: { ...testRole, clave: 'unassigned', protegido: true, editable: true, permisos: [] } }));
    const fixture = await render(); await fixture.componentInstance.open(7); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin rol no tiene permisos');
    expect(fixture.nativeElement.textContent).not.toContain('Agregar todos');
    expect([...fixture.nativeElement.querySelectorAll('input[type=checkbox]')].every((input) => (input as HTMLInputElement).disabled)).toBe(true);
  });

  it('confirms navigation away from a draft, supports cancellation, and clears on identity change', async () => {
    const fixture = await render(); const panel = fixture.componentInstance; await panel.open(7);
    panel.state.selectedModule.set('feed_stock'); panel.state.addModule();
    let leaving = panel.canLeave(); panel.closeDialog(); expect(await leaving).toBe(false); expect(panel.state.dirty()).toBe(true);
    leaving = panel.canLeave(); panel.discard(); expect(await leaving).toBe(true);
    actor.set({ id: 2 }); fixture.detectChanges();
    expect(panel.state.editor()).toBe(false); expect(panel.state.selection()).toEqual([]);
  });

  it('does not turn a failed catalog into an empty editable selection', async () => {
    get.mockImplementation((path: string) => path === 'permisos' ? throwError(() => new Error('offline')) : of(path === 'roles' ? rolePage : { data: testRole }));
    const fixture = await render(); const panel = fixture.componentInstance; await panel.open(7); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reintentar catálogo');
    expect(panel.state.canReview()).toBe(false); expect(panel.state.selection()).toEqual(testRole.permisos);
  });

  it('keeps unsaved metadata when navigation is cancelled', async () => {
    const fixture = await render(); const panel = fixture.componentInstance; await panel.open(7); panel.openMetadata();
    panel.details.controls.nombre.setValue('Borrador'); panel.details.markAsDirty();
    const leaving = panel.canLeave(); expect(panel.dialog()).toBe('discard'); expect(panel.hasUnsaved()).toBe(true);
    panel.closeDialog(); expect(await leaving).toBe(false);
    expect(panel.dialog()).toBe('metadata'); expect(panel.details.controls.nombre.value).toBe('Borrador');
    expect(panel.hasUnsaved()).toBe(true); expect(patch).not.toHaveBeenCalled();
  });
});

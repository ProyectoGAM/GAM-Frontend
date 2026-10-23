import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { AuthUser } from '../../../core/auth/auth.types';
import { UsersService } from '../services/users.service';
import { UsersPage } from './users.page';
import { usersRoutes } from '../users.routes';
import { RouterTestingHarness } from '@angular/router/testing';
import { stubNativeDialog } from '../../inventory/testing/native-dialog-test';

describe('Users management', () => {
  const operator: AuthUser = { id: 1, name: 'Admin', email: 'admin@example.test', roles: ['admin'], permissions: [], deleted_at: null };
  const employee: AuthUser = { id: 4, name: 'Ana', email: 'ana@example.test', roles: ['employee'], permissions: [], deleted_at: null };
  const user = signal<AuthUser | null>(operator);
  const confirmPassword = vi.fn(async () => true);
  const execute = vi.fn(() => of<unknown>({}));
  const users = vi.fn(() => of({ users: [operator, employee], page: 1, lastPage: 1 }));
  let page: UsersPage;

  beforeEach(() => { user.set(operator); confirmPassword.mockReset().mockResolvedValue(true); execute.mockReset().mockReturnValue(of({})); users.mockClear(); });
  afterEach(() => vi.useRealTimers());

  function setup(tab = 'users'): UsersPage {
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { tab } } } },
      { provide: AuthStore, useValue: { user, session: () => ({ id: 'session-1' }), status: () => user() ? 'personal_authenticated' : 'personal_guest', isAdmin: () => !!user()?.roles.includes('admin'), isAuthenticated: () => !!user(), isShared: () => false, errorMessage: () => 'Contraseña incorrecta', confirmPassword } },
      { provide: UsersService, useValue: { users, devices: () => of([]), execute } },
    ] });
    page = TestBed.createComponent(UsersPage).componentInstance;
    return page;
  }

  it('defers changes until password verification, cancels without requests, and asks for every action', async () => {
    setup(); page.openUser(employee); page.userAction('status');
    expect(execute).not.toHaveBeenCalled(); expect(confirmPassword).not.toHaveBeenCalled();
    page.cancelConfirmation(); await page.confirm('example-only'); expect(execute).not.toHaveBeenCalled();
    page.userAction('status'); confirmPassword.mockResolvedValueOnce(false);
    await page.confirm('incorrect-example'); expect(execute).not.toHaveBeenCalled(); expect(page.confirmation()).not.toBeNull(); expect(page.confirmationError()).toContain('incorrecta');
    await page.confirm('example-only'); expect(execute).toHaveBeenCalledWith({ kind: 'status', userId: 4, enabled: false });
    page.openUser(employee); page.userAction('sessions'); expect(execute).toHaveBeenCalledTimes(1);
    await page.confirm('example-only'); expect(execute).toHaveBeenCalledTimes(2); expect(confirmPassword).toHaveBeenCalledTimes(3);
  });

  it('does not apply a verified action after the operator identity changes', async () => {
    setup(); page.openUser(employee); page.userAction('sessions');
    let finish: ((value: boolean) => void) | undefined;
    confirmPassword.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const waiting = page.confirm('example-only'); user.set({ ...operator, id: 2 }); finish?.(true); await waiting;
    expect(execute).not.toHaveBeenCalled();
  });

  it('prevents duplicate submission while verification or the command is in flight', async () => {
    setup(); page.openUser(employee); page.userAction('sessions');
    const response = new Subject<unknown>(); execute.mockReturnValue(response);
    const waiting = page.confirm('example-only'); await Promise.resolve();
    await page.confirm('example-only'); expect(confirmPassword).toHaveBeenCalledTimes(1); expect(execute).toHaveBeenCalledTimes(1);
    response.next({}); response.complete(); await waiting;
  });

  it('validates matching initial credentials and blocks changing own roles or status', () => {
    setup('create'); page.create(); expect(page.confirmation()).toBeNull();
    page.createForm.setValue({ name: 'Ana', email: 'ana@example.test', password: 'example-only', password_confirmation: 'different-example', role: 'employee' });
    page.create(); expect(page.confirmation()).toBeNull();
    page.createForm.controls.password_confirmation.setValue('example-only'); page.create(); expect(page.confirmation()?.title).toBe('Crear usuario');
    page.cancelConfirmation(); page.openUser(operator); page.userAction('status'); expect(page.confirmation()).toBeNull();
    page.openEditor('roles'); page.saveEditor(); expect(page.confirmation()).toBeNull();
  });

  it('preserves leading zeros in a valid PIN and does not invent PIN status', async () => {
    setup(); page.openUser(employee); page.openEditor('pin'); page.credentialForm.setValue({ value: '0007', confirmation: '0007' });
    page.saveEditor(); await page.confirm('example-only');
    expect(execute).toHaveBeenCalledWith({ kind: 'pin', userId: 4, pin: '0007', confirmation: '0007' });
  });

  it('clears pairing secrets at server expiration and on leaving the page', async () => {
    vi.useFakeTimers(); setup('devices');
    execute.mockReturnValue(of({ code: 'EXAMPLEONLY', expires_at: new Date(Date.now() + 1500).toISOString() }));
    page.deviceName.setValue('Tablet'); page.generateCode(); await page.confirm('example-only'); expect(page.pairing()?.code).toBe('EXAMPLEONLY');
    await vi.advanceTimersByTimeAsync(2000); expect(page.pairing()).toBeNull(); expect(page.message()).toContain('venció');
    execute.mockReturnValue(of({ code: 'EXAMPLEONLY', expires_at: new Date(Date.now() + 600000).toISOString() }));
    page.generateCode(); await page.confirm('example-only'); expect(page.pairing()).not.toBeNull();
    TestBed.resetTestingModule(); expect(page.pairing()).toBeNull();
  });

  it('does not automatically retry a mutation after an uncertain response', async () => {
    setup(); page.openUser(employee); page.userAction('sessions'); execute.mockReturnValue(throwError(() => new Error('network')));
    await page.confirm('example-only'); await page.confirm('example-only');
    expect(execute).toHaveBeenCalledTimes(1); expect(page.confirmation()).toBeNull(); expect(page.error()).toContain('resultado');
  });

  it('renders all four real tabs, loads them directly and redirects the legacy entry', async () => {
    const restore = stubNativeDialog();
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'administracion/usuarios', children: usersRoutes }, { path: 'gestion-accesos', redirectTo: 'administracion/usuarios', pathMatch: 'full' }]),
      { provide: AuthStore, useValue: { user, session: () => ({ id: 's' }), status: () => 'personal_authenticated', isAdmin: () => true, isAuthenticated: () => true, isShared: () => false } },
      { provide: UsersService, useValue: { users, devices: () => of([]), execute } },
    ] });
    try {
      const harness = await RouterTestingHarness.create();
      for (const path of ['gestion-accesos', 'administracion/usuarios/crear', 'administracion/usuarios/dispositivos', 'administracion/usuarios/roles']) {
        await harness.navigateByUrl('/' + path, UsersPage);
        expect(harness.routeNativeElement?.querySelectorAll('.tabs a')).toHaveLength(4);
        expect(harness.routeNativeElement?.querySelectorAll('.tabs a[aria-current="page"]')).toHaveLength(1);
        expect(harness.routeNativeElement?.textContent).toContain('Por implementar');
      }
      expect(execute).not.toHaveBeenCalled();
    } finally { TestBed.resetTestingModule(); restore(); }
  });
});

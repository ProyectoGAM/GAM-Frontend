import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { AuthUser } from '../../../core/auth/auth.types';
import { UsersService } from '../services/users.service';
import { UsersPage } from './users.page';
import { usersRoutes } from '../users.routes';
import { RouterTestingHarness } from '@angular/router/testing';
import { stubNativeDialog } from '../../inventory/testing/native-dialog-test';
import { DeviceProductionUnit, ManagedDevice } from '../interfaces/user-management.interface';
import { ApiClient } from '../../../core/api/api-client';
import { roleModules, rolePage } from '../testing/role-fixtures';

describe('Users management', () => {
  const operator: AuthUser = { id: 1, name: 'Admin', email: 'admin@example.test', roles: ['admin'], permissions: [], deleted_at: null };
  const employee: AuthUser = { id: 4, name: 'Ana', email: 'ana@example.test', roles: ['employee'], permissions: [], deleted_at: null };
  const user = signal<AuthUser | null>(operator);
  const confirmPassword = vi.fn(async () => true);
  const execute = vi.fn(() => of<unknown>({}));
  const users = vi.fn(() => of({ users: [operator, employee], page: 1, lastPage: 1 }));
  const unit = { id: 7, name: 'UP San José', status: 'active' as const };
  const deviceUnits = vi.fn<() => Observable<DeviceProductionUnit[]>>(() => of([unit]));
  const devices = vi.fn<() => Observable<ManagedDevice[]>>(() => of([]));
  let page: UsersPage;
  let fixture: ComponentFixture<UsersPage>;

  beforeEach(() => { user.set(operator); confirmPassword.mockReset().mockResolvedValue(true); execute.mockReset().mockReturnValue(of({})); users.mockClear(); deviceUnits.mockReset().mockReturnValue(of([unit])); devices.mockReset().mockReturnValue(of([])); });
  afterEach(() => vi.useRealTimers());

  function setup(tab = 'users'): UsersPage {
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { tab } } } },
      { provide: AuthStore, useValue: { user, session: () => ({ id: 'session-1' }), status: () => user() ? 'personal_authenticated' : 'personal_guest', isAdmin: () => !!user()?.roles.includes('admin'), isAuthenticated: () => !!user(), isShared: () => false, errorMessage: () => 'Contraseña incorrecta', confirmPassword } },
      { provide: UsersService, useValue: { users, devices, deviceUnits, execute, roleOptions: () => of([rolePage.data[0]]) } },
    ] });
    fixture = TestBed.createComponent(UsersPage); page = fixture.componentInstance;
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

  it('validates matching initial credentials and blocks changing own roles or status', async () => {
    setup('create'); await Promise.resolve(); page.create(); expect(page.confirmation()).toBeNull();
    page.roles.set(rolePage.data);
    page.createForm.patchValue({ name: 'Ana', rol_id: 7, personal: { email: 'ana@example.test', password: 'example-only', password_confirmation: 'different-example' } });
    page.create(); expect(page.confirmation()).toBeNull();
    page.createForm.controls.personal.controls.password_confirmation.setValue('example-only'); page.create(); expect(page.confirmation()?.title).toBe('Crear usuario');
    await page.confirm('example-only');
    expect(execute).toHaveBeenCalledWith({ kind: 'create', request: {
      name: 'Ana', rol_id: 7, email: 'ana@example.test', password: 'example-only', password_confirmation: 'example-only',
    } });
    page.cancelConfirmation(); page.openUser(operator); page.userAction('status'); expect(page.confirmation()).toBeNull();
    page.openEditor('roles'); page.saveEditor(); expect(page.confirmation()).toBeNull();
  });

  it('creates a PIN account with an active UP, one role and the exact four digits', async () => {
    deviceUnits.mockReturnValue(of([unit, { id: 8, name: 'UP inactiva', status: 'inactive' }]));
    setup('create');
    await fixture.whenStable();
    page.roles.set([
      { ...rolePage.data[0], id: 1, clave: 'admin', nombre: 'Administrador' },
      { ...rolePage.data[0], id: 9, clave: 'unassigned', nombre: 'Sin rol' },
    ]);
    page.createForm.patchValue({ name: '  Ana  ', rol_id: 1, personal: { email: 'ana@example.test', password: 'example-only' } });
    page.changeCreationMode('device_pin');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(page.createForm.controls.rol_id.value).toBeNull();
    expect(page.createForm.controls.personal.controls.password.value).toBe('');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#new-email')).toBeNull();
    expect(root.querySelector('#new-role')?.textContent).not.toContain('Administrador');
    expect(root.querySelector('#new-unit')?.textContent).not.toContain('UP inactiva');
    page.createForm.patchValue({ rol_id: 9, shared: { up_id: 8, pin: '0007', pin_confirmation: '0007' } });
    page.create();
    expect(page.confirmation()).toBeNull();
    page.createForm.controls.shared.controls.up_id.setValue(7);
    page.create();
    expect(page.confirmation()?.description).toContain('UP San José');
    expect(page.confirmation()?.description).toContain('no podrá iniciar sesión');
    expect(execute).not.toHaveBeenCalled();
    await page.confirm('example-only');
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      kind: 'create', request: { name: 'Ana', email: null, rol_id: 9, up_id: 7, pin: '0007', pin_confirmation: '0007' },
    });
    expect(page.creationMode()).toBe('email_password');
    expect(page.createForm.controls.shared.controls.pin.value).toBe('');
  });

  it('preserves leading zeros in a valid PIN and does not invent PIN status', async () => {
    setup(); page.openUser(employee); page.openEditor('pin'); page.credentialForm.setValue({ value: '0007', confirmation: '0007' });
    page.saveEditor(); await page.confirm('example-only');
    expect(execute).toHaveBeenCalledWith({ kind: 'pin', userId: 4, pin: '0007', confirmation: '0007' });
  });

  it('assigns exactly one custom catalog role after confirming its name', async () => {
    setup(); page.openUser(employee); page.openEditor('roles'); await Promise.resolve();
    page.assignedRole.setValue(7); page.saveEditor();
    expect(page.confirmation()?.description).toContain('Operador de alimento');
    expect(execute).not.toHaveBeenCalled(); await page.confirm('example-only');
    expect(execute).toHaveBeenCalledWith({ kind: 'roles', userId: 4, roleId: 7 });
  });

  it('does not allow assigning Admin to a PIN account and explains Sin rol', async () => {
    setup(); await Promise.resolve(); page.openUser({ ...employee, modalidad_acceso: 'device_pin' }); page.openEditor('roles'); await Promise.resolve();
    page.roles.set([{ ...rolePage.data[0], id: 1, clave: 'admin', nombre: 'Administrador' }, { ...rolePage.data[0], id: 9, clave: 'unassigned', nombre: 'Sin rol' }]);
    page.assignedRole.setValue(1); page.saveEditor(); expect(page.confirmation()).toBeNull(); expect(page.error()).toContain('PIN');
    page.assignedRole.setValue(9); page.saveEditor(); expect(page.confirmation()?.description).toContain('perderá el acceso');
    expect(execute).not.toHaveBeenCalled();
  });

  it('allows changing the role of a disabled account without re-enabling it', async () => {
    setup(); await Promise.resolve(); page.openUser({ ...employee, deleted_at: '2026-11-01' }); fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((element) => (element as HTMLButtonElement).textContent?.trim() === 'Cambiar rol') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    page.openEditor('roles'); await Promise.resolve();
    expect(page.editor()).toBe('roles'); expect(page.selected()?.deleted_at).toBe('2026-11-01'); expect(execute).not.toHaveBeenCalled();
  });

  it('clears pairing secrets at server expiration and on leaving the page', async () => {
    vi.useFakeTimers(); setup('devices');
    await Promise.resolve(); page.deviceUnit.setValue(7);
    execute.mockReturnValue(of({ code: 'ABC2345XYZ', expires_at: new Date(Date.now() + 1500).toISOString() }));
    page.deviceName.setValue('Tablet'); page.generateCode(); await page.confirm('example-only'); expect(page.pairing()?.code).toBe('ABC2345XYZ');
    await vi.advanceTimersByTimeAsync(2000); expect(page.pairing()).toBeNull(); expect(page.message()).toContain('venció');
    execute.mockReturnValue(of({ code: 'ABC2345XYZ', expires_at: new Date(Date.now() + 600000).toISOString() }));
    page.generateCode(); await page.confirm('example-only'); expect(page.pairing()).not.toBeNull();
    TestBed.resetTestingModule(); expect(page.pairing()).toBeNull();
  });

  it('does not automatically retry a mutation after an uncertain response', async () => {
    setup(); page.openUser(employee); page.userAction('sessions'); execute.mockReturnValue(throwError(() => new Error('network')));
    await page.confirm('example-only'); await page.confirm('example-only');
    expect(execute).toHaveBeenCalledTimes(1); expect(page.confirmation()).toBeNull(); expect(page.error()).toContain('resultado');
  });

  it('requires an active UP and confirms the exact device and unit before generating a code', async () => {
    deviceUnits.mockReturnValue(of([unit, { id: 8, name: 'Otra UP', status: 'inactive' }]));
    setup('devices'); await fixture.whenStable();
    page.deviceName.setValue('  Tablet  '); page.generateCode(); expect(page.confirmation()).toBeNull();
    page.deviceUnit.setValue(8); page.generateCode(); expect(page.confirmation()).toBeNull();
    page.deviceUnit.setValue(7); page.generateCode();
    expect(page.confirmation()?.target).toBe('Tablet · UP San José'); expect(execute).not.toHaveBeenCalled();
    execute.mockReturnValue(of({ code: 'ABC2345XYZ', expires_at: new Date(Date.now() + 600000).toISOString() }));
    page.deviceName.setValue('Otro nombre');
    await page.confirm('example-only');
    expect(execute).toHaveBeenCalledWith({ kind: 'code', name: 'Tablet', upId: 7 });
    expect(page.pairingContext()).toEqual({ name: 'Tablet', upName: 'UP San José' });
    expect(page.formattedCode()).toBe('ABC23 45XYZ');
  });

  it('represents failed unit and device loads separately from empty lists and can retry', async () => {
    deviceUnits.mockReturnValue(throwError(() => new Error('offline')));
    devices.mockReturnValue(throwError(() => new Error('offline')));
    setup('devices'); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reintentar carga de unidades');
    expect(fixture.nativeElement.textContent).toContain('Reintentar carga de dispositivos');
    expect(fixture.nativeElement.textContent).not.toContain('No hay dispositivos registrados');
    expect(fixture.nativeElement.querySelector('.generate-code').disabled).toBe(true);
    deviceUnits.mockReturnValue(of([unit])); devices.mockReturnValue(of([]));
    await page.loadDeviceUnits(); await page.load(); fixture.detectChanges();
    expect(page.unitsError()).toBe(''); expect(page.devicesLoaded()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('No hay dispositivos registrados');
  });

  it('disables generation when no active units exist without inventing a selection', async () => {
    deviceUnits.mockReturnValue(of([{ ...unit, status: 'inactive' }]));
    setup('devices'); await fixture.whenStable(); fixture.detectChanges();
    expect(page.deviceUnit.value).toBeNull(); expect(page.activeUnits()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.generate-code').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Necesitás una unidad productiva activa');
  });

  it('rejects malformed code responses and keeps their error visible', async () => {
    setup('devices'); await fixture.whenStable(); page.deviceName.setValue('Tablet'); page.deviceUnit.setValue(7);
    execute.mockReturnValue(of({ code: 'invalid', expires_at: 'not-a-date' }));
    page.generateCode(); await page.confirm('example-only');
    expect(page.pairing()).toBeNull(); expect(page.error()).toContain('código de vinculación válido');
  });

  it('explains session revocation and the unit when unlinking, and does not revoke inactive devices', async () => {
    setup('devices'); await fixture.whenStable();
    const device: ManagedDevice = { id: 'device-7', name: 'Tablet', up_id: 7, revoked_at: null, expires_at: null };
    page.revokeDevice(device);
    expect(page.confirmation()?.target).toBe('Tablet · UP San José');
    expect(page.confirmation()?.description).toContain('todas las sesiones');
    expect(execute).not.toHaveBeenCalled(); await page.confirm('example-only');
    expect(execute).toHaveBeenCalledWith({ kind: 'revokeDevice', deviceId: 'device-7' });
    page.revokeDevice({ ...device, revoked_at: new Date().toISOString() });
    expect(page.confirmation()).toBeNull();
  });

  it('opens an exact user from history and returns to the regular directory', async () => {
    const restore = stubNativeDialog();
    const allUsers = vi.fn().mockResolvedValue([operator, employee]);
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'administracion/usuarios', children: usersRoutes }]),
      { provide: AuthStore, useValue: { user, session: () => ({ id: 's' }), status: () => 'personal_authenticated', isAdmin: () => true, isAuthenticated: () => true, isShared: () => false } },
      { provide: UsersService, useValue: { users, allUsers, execute, devices: () => of([]) } },
    ] });
    try {
      const harness = await RouterTestingHarness.create();
      const linked = await harness.navigateByUrl('/administracion/usuarios/4', UsersPage);
      await harness.fixture.whenStable(); harness.detectChanges();
      expect(linked.selected()?.name).toBe('Ana');
      expect(harness.routeNativeElement?.textContent).toContain('Acceso de la cuenta');
      linked.back(); await harness.fixture.whenStable();
      expect(allUsers).toHaveBeenCalledTimes(1);
      expect(users).toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    } finally { TestBed.resetTestingModule(); restore(); }
  });

  it('renders all four real tabs, loads them directly and redirects the legacy entry', async () => {
    const restore = stubNativeDialog();
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'administracion/usuarios', children: usersRoutes }, { path: 'gestion-accesos', redirectTo: 'administracion/usuarios', pathMatch: 'full' }]),
      { provide: AuthStore, useValue: { user, session: () => ({ id: 's' }), status: () => 'personal_authenticated', isAdmin: () => true, isAuthenticated: () => true, isShared: () => false } },
      { provide: UsersService, useValue: { users, devices: () => of([]), deviceUnits, execute, roleOptions: () => of(rolePage.data) } },
      { provide: ApiClient, useValue: { get: (path: string) => of(path === 'permisos' ? { data: roleModules } : rolePage) } },
    ] });
    try {
      const harness = await RouterTestingHarness.create();
      const screens = [
        ['gestion-accesos', 'Cuentas de acceso'],
        ['administracion/usuarios/crear', 'Modalidad de acceso'],
        ['administracion/usuarios/dispositivos', 'Vincular un dispositivo'],
        ['administracion/usuarios/roles', 'Roles y permisos'],
      ];
      for (const [path, heading] of screens) {
        await harness.navigateByUrl('/' + path, UsersPage);
        expect(harness.routeNativeElement?.querySelectorAll('.tabs a')).toHaveLength(4);
        expect(harness.routeNativeElement?.querySelectorAll('.tabs a[aria-current="page"]')).toHaveLength(1);
        expect(harness.routeNativeElement?.textContent).toContain(heading);
      }
      expect(execute).not.toHaveBeenCalled();
    } finally { TestBed.resetTestingModule(); restore(); }
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthStore } from '../../../core/auth/auth.store';
import { AuthStatus } from '../../../core/auth/auth.types';
import { AuthPage } from './auth.page';

describe('Device linking and PIN access', () => {
  const status = signal<AuthStatus>('personal_guest');
  const shared = signal(false);
  const pair = vi.fn(async () => false);
  const loginWithPin = vi.fn(async () => false);
  const loadSharedUsers = vi.fn(async () => []);
  const errorMessage = signal<string | null>(null);
  const device = { id: 'tablet', name: 'Tablet de clasificación', up_id: 7 };
  const people = [{ id: 4, name: 'Ana Pérez' }];

  beforeEach(() => {
    status.set('personal_guest'); shared.set(false); errorMessage.set(null);
    pair.mockReset().mockResolvedValue(false); loginWithPin.mockReset().mockResolvedValue(false); loadSharedUsers.mockClear();
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: AuthStore, useValue: {
        status, isShared: shared, user: () => null, device: () => shared() ? device : null,
        sharedUsers: () => people, sharedUsersLoading: () => false, errorMessage,
        pair, loginWithPin, loadSharedUsers,
      } },
    ] });
  });

  async function render() {
    const fixture = TestBed.createComponent(AuthPage); fixture.detectChanges(); await fixture.whenStable();
    return fixture;
  }

  it('replaces personal login with the linking screen and accepts a grouped lowercase code', async () => {
    const fixture = await render(); const page = fixture.componentInstance;
    page.loginForm.controls.password.setValue('example-only');
    page.togglePairing(true); fixture.detectChanges();
    expect(page.loginForm.controls.password.value).toBe('');
    expect(fixture.nativeElement.textContent).toContain('Vincular este dispositivo');
    expect(fixture.nativeElement.textContent).not.toContain('Correo electrónico');
    expect(fixture.nativeElement.textContent).toContain('La unidad productiva está definida por el código.');
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    page.pairingForm.setValue({ code: 'abc23 45xyz', name: '  Tablet  ' }); await page.submitPairing();
    expect(pair).toHaveBeenCalledWith('ABC2345XYZ', 'Tablet');
    expect(page.showPairing()).toBe(true); expect(page.pairingForm.controls.name.value).toBe('Tablet');
  });

  it('validates code and name, blocks duplicate pairing, and clears the code after success', async () => {
    const fixture = await render(); const page = fixture.componentInstance;
    page.togglePairing(true); page.pairingForm.setValue({ code: 'invalid', name: ' ' }); await page.submitPairing();
    expect(pair).not.toHaveBeenCalled();
    let finish: ((value: boolean) => void) | undefined;
    pair.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    page.pairingForm.setValue({ code: 'ABC2345XYZ', name: 'Tablet' });
    const pending = page.submitPairing(); await page.submitPairing(); expect(pair).toHaveBeenCalledTimes(1);
    shared.set(true); status.set('shared_selector'); finish?.(true); await pending; fixture.detectChanges();
    expect(page.pairingForm.controls.code.value).toBe(''); expect(page.showPairing()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Tablet de clasificación');
    expect(fixture.nativeElement.textContent).toContain('Unidad productiva 7');
    expect(fixture.nativeElement.textContent).toContain('Ana Pérez');
  });

  it('shows one person then PIN, preserves leading zeros, and clears the PIN after an error', async () => {
    shared.set(true); status.set('shared_selector');
    const fixture = await render(); const page = fixture.componentInstance;
    page.chooseUser(people[0]); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ingresá tu PIN');
    expect(fixture.nativeElement.querySelector('.person-row')).toBeNull();
    page.pinForm.controls.pin.setValue('0007'); await page.submitPin();
    expect(loginWithPin).toHaveBeenCalledWith(4, '0007'); expect(page.pinForm.controls.pin.value).toBe('');
    page.pinForm.controls.pin.setValue('1234'); status.set('shared_verifying'); fixture.detectChanges();
    expect(page.selectedUser()).toBeNull(); expect(page.pinForm.controls.pin.value).toBe('');
  });

  it('keeps an actionable pairing error and clears the draft when returning to personal login', async () => {
    const fixture = await render(); const page = fixture.componentInstance; page.togglePairing(true);
    page.pairingForm.setValue({ code: 'ABC2345XYZ', name: 'Tablet' });
    errorMessage.set('El código ya venció.'); await page.submitPairing(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('El código ya venció.');
    expect(page.pairingForm.controls.code.value).toBe('ABC2345XYZ');
    page.togglePairing(false); expect(page.pairingForm.controls.code.value).toBe('');
  });
});


import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavController, ToastController } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { AuthUser } from '../../../core/auth/auth.types';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { ProfilePage } from './profile.page';

describe('Mi perfil', () => {
  const account: AuthUser = {
    id: 5, name: 'Lucía Pereira', email: 'lucia@example.test', deleted_at: null,
    roles: ['employee'], permissions: [], rol: { id: 2, clave: 'employee', nombre: 'Empleada' },
    modalidad_acceso: 'email_password', up_id: null,
  };

  function setup(person: AuthUser, shared = false) {
    const getById = vi.fn().mockReturnValue(of({ data: { name: 'UP San José' } }));
    const changeCredential = vi.fn().mockResolvedValue(null);
    const navigateRoot = vi.fn().mockResolvedValue(true);
    const logout = vi.fn().mockResolvedValue(undefined);
    const finishSharedSession = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: {
          user: signal(person), isAuthenticated: signal(true), isShared: () => shared,
          changeCredential, logout, finishSharedSession,
        } },
        { provide: ProductionUnitsService, useValue: { getById } },
        { provide: NavController, useValue: { navigateRoot } },
        { provide: ToastController, useValue: { create: async () => ({ present: async () => undefined }) } },
      ],
    });
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.componentInstance.ionViewWillEnter();
    return { fixture, getById, changeCredential, navigateRoot, logout, finishSharedSession };
  }

  it('shows a read-only role and the unassigned state without looking up a unit', async () => {
    const { fixture, getById } = setup(account);
    await fixture.whenStable();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.textContent).toContain('Lucía Pereira');
    expect(page.querySelector('app-initial-avatar[aria-hidden="true"]')?.textContent?.trim()).toBe('L');
    expect(page.textContent).toContain('Empleada');
    expect(page.textContent).toContain('Sin UP asignada');
    expect(page.querySelector('.security ion-button')?.textContent).toContain('Cambiar contraseña');
    expect(page.querySelector('.profile-card button, .profile-card a, .profile-card input')).toBeNull();
    expect(getById).not.toHaveBeenCalled();
  });

  it('keeps an assigned unit distinct from an unassigned one when its name is restricted', async () => {
    const { fixture, getById } = setup({ ...account, up_id: 7 });
    getById.mockReturnValue(throwError(() => new Error('Forbidden')));
    await fixture.whenStable();
    const page: HTMLElement = fixture.nativeElement;
    expect(getById).toHaveBeenCalledWith(7);
    expect(page.textContent).toContain('UP #7');
    expect(page.textContent).not.toContain('Sin UP asignada');
  });

  it.each([false, true])('closes only the current session from the profile (shared: %s)', async (shared) => {
    const { fixture, logout, finishSharedSession, navigateRoot } = setup(account, shared);
    await fixture.whenStable();
    const page: HTMLElement = fixture.nativeElement;
    const button = page.querySelector<HTMLElement>('.sign-out');
    expect(button?.textContent).toContain('Cerrar sesión');
    button?.click();
    await fixture.whenStable();

    expect(logout).toHaveBeenCalledTimes(shared ? 0 : 1);
    expect(finishSharedSession).toHaveBeenCalledTimes(shared ? 1 : 0);
    expect(navigateRoot).toHaveBeenCalledWith('/auth', { replaceUrl: true });
  });

  it('shows the assigned unit and submits a confirmed PIN with its leading zeros', async () => {
    const { fixture, changeCredential, navigateRoot } = setup({
      ...account, modalidad_acceso: 'device_pin', email: null, up_id: 7,
    });
    await fixture.whenStable();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.textContent).toContain('UP San José');
    expect(page.textContent).not.toContain('Correo electrónico');
    const open = page.querySelector<HTMLElement>('.security ion-button');
    expect(open?.textContent).toContain('Cambiar PIN');
    open?.click();
    await fixture.whenStable();

    const fields = [...page.querySelectorAll('input')];
    for (const [index, value] of ['0007', '0031', '0032'].entries()) {
      fields[index].value = value;
      fields[index].dispatchEvent(new Event('input'));
    }
    const submit = () => page.querySelector('form')?.dispatchEvent(new Event('submit'));
    submit();
    await fixture.whenStable();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('no coinciden');
    expect(changeCredential).not.toHaveBeenCalled();

    fields[2].value = '0031';
    fields[2].dispatchEvent(new Event('input'));
    submit();
    await fixture.whenStable();
    expect(changeCredential).toHaveBeenCalledWith('pin', '0007', '0031', '0031');
    expect(navigateRoot).toHaveBeenCalledWith('/auth', { replaceUrl: true });
  });
});

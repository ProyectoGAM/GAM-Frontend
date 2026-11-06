import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../../../core/auth/auth.store';
import { AppNotification, NotificationQuery } from '../interfaces/notification';
import { NotificationInboxService } from '../services/notification-inbox.service';
import { NotificationsPage } from './notifications.page';

describe('NotificationsPage', () => {
  it('muestra una alerta resuelta en su pestaña después de la actualización en vivo', async () => {
    const alert: AppNotification = {
      id: 'alert-1',
      tipo: 'temperature',
      urgencia: 'alto',
      modulo: 'farm_structure',
      titulo: 'Control de temperatura',
      mensaje: 'Revisar la temperatura.',
      fecha: '2026-11-05T15:00:00Z',
      leida_en: null,
      estado_resolucion: 'no_resuelto',
      resuelta_en: null,
      entidad: null,
    };
    const version = signal(0);
    const list = vi.fn(({ view }: NotificationQuery) => of({
      data: (view === 'resolved') === (alert.estado_resolucion === 'resuelto') ? [alert] : [],
      meta: { current_page: 1, last_page: 1, total: 1 },
    }));
    TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user: () => ({ permissions: ['can_view_notifications'] }) } },
        { provide: NotificationInboxService, useValue: { list, version, sessionId: () => 'session-1' } },
      ],
    });
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.componentRef.setInput('embedded', true);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('summary')?.textContent).toContain('Control de temperatura');
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ order: 'urgencia', view: 'all' }));

    alert.estado_resolucion = 'resuelto';
    alert.resuelta_en = '2026-11-05T15:25:00Z';
    version.set(1);
    await fixture.whenStable();
    expect(page.querySelector('summary')).toBeNull();

    const buttons = Array.from(page.querySelectorAll('button'));
    buttons.find((button) => button.textContent?.trim() === 'Alta')?.click();
    buttons.find((button) => button.textContent?.trim() === 'Resueltas')?.click();
    await fixture.whenStable();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ urgency: 'alto', view: 'resolved', page: 1 }));
    expect(page.querySelector('summary')?.textContent).toContain('Resuelta');
    expect(page.querySelector('summary time[datetime="2026-11-05T15:25:00Z"]')).not.toBeNull();
  });
});

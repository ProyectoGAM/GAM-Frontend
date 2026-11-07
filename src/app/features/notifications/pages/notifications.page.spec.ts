import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../../../core/auth/auth.store';
import { API_CONFIG } from '../../../core/config/api.config';
import { FlockFeeding } from '../../flocks/interfaces/flock-feeding.interface';
import { FlockFeedingService } from '../../flocks/services/flock-feeding.service';
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
        { provide: FlockFeedingService, useValue: {} },
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

  const alert: AppNotification = {
    id: 'review-1', tipo: 'manual_feeding_review_due', urgencia: 'medio', modulo: 'management_plans',
    titulo: 'Revisión de ración manual pendiente', mensaje: 'Pasaron 21 días desde el último cambio o confirmación del lote L-024.',
    fecha: '2026-11-05T15:00:00Z', leida_en: null, estado_resolucion: 'no_resuelto', resuelta_en: null,
    entidad: { tipo: 'flock', id: 'lot-1', ruta: '/administracion/lotes/lotes/lot-1/alimentacion' },
  };
  const feeding: FlockFeeding = {
    id: 42, lote_id: 'lot-1', modo: 'manual', receta_id: 3, cantidad_diaria_g: '12250', cantidad_manual_g: '12250',
    edad_dias: 43, fecha_vigencia: '2026-10-15', finalizado: false, revision_manual_desde: '2026-10-15',
    etapa: { recipe_id: 3, recipe_snapshot: { name: 'Ración de postura' } },
  };
  const currentPath = '/api/v1/lotes/lot-1/alimentacion';
  const confirmationPath = currentPath + '/manual/confirmacion';

  async function reviewInbox() {
    const permissions = signal(['can_view_notifications', 'can_view_flock_feeding', 'can_manage_flock_feeding']);
    const notifications = signal([alert, { ...alert, id: 'coverage-1', tipo: 'feed_coverage', titulo: 'Cobertura de ración' }]);
    const refresh = vi.fn();
    TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
        { provide: AuthStore, useValue: { user: () => ({ permissions: permissions() }) } },
        { provide: NotificationInboxService, useValue: {
          list: ({ view }: NotificationQuery) => of({
            data: notifications().filter((item) => (view === 'resolved') === (item.estado_resolucion === 'resuelto')),
            meta: { current_page: 1, last_page: 1, total: notifications().length },
          }),
          version: signal(0), sessionId: () => 'session-1', refresh,
        } },
      ],
    });
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.componentRef.setInput('embedded', true);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    return { fixture, page, http, permissions, notifications, refresh };
  }

  function press(page: HTMLElement, label: string) {
    const button = Array.from(page.querySelectorAll<HTMLElement>('button, ion-button'))
      .find((candidate) => candidate.textContent?.trim() === label);
    expect(button).toBeDefined();
    button!.click();
  }

  it('confirms the reviewed ration once across retries and refreshes the resolved alert', async () => {
    const { fixture, page, http, notifications, refresh } = await reviewInbox();
    expect(page.querySelectorAll('.review-trigger')).toHaveLength(1);
    press(page, 'Revisar ración');
    http.expectOne({ method: 'GET', url: currentPath }).flush({ data: feeding });
    await fixture.whenStable();

    const dialog = page.querySelector('dialog[open]')!;
    expect(dialog.getAttribute('aria-label')).toBe('Confirmar ración vigente');
    expect(dialog.textContent).toContain('21 días');
    expect(dialog.textContent).toContain('Ración de postura');
    expect(dialog.textContent).toContain('12,25 kg/día');
    press(page, 'Confirmar ración');
    const first = http.expectOne({ method: 'POST', url: confirmationPath });
    expect(first.request.body).toEqual({ configuracion_id: 42 });
    const key = first.request.headers.get('Idempotency-Key');
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    await fixture.whenStable();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(page.querySelector('dialog[open]')).toBeTruthy();
    first.error(new ProgressEvent('network error'));
    await fixture.whenStable();
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Volvé a intentar');

    press(page, 'Confirmar ración');
    const second = http.expectOne({ method: 'POST', url: confirmationPath });
    expect(second.request.headers.get('Idempotency-Key')).toBe(key);
    notifications.update((items) => items.map((item) => item.id === alert.id ? {
      ...item, estado_resolucion: 'resuelto', resuelta_en: '2026-11-05T16:00:00Z',
    } : item));
    second.flush({ data: { operation_id: 'reviewed' } }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(refresh).toHaveBeenCalledOnce();
    expect(page.querySelector('dialog')).toBeNull();
    expect(page.textContent).toContain('La alerta quedó resuelta');
    press(page, 'Resueltas');
    await fixture.whenStable();
    expect(page.textContent).toContain(alert.titulo);
    expect(page.querySelector('.review-trigger')).toBeNull();
    http.verify();
  });

  it('requires write access and blocks confirmation after a stale configuration conflict', async () => {
    const { fixture, page, http, permissions } = await reviewInbox();
    permissions.set(['can_view_notifications', 'can_view_flock_feeding']);
    await fixture.whenStable();
    expect(page.querySelector('.review-trigger')).toBeNull();
    permissions.update((values) => [...values, 'can_manage_flock_feeding']);
    await fixture.whenStable();
    press(page, 'Revisar ración');
    http.expectOne(currentPath).flush({ data: feeding });
    await fixture.whenStable();
    press(page, 'Confirmar ración');
    http.expectOne(confirmationPath).flush({}, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    expect(page.querySelector('dialog')?.textContent).toContain('La ración vigente cambió');
    const actions = Array.from(page.querySelectorAll('dialog ion-button')).map((button) => button.textContent?.trim());
    expect(actions).toEqual(['Cancelar', 'Volver a consultar']);

    press(page, 'Volver a consultar');
    http.expectOne(currentPath).flush({ data: { ...feeding, confirmada_en: '2026-11-05T15:30:00Z' } });
    await fixture.whenStable();
    expect(page.querySelector('dialog [role="alert"]')?.textContent).toContain('ya no corresponde');
    expect(page.querySelectorAll('dialog ion-button')).toHaveLength(1);
    press(page, 'Cancelar');
    await fixture.whenStable();
    expect(page.querySelector('dialog')).toBeNull();
    http.verify();
  });
});

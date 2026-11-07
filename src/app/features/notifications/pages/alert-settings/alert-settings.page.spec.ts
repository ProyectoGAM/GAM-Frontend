import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthStore } from '../../../../core/auth/auth.store';
import { API_CONFIG } from '../../../../core/config/api.config';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { AlertSettingsPage } from './alert-settings.page';

describe('AlertSettingsPage', () => {
  const units = [{ id: 7, name: 'El Ombú' }, { id: 9, name: 'Santa Clara' }];
  const daily = 'daily_egg_collection_missing';
  const coverage = 'alertas-cobertura-racion';
  const timingPath = (unitId: number, rule: string) => `/api/v1/unidades-productivas/${unitId}/umbrales-alertas/${rule}`;
  const coveragePath = (unitId: number) => `/api/v1/unidades-productivas/${unitId}/${coverage}`;
  let selectedId: ReturnType<typeof signal<number | null>>;
  let fixture: ComponentFixture<AlertSettingsPage>;
  let page: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    selectedId = signal<number | null>(null);
    TestBed.configureTestingModule({
      imports: [AlertSettingsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
        { provide: AuthStore, useValue: { isAdmin: () => true } },
        { provide: AdminUnitContextService, useValue: {
          selectedId, units: () => units, state: () => 'ready',
          selectedUnit: computed(() => units.find(({ id }) => id === selectedId()) ?? null),
          select: (id: number | null) => selectedId.set(id),
        } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AlertSettingsPage);
    page = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    http.expectOne('/api/v1/configuracion-alertas').flush({ data: [] });
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  async function load(unitId: number, days: number, unavailable?: string) {
    const pending = http.match((request) => request.method === 'GET'
      && request.url.startsWith(`/api/v1/unidades-productivas/${unitId}/`)
      && !request.url.endsWith('/configuracion-alertas'));
    http.match(`/api/v1/unidades-productivas/${unitId}/configuracion-alertas`).forEach((request) => request.flush({ data: [] }));
    expect(pending).toHaveLength(10);
    for (const request of pending) {
      if (request.request.url.endsWith('/' + unavailable)) {
        request.flush({}, { status: 503, statusText: 'Unavailable' });
      } else if (request.request.url === coveragePath(unitId)) {
        request.flush({ data: { dias_aviso_bajo: null, dias_aviso: 7, dias_urgencia: 2 } });
      } else {
        request.flush({ data: request.request.url === timingPath(unitId, daily)
          ? { bajo: 1, medio: 2, alto: days } : { bajo: null, medio: -7, alto: 0 } });
      }
    }
    await fixture.whenStable();
  }

  async function selectUnit(id: number) {
    const select = page.querySelector<HTMLSelectElement>('#alert-settings-unit')!;
    select.value = String(id);
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  async function edit(rule: string) {
    page.querySelector<HTMLButtonElement>(`#edit-${rule}`)!.click();
    await fixture.whenStable();
    return page.querySelector<HTMLFormElement>('form.editor')!;
  }

  function enterDays(form: HTMLFormElement, urgency: string, value: string) {
    const field = form.querySelector<HTMLInputElement>(`input[aria-label="Días para la urgencia ${urgency}"]`)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  function submit(form: HTMLFormElement) {
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  it('loads each rule only after selecting a unit and discards its draft on scope change', async () => {
    expect(page.textContent).toContain('Seleccioná una unidad productiva para ver sus alertas.');
    http.expectNone((request) => request.url.includes('/umbrales-alertas/'));

    await selectUnit(7);
    await load(7, 7);
    const editor = await edit(daily);
    enterDays(editor, 'alta', '10');
    selectedId.set(9);
    await fixture.whenStable();
    await load(9, 5);
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('.level.alto')?.textContent).toContain('5 días');
    expect(page.querySelector<HTMLSelectElement>('#alert-settings-unit')?.value).toBe('9');
  });

  it('blocks invalid timing thresholds and sends days before a date as a negative number', async () => {
    selectedId.set(7);
    await fixture.whenStable();
    await load(7, 7);
    const form = await edit('vaccination_due');
    const moment = form.querySelector<HTMLSelectElement>('select[aria-label$="urgencia media"]')!;
    expect(moment.value).toBe('before');
    const highMoment = form.querySelector<HTMLSelectElement>('select[aria-label$="urgencia alta"]')!;
    expect(highMoment.value).toBe('on-date');
    enterDays(form, 'media', '0');
    submit(form);
    await fixture.whenStable();
    expect(form.querySelector('[role="alert"]')?.textContent).toContain('número entero');
    http.expectNone((request) => request.method === 'PUT');

    enterDays(form, 'media', '5');
    submit(form);
    const save = http.expectOne({ method: 'PUT', url: timingPath(7, 'vaccination_due') });
    expect(save.request.body).toEqual({ bajo: null, medio: -5, alto: 0 });
    save.flush({ data: save.request.body });
    await fixture.whenStable();
    expect(page.querySelector('#title-vaccination_due')?.closest('article')?.textContent).toContain('5 días antes');
    expect(page.querySelector('.success')?.textContent).toContain('Cambios guardados');
  });

  it('keeps available rules usable after a partial failure and preserves a rejected coverage draft', async () => {
    selectedId.set(7);
    await fixture.whenStable();
    await load(7, 7, 'medication_due');
    expect(page.textContent).toContain('No se pudieron cargar todas las alertas');
    const form = await edit('feed_coverage');
    enterDays(form, 'media', '2');
    submit(form);
    await fixture.whenStable();
    expect(form.querySelector('[role="alert"]')?.textContent).toContain('quedan menos días');
    http.expectNone((request) => request.method === 'PUT');

    enterDays(form, 'media', '6');
    submit(form);
    const save = http.expectOne({ method: 'PUT', url: coveragePath(7) });
    expect(save.request.body).toEqual({ dias_aviso_bajo: null, dias_aviso: 6, dias_urgencia: 2 });
    save.flush({}, { status: 422, statusText: 'Invalid' });
    await fixture.whenStable();
    expect(form.querySelector('[role="alert"]')?.textContent).toContain('Revisá los valores ingresados');
    expect(form.querySelector<HTMLInputElement>('input[aria-label$="urgencia media"]')?.value).toBe('6');
  });

  it('keeps a save bound to its original unit if the sidebar selection changes', async () => {
    selectedId.set(7);
    await fixture.whenStable();
    await load(7, 7);
    const form = await edit(daily);
    enterDays(form, 'alta', '10');
    submit(form);
    const save = http.expectOne({ method: 'PUT', url: timingPath(7, daily) });

    selectedId.set(9);
    await fixture.whenStable();
    await load(9, 5);
    save.flush({ data: save.request.body });
    await fixture.whenStable();
    expect(page.querySelector('.level.alto')?.textContent).toContain('5 días');
    expect(page.querySelector('.success')).toBeNull();
  });
});

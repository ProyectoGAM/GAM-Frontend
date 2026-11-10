import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { API_CONFIG } from '../../../../core/config/api.config';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { HealthHistoryEntry } from '../../interfaces/flock-health.interface';
import { FlockBeakTrimmingsPage } from './flock-beak-trimmings.page';

const base = '/api/v1/flocks/lot-1';
const history = (id: string, kind: 'direct' | 'antecedent' = 'direct'): HealthHistoryEntry => ({
  id, type: 'manual_practice', source: 'manual_practice', occurred_at: '2026-01-05T12:00:00Z',
  plan_activity_title: null, outside_plan: true, responsible: { name: 'Ana', user_id: 1 },
  provenance: { kind, flock_id: kind === 'direct' ? 'lot-1' : 'lot-2' }, module_data: { practice_type: 'beak_trimming' },
});
const correction: HealthHistoryEntry = {
  ...history('correction-1'), type: 'management_correction', occurred_at: '2026-01-06T12:00:00Z',
  module_data: { original_type: 'manual_practice', original_id: 'beak-1', correction_reason: 'Registro duplicado' },
};

describe('FlockBeakTrimmingsPage', () => {
  let fixture: ComponentFixture<FlockBeakTrimmingsPage>;
  let page: HTMLElement;
  let http: HttpTestingController;
  let restore: () => void;

  function setUp(action: 'record' | 'reverse') {
    restore = stubNativeDialog();
    TestBed.configureTestingModule({
      imports: [FlockBeakTrimmingsPage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'lot-1' })), queryParamMap: of(convertToParamMap({})) } },
        { provide: AuthStore, useValue: {
          user: () => ({ id: 1, name: 'Ana', roles: ['employee'], permissions: [
            'can_view_management_plans', 'can_execute_management_plans', `can_${action}_beak_trimming`,
          ] }),
          session: () => ({ id: 'session-1' }),
        } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FlockBeakTrimmingsPage);
    page = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    fixture.destroy();
    restore();
    http.verify();
  });

  function load(rows: HealthHistoryEntry[] = [], corrections: HealthHistoryEntry[] = []) {
    http.expectOne({ method: 'GET', url: base }).flush({
      data: { id: 'lot-1', code: 'L-024', status: 'active', established_at: '2025-01-01T00:00:00Z' },
    });
    for (const [type, data] of [['manual_practice', rows], ['management_correction', corrections]] as const) {
      http.expectOne((request) => request.url === base + '/manejos' && request.params.get('type') === type)
        .flush({ data, meta: { current_page: 1, last_page: 1, total: data.length } });
    }
  }

  function fill(selector: string, value: string) {
    const control = page.querySelector<HTMLInputElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
  }

  async function open(selector: string) {
    page.querySelector<HTMLButtonElement>(selector)!.click();
    await fixture.whenStable();
    return page.querySelector<HTMLFormElement>('dialog[open] form')!;
  }

  function submit(form: HTMLFormElement) { form.dispatchEvent(new Event('submit', { cancelable: true })); }

  it('records a scheduled despique with Montevideo time and reuses its key after a lost response', async () => {
    setUp('record');
    await fixture.whenStable();
    load();
    http.expectOne((request) => request.url === base + '/plan-manejo').flush({
      data: { current_revision: 2, revisions: [{ number: 2, activities: [
        { id: 'plan-beak', title: 'Despique inicial', type: 'manual_practice', practice_type: 'beak_trimming' },
        { id: 'plan-nest', title: 'Nidos', type: 'manual_practice', practice_type: 'nest_placement' },
      ] }] },
    });
    await fixture.whenStable();
    const form = await open('.heading button');
    expect(form.querySelectorAll('select option')).toHaveLength(2);
    fill('[formcontrolname="date"]', '2026-01-05');
    fill('[formcontrolname="time"]', '09:00');
    fill('[formcontrolname="activity"]', 'plan-beak');
    submit(form);
    const request = http.expectOne({ method: 'POST', url: base + '/practicas' });
    expect(request.request.body).toEqual({
      practice_type: 'beak_trimming', occurred_at: '2026-01-05T09:00:00-03:00', plan_activity_id: 'plan-beak',
    });
    const key = request.request.headers.get('Idempotency-Key');
    request.error(new ProgressEvent('error'));
    await fixture.whenStable();
    expect(fixture.componentInstance.canLeave()).toBe(false);
    submit(form);
    const retry = http.expectOne({ method: 'POST', url: base + '/practicas' });
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    expect(retry.request.body).toEqual(request.request.body);
    retry.flush({ data: { operation_id: 'recorded' } });
    await fixture.whenStable();
    load([history('beak-1')]);
    await fixture.whenStable();
    expect(page.querySelector('dialog[open]')).toBeNull();
    expect(page.querySelector('.success')?.textContent).toContain('Despique registrado');
  });

  it('reverses only direct records, requires a reason and keeps the original visible as reverted', async () => {
    setUp('reverse');
    await fixture.whenStable();
    load([history('beak-1'), history('previous', 'antecedent'), {
      ...history('nest'), module_data: { practice_type: 'nest_placement' },
    }]);
    await fixture.whenStable();
    expect(page.querySelector('.heading button')).toBeNull();
    expect(page.querySelectorAll('.record')).toHaveLength(2);
    expect(page.querySelectorAll('.reverse-action')).toHaveLength(1);
    const form = await open('.reverse-action');
    submit(form);
    await fixture.whenStable();
    expect(form.querySelector('[role="alert"]')?.textContent).toContain('Ingresá un motivo');
    http.expectNone((request) => request.method === 'POST');
    fill('[formcontrolname="reason"]', ' Registro duplicado ');
    submit(form);
    const request = http.expectOne({ method: 'POST', url: base + '/manejos/manual_practice/beak-1/correcciones' });
    expect(request.request.body).toEqual({ reason: 'Registro duplicado' });
    request.flush({ data: { operation_id: 'corrected' } });
    await fixture.whenStable();
    load([history('beak-1'), history('previous', 'antecedent')], [correction]);
    await fixture.whenStable();
    expect(page.querySelectorAll('.record')).toHaveLength(2);
    expect(page.querySelectorAll('.reverse-action')).toHaveLength(0);
    expect(page.querySelector('.reverted')?.textContent).toContain('Revertido');
    expect(page.querySelector('.reversal')?.textContent).toContain('Registro duplicado');
  });
});

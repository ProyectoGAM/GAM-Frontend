import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthStore } from '../../../../core/auth/auth.store';
import { API_CONFIG } from '../../../../core/config/api.config';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { BreedWeighingSettings } from '../../interfaces/flock-weighing.interface';
import { BreedsPage } from './breeds.page';

const breed: BreedWeighingSettings = {
  id: 7, name: 'Lohmann Brown', status: 'active', version: 3,
  range_overrides: { chick_min_weight_g: null, chick_max_weight_g: null, adult_min_weight_g: '1750.0', adult_max_weight_g: '2150.0' },
  expected_ranges: {
    adult_from_week: 18, reference_version: 1,
    chick: { min_weight_g: '35.0', max_weight_g: '1400.0', source: 'global' },
    adult: { min_weight_g: '1750.0', max_weight_g: '2150.0', source: 'breed' },
  },
};

describe('BreedsPage', () => {
  const permissions = signal(['can_view_breeds', 'can_manage_breeds']);
  let fixture: ComponentFixture<BreedsPage>;
  let page: HTMLElement;
  let http: HttpTestingController;
  let restoreDialog: () => void;

  beforeEach(async () => {
    restoreDialog = stubNativeDialog();
    permissions.set(['can_view_breeds', 'can_manage_breeds']);
    TestBed.configureTestingModule({
      imports: [BreedsPage],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
        { provide: AuthStore, useValue: { user: () => ({ id: 11, permissions: permissions() }), isAdmin: () => false } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BreedsPage);
    page = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    await load();
  });

  afterEach(() => {
    restoreDialog();
    http.verify();
  });

  async function load(status?: string, data = [breed]) {
    const request = http.expectOne((request) => request.url === '/api/v1/breeds' && request.method === 'GET');
    expect(request.request.params.keys()).toEqual(status ? ['status', 'page', 'per_page'] : ['page', 'per_page']);
    expect(request.request.params.get('status')).toBe(status ?? null);
    request.flush({ data, meta: { current_page: 1, last_page: 1, total: data.length } });
    await fixture.whenStable();
  }

  async function open(selector: string) {
    page.querySelector<HTMLButtonElement>(selector)!.click();
    await fixture.whenStable();
    const form = page.querySelector<HTMLFormElement>('dialog[open] form');
    expect(form).not.toBeNull();
    return form!;
  }

  function fill(id: string, value: string) {
    const input = page.querySelector<HTMLInputElement>('#' + id)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submit(form: HTMLFormElement) {
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  it('shows the global catalogue with ranges and allows filtering the list without edit access', async () => {
    expect(page.textContent).toContain('Catálogo global');
    expect(page.querySelector('.chick')?.textContent).toContain('Rango global');
    expect(page.querySelector('.adult')?.textContent).toContain('Rango propio');
    permissions.set(['can_view_breeds']);
    await fixture.whenStable();
    expect(page.querySelector('.page-heading .primary')).toBeNull();
    expect(page.querySelector('.edit')).toBeNull();

    const filter = page.querySelector<HTMLSelectElement>('.status-filter select')!;
    filter.value = 'inactive';
    filter.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    await load('inactive', []);
    expect(page.textContent).toContain('No hay razas que coincidan');
  });

  it('creates a breed in a modal, validates custom ranges and retries with the same idempotency key', async () => {
    const form = await open('.page-heading .primary');
    fill('breed-name', '  Nueva raza  ');
    form.querySelectorAll('fieldset.stage')[1].querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click();
    await fixture.whenStable();
    fill('breed-adult-min', '1700,5');
    fill('breed-adult-max', '1600');
    submit(form);
    await fixture.whenStable();
    expect(form.querySelector('[role="alert"]')?.textContent).toContain('mínimo positivo');
    http.expectNone((request) => request.method === 'POST');
    fill('breed-adult-max', '2100');
    submit(form);
    const save = http.expectOne({ method: 'POST', url: '/api/v1/breeds' });
    expect(save.request.body).toEqual({
      name: 'Nueva raza', status: 'active', adult_min_weight_g: '1700.5', adult_max_weight_g: '2100',
    });
    const key = save.request.headers.get('Idempotency-Key');
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    save.error(new ProgressEvent('error'));
    await fixture.whenStable();
    expect(page.querySelector('dialog[open]')).not.toBeNull();
    expect(form.querySelector('fieldset.editor')?.matches(':disabled')).toBe(true);
    submit(form);
    const retry = http.expectOne({ method: 'POST', url: '/api/v1/breeds' });
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush({}, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    await load();
    expect(page.querySelector('dialog[open]')).toBeNull();
    expect(page.querySelector('.success')?.textContent).toContain('Raza creada');
  });

  it('restores inheritance with two nulls and protects edits with the original version', async () => {
    const form = await open('.edit');
    const adult = form.querySelectorAll('fieldset.stage')[1];
    expect(adult.querySelector<HTMLInputElement>('#breed-adult-min')?.value).toBe('1750.0');
    adult.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
    await fixture.whenStable();
    submit(form);
    const save = http.expectOne({ method: 'PATCH', url: '/api/v1/breeds/7' });
    expect(save.request.body).toEqual({ version: 3, adult_min_weight_g: null, adult_max_weight_g: null });
    save.flush({ detail: 'La versión del catálogo cambió. Actualiza los datos.' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    await load(undefined, [{ ...breed, version: 4 }]);
    expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(form.querySelector('[role="alert"]')?.textContent).toContain('La raza cambió');
  });
});

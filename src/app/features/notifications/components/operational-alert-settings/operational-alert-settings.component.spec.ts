import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../../core/config/api.config';
import { OperationalAlert } from '../../interfaces/operational-alert';
import { OperationalAlertSettingsComponent } from './operational-alert-settings.component';

const vehicleRule: OperationalAlert = {
  tipo: 'vehicle_maintenance_plan_due', nombre: 'Plan preventivo de vehículo', modulo: 'vehicles', unidad_productiva_id: null,
  configuracion: { habilitada: true, urgencia_fija: null, dias_anticipacion: 30, kilometros_anticipacion: 500 },
  campos: [
    { clave: 'habilitada', etiqueta: 'Habilitada', tipo: 'booleano' },
    { clave: 'urgencia_fija', etiqueta: 'Urgencia fija', tipo: 'seleccion', opciones: [null, 'bajo', 'medio', 'alto'] },
    { clave: 'dias_anticipacion', etiqueta: 'Días de aviso antes del vencimiento', tipo: 'entero', minimo: 0, maximo: 365 },
    { clave: 'kilometros_anticipacion', etiqueta: 'Kilómetros de aviso antes del límite', tipo: 'entero', minimo: 0, maximo: 1000000 },
  ],
};
const houseRule: OperationalAlert = {
  tipo: 'poultry_house_over_capacity', nombre: 'Galpón por encima de su capacidad', modulo: 'farm_structure', unidad_productiva_id: 7,
  configuracion: { habilitada: true, urgencia_fija: null, dias_anticipacion: 7, exceso_minimo_aves: 1 },
  campos: [
    ...vehicleRule.campos.slice(0, 2),
    { clave: 'dias_anticipacion', etiqueta: 'Días de aviso antes de la adultez', tipo: 'entero', minimo: 0, maximo: 365 },
    { clave: 'exceso_minimo_aves', etiqueta: 'Exceso mínimo de aves', tipo: 'entero', minimo: 1, maximo: 2147483647 },
  ],
};

describe('OperationalAlertSettingsComponent', () => {
  let fixture: ComponentFixture<OperationalAlertSettingsComponent>;
  let page: HTMLElement;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OperationalAlertSettingsComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OperationalAlertSettingsComponent);
    page = fixture.nativeElement as HTMLElement;
  });
  afterEach(() => http.verify());

  async function load(rule: OperationalAlert, extra: OperationalAlert[] = []) {
    fixture.componentRef.setInput('module', rule.modulo);
    fixture.componentRef.setInput('unitId', rule.unidad_productiva_id);
    await fixture.whenStable();
    const scope = rule.unidad_productiva_id === null ? '' : `unidades-productivas/${rule.unidad_productiva_id}/`;
    http.expectOne('/api/v1/' + scope + 'configuracion-alertas').flush({ data: [rule, ...extra] });
    await fixture.whenStable();
  }

  async function edit(rule: OperationalAlert) {
    page.querySelector<HTMLButtonElement>('#edit-' + rule.tipo)!.click();
    await fixture.whenStable();
    return page.querySelector<HTMLFormElement>('form')!;
  }

  function submit(form: HTMLFormElement) {
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  it('lists only the matching module and scope and patches only the fields changed in the form', async () => {
    await load(vehicleRule, [houseRule]);
    expect(page.textContent).not.toContain(houseRule.nombre);
    const form = await edit(vehicleRule);
    form.querySelector<HTMLInputElement>('[name="dias_anticipacion"]')!.value = '14';
    form.querySelector<HTMLSelectElement>('[name="urgencia_fija"]')!.value = 'medio';
    submit(form);
    const request = http.expectOne('/api/v1/configuracion-alertas/' + vehicleRule.tipo);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ dias_anticipacion: 14, urgencia_fija: 'medio' });
    request.flush({ data: { ...vehicleRule, configuracion: { ...vehicleRule.configuracion, ...request.request.body } } });
    await fixture.whenStable();
    expect(page.querySelector('form')).toBeNull();
    expect(page.textContent).toContain('Urgencia fija · Media');
    expect(page.textContent).toContain('Cambios guardados');
  });

  it('accepts zero days and disabling, validates integer limits, and preserves a rejected draft', async () => {
    await load(vehicleRule);
    const form = await edit(vehicleRule);
    form.querySelector<HTMLInputElement>('[name="dias_anticipacion"]')!.value = '-1';
    submit(form);
    await fixture.whenStable();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('entre 0 y 365');
    http.expectNone((request) => request.method === 'PATCH');

    form.querySelector<HTMLInputElement>('[name="dias_anticipacion"]')!.value = '0';
    form.querySelector<HTMLInputElement>('[name="habilitada"]')!.checked = false;
    submit(form);
    const request = http.expectOne('/api/v1/configuracion-alertas/' + vehicleRule.tipo);
    expect(request.request.body).toEqual({ habilitada: false, dias_anticipacion: 0 });
    request.flush({}, { status: 422, statusText: 'Invalid' });
    await fixture.whenStable();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Revisá los valores');
    expect(form.querySelector<HTMLInputElement>('[name="dias_anticipacion"]')?.value).toBe('0');
    expect(form.querySelector<HTMLInputElement>('[name="habilitada"]')?.checked).toBe(false);
  });

  it('binds installations to their original unit and ignores a late save after scope changes', async () => {
    await load(houseRule);
    const form = await edit(houseRule);
    form.querySelector<HTMLInputElement>('[name="exceso_minimo_aves"]')!.value = '10';
    submit(form);
    const request = http.expectOne('/api/v1/unidades-productivas/7/configuracion-alertas/' + houseRule.tipo);
    expect(request.request.body).toEqual({ exceso_minimo_aves: 10 });

    fixture.componentRef.setInput('unitId', 9);
    await fixture.whenStable();
    http.expectOne('/api/v1/unidades-productivas/9/configuracion-alertas').flush({ data: [{ ...houseRule, unidad_productiva_id: 9 }] });
    await fixture.whenStable();
    request.flush({ data: { ...houseRule, configuracion: { ...houseRule.configuracion, exceso_minimo_aves: 10 } } });
    await fixture.whenStable();
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('.success')).toBeNull();
    expect(page.textContent).toContain('Exceso mínimo de aves 1');
  });

  it('retries a failed catalog and allows returning from fixed urgency to automatic', async () => {
    fixture.componentRef.setInput('module', 'vehicles');
    fixture.componentRef.setInput('unitId', null);
    await fixture.whenStable();
    http.expectOne('/api/v1/configuracion-alertas').flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar');
    (page.querySelector('ion-button') as HTMLElement).click();
    await fixture.whenStable();
    const rule = { ...vehicleRule, configuracion: { ...vehicleRule.configuracion, urgencia_fija: 'alto' as const } };
    http.expectOne('/api/v1/configuracion-alertas').flush({ data: [rule] });
    await fixture.whenStable();
    const form = await edit(rule);
    form.querySelector<HTMLSelectElement>('[name="urgencia_fija"]')!.value = '';
    submit(form);
    const request = http.expectOne('/api/v1/configuracion-alertas/' + rule.tipo);
    expect(request.request.body).toEqual({ urgencia_fija: null });
    request.flush({ data: vehicleRule });
    await fixture.whenStable();
    expect(page.textContent).toContain('Urgencia automática');
  });
});

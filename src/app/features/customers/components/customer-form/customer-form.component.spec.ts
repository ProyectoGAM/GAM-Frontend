import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { AuthUser } from '../../../../core/auth/auth.types';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { CustomerInput } from '../../interfaces/customer';
import { CustomersApi } from '../../services/customers.api';
import { CustomerFormComponent } from './customer-form.component';

describe('CustomerFormComponent', () => {
  const user = signal<AuthUser | null>(null);
  const api = { create: vi.fn((_body: CustomerInput, _key: string) => of({ data: { id: 'client', display_name: 'Cliente', status: 'active' as const, has_location: false, ready_for_delivery: false, created_at: '', updated_at: '' } })) };
  let component: CustomerFormComponent;
  beforeEach(() => {
    api.create.mockReset(); api.create.mockReturnValue(of({ data: { id: 'client', display_name: 'Cliente', status: 'active', has_location: false, ready_for_delivery: false, created_at: '', updated_at: '' } }));
    user.set({ id: 1, name: 'Admin', email: 'test@example.test', roles: ['admin'], permissions: [], deleted_at: null });
    TestBed.configureTestingModule({ providers: [{ provide: AuthStore, useValue: { user, session: signal(null) } }, { provide: CustomersApi, useValue: api }, { provide: ProductionUnitsService, useValue: { departments: () => of([]) } }] });
    component = TestBed.runInInjectionContext(() => new CustomerFormComponent());
    component.ngOnInit();
  });

  it('creates an optional-data profile without fiscal identifiers or location', async () => {
    await component.submit();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: '', document_number: '', locality_id: null }), expect.any(String));
  });
  it('requires document and coordinate pairs before sending', async () => {
    component.form.controls.document_type.setValue('RUT'); await component.submit();
    expect(api.create).not.toHaveBeenCalled(); expect(component.error()).toContain('documento');
    component.form.controls.document_type.reset(); component.form.controls.latitude.setValue('-34.8'); await component.submit();
    expect(api.create).not.toHaveBeenCalled(); expect(component.error()).toContain('coordenadas');
  });
  it('reuses the original profile and key after a lost response', async () => {
    api.create.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    component.form.controls.name.setValue('Primero'); await component.submit();
    const original = api.create.mock.calls[0]; component.form.controls.name.setValue('Cambio posterior'); await component.submit();
    expect(api.create.mock.calls[1]).toEqual(original);
  });
  it('blocks submission after the actor changes', async () => {
    user.set(null); await component.submit(); expect(api.create).not.toHaveBeenCalled();
  });
});

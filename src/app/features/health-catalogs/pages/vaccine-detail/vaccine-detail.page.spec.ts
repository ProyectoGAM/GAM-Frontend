import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { HealthCatalogsApi } from '../../services/health-catalogs.api';
import { vaccineItem } from '../../testing/health-catalog-fixtures';
import { VaccineDetailPage } from './vaccine-detail.page';

describe('Vaccine detail', () => {
  it('loads public IDs, renders catalogue data and preserves the list filters on return', async () => {
    const admin = signal(true);
    const params = new BehaviorSubject(convertToParamMap({ id: vaccineItem.id }));
    const vaccine = vi.fn().mockReturnValue(of({ ...vaccineItem, vaccine: { ...vaccineItem.vaccine!, details: 'Información adicional' } }));
    const fixture = TestBed.configureTestingModule({ imports: [VaccineDetailPage], providers: [
      provideRouter([]), { provide: AuthStore, useValue: { user: () => ({ id: 1 }), isAdmin: admin } },
      { provide: HealthCatalogsApi, useValue: { vaccine } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: params.value, queryParamMap: convertToParamMap({ buscar: 'VAC', page: 2 }) }, paramMap: params } },
    ] }).createComponent(VaccineDetailPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(vaccine).toHaveBeenCalledWith(vaccineItem.id);
    expect(fixture.nativeElement.textContent).toContain('Información adicional');
    expect(fixture.nativeElement.querySelector('.back').getAttribute('href')).toContain('buscar=VAC&page=2');
    params.next(convertToParamMap({ id: 'invalid' })); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(vaccine).toHaveBeenCalledTimes(1); expect(fixture.nativeElement.textContent).toContain('No se encontró');
    admin.set(false); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.record()).toBeNull(); fixture.destroy();
  });

  it('shows a read failure without fabricating a vaccine and can retry', async () => {
    const params = new BehaviorSubject(convertToParamMap({ id: vaccineItem.id }));
    const vaccine = vi.fn().mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 }))).mockReturnValue(of(vaccineItem));
    const fixture = TestBed.configureTestingModule({ imports: [VaccineDetailPage], providers: [
      provideRouter([]), { provide: AuthStore, useValue: { user: () => ({ id: 1 }), isAdmin: () => true } },
      { provide: HealthCatalogsApi, useValue: { vaccine } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: params.value, queryParamMap: convertToParamMap({}) }, paramMap: params } },
    ] }).createComponent(VaccineDetailPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.record()).toBeNull(); expect(fixture.nativeElement.textContent).toContain('No se encontró');
    await fixture.componentInstance.load(); fixture.detectChanges();
    expect(fixture.componentInstance.record()?.id).toBe(vaccineItem.id); fixture.destroy();
  });
});

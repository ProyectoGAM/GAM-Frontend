import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { DeliveriesApi } from '../deliveries.api';
import { DeliveryStopCorrectionComponent } from './delivery-stop-correction.component';

describe('Delivery stop correction', () => {
  it('replays an uncertain correction with exactly the same key and version', async () => {
    const rectifyStop = vi.fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValueOnce(of({ data: { despues: { saldo_huevos: 0 } } }));
    await TestBed.configureTestingModule({
      imports: [DeliveryStopCorrectionComponent],
      providers: [{ provide: DeliveriesApi, useValue: { rectifyStop } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(DeliveryStopCorrectionComponent);
    fixture.componentRef.setInput('delivery', { id: 'reparto-1', status: 'active', remaining_quantity: -6 });
    fixture.componentRef.setInput('stop', { id: 7, version: 3, client_name: 'Ombú', delivered_quantity: 12,
      items: [{ amount: '2', label: 'Media docena', eggs_per_unit: 6, eggs: 12 }] });
    const refreshed = vi.fn();
    fixture.componentInstance.refreshed.subscribe(refreshed);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector('input')!;
    input.value = '1';
    input.dispatchEvent(new Event('input'));
    const reason = element.querySelector('textarea')!;
    reason.value = 'Cantidad confirmada por el cliente';
    reason.dispatchEvent(new Event('input'));
    const form = element.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(element.textContent).toContain('Reintentar envío');
    expect(input.disabled || input.closest('fieldset')?.disabled).toBe(true);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(rectifyStop).toHaveBeenCalledTimes(2);
    expect(rectifyStop.mock.calls[0]).toEqual(rectifyStop.mock.calls[1]);
    expect(rectifyStop.mock.calls[0].slice(0, 3)).toEqual(['reparto-1', 7, {
      version: 3, motivo: 'Cantidad confirmada por el cliente', lineas: [{ indice: 0, cantidad: '1' }],
    }]);
    expect(refreshed).toHaveBeenCalledWith(expect.stringContaining('saldo del reparto quedó en cero'));
  });
});

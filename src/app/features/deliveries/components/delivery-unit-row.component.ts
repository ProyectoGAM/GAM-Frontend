import { Component, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { DeliveryUnitBalanceRow } from '../delivery.models';

@Component({
  selector: 'app-delivery-unit-row',
  imports: [ReactiveFormsModule],
  template: `
    <div class="delivery-unit-row">
      <strong>{{ row().label }}</strong>
      <div class="unit-stepper">
        <button type="button" (click)="decrease.emit()" [disabled]="!canDecrease()" [attr.aria-label]="'Quitar ' + row().label">−</button>
        <input type="text" inputmode="decimal" [formControl]="quantity()" (input)="amountChanged.emit($event)" [attr.aria-label]="'Cantidad entregada de ' + row().label">
        <button type="button" (click)="increase.emit()" [disabled]="!canIncrease()" [attr.aria-label]="'Agregar ' + row().label">+</button>
      </div>
      <label [for]="'price-' + row().unit + '-' + row().eggs_per_unit">Precio unitario (UYU)
        <input [id]="'price-' + row().unit + '-' + row().eggs_per_unit" type="text" inputmode="numeric" [formControl]="price()" placeholder="Pesos enteros">
      </label>
    </div>
  `,
  styles: `
    :host{display:block}.delivery-unit-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 0;color:var(--gam-color-text)}strong{color:var(--gam-color-heading)}.unit-stepper{display:flex;gap:5px;align-items:center}button{width:40px;min-height:40px;border:1px solid var(--gam-color-control-border);border-radius:7px;background:var(--gam-color-primary-soft);color:var(--gam-color-heading);font:inherit;font-size:20px}input{min-height:44px;width:84px;box-sizing:border-box;border:1px solid var(--gam-color-control-border);border-radius:7px;background:var(--gam-color-surface);color:var(--gam-color-text);font:inherit;padding:8px}.unit-stepper input{text-align:center}label{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;color:var(--gam-color-text-muted);font-size:13px}label input{width:130px}button:disabled{opacity:.5}button:focus-visible,input:focus-visible{outline:2px solid var(--gam-color-focus);outline-offset:2px}
  `,
})
export class DeliveryUnitRowComponent {
  readonly row = input.required<DeliveryUnitBalanceRow>();
  readonly quantity = input.required<FormControl<string>>();
  readonly price = input.required<FormControl<string>>();
  readonly canIncrease = input(false);
  readonly canDecrease = input(false);
  readonly amountChanged = output<Event>();
  readonly increase = output<void>();
  readonly decrease = output<void>();
}

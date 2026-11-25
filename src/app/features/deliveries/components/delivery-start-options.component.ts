import { Component, ElementRef, Injector, afterNextRender, afterRenderEffect, inject, input, output, viewChild, viewChildren } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, chevronForwardOutline, cubeOutline, refreshOutline, trashOutline } from 'ionicons/icons';

import { parseUyuAmount, uyuDecimal } from '../../../shared/utils/uyu-money';
import { VehicleOption } from '../../vehicles/interfaces/vehicle';
import { DeliveryProductionUnit, DeliveryUnit } from '../delivery.models';
import type { DeliveryStartMode, LoadForm } from '../types/delivery-load-form.type';

@Component({
  selector: 'app-delivery-start-options',
  templateUrl: './delivery-start-options.component.html',
  styleUrl: './delivery-start-options.component.scss',
  imports: [IonIcon, IonSpinner, ReactiveFormsModule],
})
export class DeliveryStartOptionsComponent {
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('startHeading');
  private readonly presentationFields = viewChildren<ElementRef<HTMLSelectElement>>('presentationField');
  readonly mode = input<DeliveryStartMode | null>(null);
  readonly startForm = input.required<LoadForm>();
  readonly startTotal = input(0);
  readonly units = input<readonly DeliveryUnit[]>([]);
  readonly productionUnits = input<readonly DeliveryProductionUnit[]>([]);
  readonly canContinue = input(false);
  readonly availableVehicles = input<readonly VehicleOption[]>([]);
  readonly selectedVehicleId = input('');
  readonly warnings = input<readonly string[]>([]);
  readonly startOdometer = input.required<FormControl<string>>();
  readonly online = input(false);
  readonly refreshingVehicles = input(false);
  readonly selectedVehicleIdChange = output<string>();
  readonly refreshRequested = output<void>();
  readonly modeChange = output<DeliveryStartMode | null>();
  readonly addPresentation = output<void>();
  readonly removePresentation = output<number>();
  readonly continueRequested = output<void>();

  constructor() {
    addIcons({ addOutline, arrowBackOutline, chevronForwardOutline, cubeOutline, refreshOutline, trashOutline });
    afterRenderEffect(() => this.heading()?.nativeElement.focus({ preventScroll: true }));
  }

  selectVehicle(event: Event): void {
    this.selectedVehicleIdChange.emit((event.target as HTMLSelectElement).value);
  }

  addLine(): void {
    const index = this.startForm().controls.items.length;
    this.addPresentation.emit();
    this.focusPresentation(index);
  }

  removeLine(index: number): void {
    this.removePresentation.emit(index);
    this.focusPresentation(Math.min(index, this.startForm().controls.items.length - 1));
  }

  private focusPresentation(index: number): void {
    afterNextRender(() => this.presentationFields()[index]?.nativeElement.focus(), { injector: this.injector });
  }

  canDecreaseStartAmount(amount: string): boolean {
    return (parseUyuAmount(amount) ?? 0n) > 0n;
  }

  stepStartAmount(amount: FormControl<string>, direction: -1 | 1): void {
    const next = (parseUyuAmount(amount.value) ?? 0n) + BigInt(direction) * 1000n;
    if (next > 9_999_999_999_999n) return;
    const [whole, fraction] = uyuDecimal(next > 0n ? next : 0n).split('.');
    const decimals = fraction.replace(/0+$/, '');
    amount.setValue(decimals ? `${whole},${decimals}` : whole);
    amount.markAsDirty();
  }
}

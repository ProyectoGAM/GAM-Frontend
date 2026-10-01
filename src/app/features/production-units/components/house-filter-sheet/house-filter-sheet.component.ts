import { Component, ElementRef, ViewChild, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

import { ProductionUnit } from '../../interfaces/production-unit.interface';
import {
  HouseOccupancyFilter, HouseStatusFilter, houseOccupancyOptions, houseStatusOptions,
} from '../../types/house-filter.type';

@Component({
  selector: 'app-house-filter-sheet',
  templateUrl: './house-filter-sheet.component.html',
  styleUrl: './house-filter-sheet.component.scss',
  imports: [IonIcon],
})
export class HouseFilterSheetComponent {
  @ViewChild('dialog', { static: true }) private readonly dialog!: ElementRef<HTMLDialogElement>;

  readonly isFeedList = input.required<boolean>();
  readonly globalUnitId = input<number | null>(null);
  readonly globalUnitName = input('UP seleccionada');
  readonly availableUnits = input<readonly ProductionUnit[]>([]);
  readonly draftUnitId = input<number | null>(null);
  readonly draftStatus = input<HouseStatusFilter>('all');
  readonly draftOccupancy = input<HouseOccupancyFilter>('all');
  readonly draftResultCount = input(0);
  readonly unitChanged = output<number | null>();
  readonly statusChanged = output<HouseStatusFilter>();
  readonly occupancyChanged = output<HouseOccupancyFilter>();
  readonly clearRequested = output<void>();
  readonly applyRequested = output<void>();
  readonly statusOptions = houseStatusOptions;
  readonly occupancyOptions = houseOccupancyOptions;

  private returnFocusTo: HTMLElement | null = null;

  constructor() {
    addIcons({ closeOutline });
  }

  open(trigger?: HTMLElement | null): void {
    this.returnFocusTo = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!this.dialog.nativeElement.open) this.dialog.nativeElement.showModal();
  }

  close(): void {
    if (this.dialog.nativeElement.open) this.dialog.nativeElement.close();
    if (this.returnFocusTo?.isConnected) this.returnFocusTo.focus();
    this.returnFocusTo = null;
  }

  onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  onUnitChange(value: string): void {
    this.unitChanged.emit(value === '' ? null : Number(value));
  }
}

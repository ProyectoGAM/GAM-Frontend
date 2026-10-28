import { Component, ViewChild, input, output } from '@angular/core';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';

import { ProductionUnit } from '../../interfaces/production-unit.interface';
import {
  HouseOccupancyFilter, HouseStatusFilter, houseOccupancyOptions, houseStatusOptions,
} from '../../types/house-filter.type';

@Component({
  selector: 'app-house-filter-sheet',
  templateUrl: './house-filter-sheet.component.html',
  styleUrl: './house-filter-sheet.component.scss',
  imports: [FilterDialogComponent],
})
export class HouseFilterSheetComponent {
  @ViewChild(FilterDialogComponent, { static: true }) private readonly dialog!: FilterDialogComponent;

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

  open(trigger?: HTMLElement | null): void {
    this.dialog.open(trigger);
  }

  close(): void {
    this.dialog.close();
  }

  onUnitChange(value: string): void {
    this.unitChanged.emit(value === '' ? null : Number(value));
  }
}

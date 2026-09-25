import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonButton, IonSpinner } from '@ionic/angular';

import { PoultryHouseListItem } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';
import { ProductionUnitHouseCardComponent } from '../../components/production-unit-house-card/production-unit-house-card.component';

type ListState = 'loading' | 'success' | 'empty' | 'error' | 'offline' | 'forbidden';

@Component({
  selector: 'app-poultry-houses-list-page',
  templateUrl: './poultry-houses-list.page.html',
  styleUrl: './poultry-houses-list.page.scss',
  imports: [IonButton, IonSpinner, ProductionUnitHouseCardComponent, RouterLink],
})
export class PoultryHousesListPage implements OnInit {
  private readonly service = inject(ProductionUnitsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = signal<ListState>('loading');
  readonly houses = signal<PoultryHouseListItem[]>([]);
  readonly activeHouses = computed(() => this.houses().filter((house) => house.status !== 'inactive'));
  readonly inactiveHouses = computed(() => this.houses().filter((house) => house.status === 'inactive'));

  ngOnInit(): void {
    this.load();
  }

  retry(): void {
    this.load();
  }

  private load(): void {
    this.state.set('loading');
    this.service.listAllPoultryHouses().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (houses) => {
        this.houses.set(houses);
        this.state.set(houses.length ? 'success' : 'empty');
      },
      error: (error: unknown) => this.state.set(this.errorState(error)),
    });
  }

  private errorState(error: unknown): ListState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 0) return 'offline';
    }

    return 'error';
  }
}

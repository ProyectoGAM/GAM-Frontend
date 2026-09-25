import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular';

import { PoultryHouse, PoultryHouseDetail as PoultryHouseDetailData } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';

type DetailState = 'loading' | 'success' | 'offline' | 'forbidden' | 'notFound' | 'error';

const birdCapacityFormatter = new Intl.NumberFormat('es-UY');

@Component({
  selector: 'app-poultry-house-detail-page',
  templateUrl: './poultry-house-detail.page.html',
  styleUrl: './poultry-house-detail.page.scss',
  imports: [IonButton, IonIcon, IonSpinner, RouterLink],
})
export class PoultryHouseDetailPage implements OnInit {
  private readonly service = inject(ProductionUnitsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly unitId = Number(this.route.snapshot.paramMap.get('id'));
  readonly state = signal<DetailState>('loading');
  readonly house = signal<PoultryHouseDetailData | null>(null);
  readonly capacityLabel = computed(() => {
    const house = this.house();
    if (!house || house.type !== 'poultry') return 'No aplica';
    if (house.bird_capacity === null) return 'No disponible';
    return `${birdCapacityFormatter.format(house.bird_capacity)} aves`;
  });

  constructor() {
    addIcons({ arrowBackOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  retry(): void {
    this.load();
  }

  houseStatus(status: PoultryHouse['status']): string {
    return ({
      operational: 'Operativo',
      maintenance: 'En mantenimiento',
      out_of_service: 'Fuera de servicio',
      inactive: 'Inactivo',
    })[status];
  }

  private load(): void {
    const unitId = this.unitId;
    const houseId = Number(this.route.snapshot.paramMap.get('houseId'));
    if (!Number.isInteger(unitId) || unitId < 1 || !Number.isInteger(houseId) || houseId < 1) {
      this.house.set(null);
      this.state.set('notFound');
      return;
    }

    this.state.set('loading');
    this.house.set(null);
    this.service.getPoultryHouseById(houseId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        if (data.production_unit_id !== unitId) {
          this.house.set(null);
          this.state.set('notFound');
          return;
        }
        this.house.set(data);
        this.state.set('success');
      },
      error: (error: unknown) => this.state.set(this.errorState(error)),
    });
  }

  private errorState(error: unknown): DetailState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 404) return 'notFound';
      if (error.status === 0) return 'offline';
    }

    return 'error';
  }
}

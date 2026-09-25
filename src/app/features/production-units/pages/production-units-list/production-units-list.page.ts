import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { locationOutline } from 'ionicons/icons';
import { IonButton, IonCard, IonCardContent, IonIcon, IonSpinner } from '@ionic/angular';

import { ProductionUnit } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';

type ListState = 'loading' | 'success' | 'empty' | 'error' | 'offline' | 'forbidden';

@Component({
  selector: 'app-production-units-list-page',
  templateUrl: './production-units-list.page.html',
  styleUrl: './production-units-list.page.scss',
  imports: [IonButton, IonCard, IonCardContent, IonIcon, IonSpinner, RouterLink],
})
export class ProductionUnitsListPage implements OnInit {
  private readonly service = inject(ProductionUnitsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = signal<ListState>('loading');
  readonly units = signal<ProductionUnit[]>([]);
  readonly activeUnits = computed(() => this.units().filter((unit) => unit.status === 'active'));
  readonly inactiveUnits = computed(() => this.units().filter((unit) => unit.status === 'inactive'));

  constructor() {
    addIcons({ locationOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  retry(): void {
    this.load();
  }

  private load(): void {
    this.state.set('loading');
    this.service.listAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (units) => {
        this.units.set(units);
        this.state.set(units.length ? 'success' : 'empty');
      },
      error: (error: unknown) => {
        this.state.set(this.errorState(error));
      },
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

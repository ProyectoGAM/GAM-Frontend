import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { arrowBackOutline, eggOutline, informationCircleOutline, locationOutline, pencilOutline, powerOutline } from 'ionicons/icons';
import { AlertController, IonButton, IonCard, IonCardContent, IonIcon, IonSpinner } from '@ionic/angular';

import { PoultryHouse, ProductionUnit } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';

type PageState = 'loading' | 'success' | 'offline' | 'forbidden' | 'error';

@Component({
  selector: 'app-production-unit-detail-page',
  templateUrl: './production-unit-detail.page.html',
  styleUrl: './production-unit-detail.page.scss',
  imports: [IonButton, IonCard, IonCardContent, IonIcon, IonSpinner, RouterLink],
})
export class ProductionUnitDetailPage implements OnInit {
  private readonly service = inject(ProductionUnitsService);
  private readonly route = inject(ActivatedRoute);
  private readonly alertController = inject(AlertController);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = signal<PageState>('loading');
  readonly unit = signal<ProductionUnit | null>(null);
  readonly houses = signal<PoultryHouse[]>([]);
  readonly housesState = signal<'loading' | 'success' | 'empty' | 'error'>('loading');
  readonly isChangingStatus = signal(false);
  readonly statusError = signal<string | null>(null);
  readonly isTooltipOpen = signal(false);
  readonly canChangeStatus = computed(() => {
    const unit = this.unit();
    if (!unit) return false;
    return unit.status === 'inactive'
      || (['success', 'empty'].includes(this.housesState()) && this.houses().every((house) => house.status === 'inactive'));
  });
  readonly statusBlockReason = computed(() => {
    if (this.housesState() === 'loading') return 'Esperá a que se carguen los galpones para inhabilitar la unidad.';
    if (this.housesState() === 'error') return 'No se pudo comprobar el estado de los galpones.';
    return 'Para inhabilitar la unidad, todos sus galpones deben estar inactivos.';
  });
  readonly unitId = computed(() => Number(this.route.snapshot.paramMap.get('id')));

  constructor() {
    addIcons({ arrowBackOutline, eggOutline, informationCircleOutline, locationOutline, pencilOutline, powerOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const id = this.unitId();
    if (!Number.isInteger(id) || id < 1) { this.state.set('error'); return; }
    this.state.set('loading');
    this.service.getById(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        this.unit.set(data);
        this.state.set('success');
        this.loadHouses(id);
      },
      error: (error: unknown) => this.state.set(this.errorState(error)),
    });
  }

  houseStatus(status: PoultryHouse['status']): string {
    return ({ operational: 'Operativo', maintenance: 'En mantenimiento', out_of_service: 'Fuera de servicio', inactive: 'Inactivo' })[status];
  }

  async changeStatus(): Promise<void> {
    const currentUnit = this.unit();
    if (!currentUnit || this.isChangingStatus()) return;
    const nextStatus = currentUnit.status === 'active' ? 'inactive' : 'active';
    if (nextStatus === 'inactive' && !this.canChangeStatus()) return;

    if (nextStatus === 'inactive') {
      const alert = await this.alertController.create({
        header: 'Inhabilitar unidad productiva',
        message: `“${currentUnit.name}” pasará al grupo de unidades inactivas. Podrás habilitarla nuevamente desde su ficha.`,
        buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Inhabilitar', role: 'confirm' }],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;
    }

    this.isChangingStatus.set(true);
    this.statusError.set(null);
    this.service.updateStatus(currentUnit.id, nextStatus).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        this.unit.set({ ...currentUnit, ...data, status: nextStatus });
        this.isChangingStatus.set(false);
        this.isTooltipOpen.set(false);
      },
      error: (error: unknown) => {
        this.isChangingStatus.set(false);
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.statusError.set('El estado de la unidad o de sus galpones cambió. Revisá los datos e intentá nuevamente.');
          this.load();
        } else {
          this.statusError.set('No se pudo cambiar el estado. Intentá nuevamente.');
        }
      },
    });
  }

  toggleTooltip(): void {
    this.isTooltipOpen.update((open) => !open);
  }

  private loadHouses(id: number): void {
    this.housesState.set('loading');
    this.service.poultryHouses(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (houses) => { this.houses.set(houses); this.housesState.set(houses.length ? 'success' : 'empty'); },
      error: () => this.housesState.set('error'),
    });
  }

  private errorState(error: unknown): PageState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 0) return 'offline';
    }
    return 'error';
  }
}

import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { arrowBackOutline, eggOutline, informationCircleOutline, locationOutline, pencilOutline, trashOutline } from 'ionicons/icons';
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
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = signal<PageState>('loading');
  readonly unit = signal<ProductionUnit | null>(null);
  readonly houses = signal<PoultryHouse[]>([]);
  readonly housesState = signal<'loading' | 'success' | 'empty' | 'error'>('loading');
  readonly isArchiving = signal(false);
  readonly archiveError = signal(false);
  readonly isTooltipOpen = signal(false);
  readonly canArchive = computed(() => ['success', 'empty'].includes(this.housesState()) && this.houses().every((house) => house.status === 'inactive'));
  readonly archiveReason = computed(() => this.housesState() === 'success'
    ? 'Para eliminar la unidad, todos sus galpones deben estar inactivos.'
    : 'No se pudo comprobar que todos los galpones estén inactivos.');
  readonly unitId = computed(() => Number(this.route.snapshot.paramMap.get('id')));

  constructor() {
    addIcons({ arrowBackOutline, eggOutline, informationCircleOutline, locationOutline, pencilOutline, trashOutline });
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

  async archive(): Promise<void> {
    if (!this.canArchive() || this.isArchiving()) return;
    const alert = await this.alertController.create({
      header: 'Eliminar unidad productiva',
      message: `La unidad “${this.unit()?.name ?? ''}” se archivará y dejará de aparecer en el listado.` ,
      buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Eliminar', role: 'confirm' }],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'confirm') return;
    this.isArchiving.set(true);
    this.archiveError.set(false);
    this.service.archive(this.unitId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.isArchiving.set(false); void this.router.navigateByUrl('/administracion/ubicaciones/unidades-productivas'); },
      error: () => { this.isArchiving.set(false); this.archiveError.set(true); },
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

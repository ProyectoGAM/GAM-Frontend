import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { buildOutline, checkmarkOutline } from 'ionicons/icons';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PoultryHouseDetail } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';
import { canManageMaintenance, maintenanceError } from '../../services/maintenance-presentation';

@Component({
  selector: 'app-installation-maintenance-status',
  imports: [IonButton, IonIcon],
  templateUrl: './installation-maintenance-status.component.html',
  styleUrl: './installation-maintenance-status.component.scss',
})
export class InstallationMaintenanceStatusComponent {
  private readonly api = inject(ProductionUnitsService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  readonly house = input.required<PoultryHouseDetail>();
  readonly disabled = input(false);
  readonly changed = output<PoultryHouseDetail>();
  readonly refreshRequested = output<string>();
  readonly busyChanged = output<boolean>();
  readonly saving = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');
  readonly canManage = computed(() => canManageMaintenance(this.auth.user()));
  readonly blockedByUnit = computed(() => this.house().status !== 'operational' && this.house().production_unit.status !== 'active');
  readonly actionLabel = computed(() => this.house().status !== 'operational'
    ? `Marcar como ${this.house().type === 'feed' ? 'operativa' : 'operativo'}` : 'Poner en mantenimiento');

  constructor() { addIcons({ buildOutline, checkmarkOutline }); }

  toggle(): void {
    if (!this.canManage() || this.blockedByUnit() || this.saving() || this.disabled()) return;
    const house = this.house();
    const actor = this.auth.user();
    const session = this.auth.session?.();
    const status = house.status === 'operational' ? 'maintenance' : 'operational';
    this.error.set(''); this.feedback.set(''); this.saving.set(true); this.busyChanged.emit(true);
    this.api.updatePoultryHouseStatus(house.id, status).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        this.saving.set(false); this.busyChanged.emit(false);
        if (this.house().id !== house.id || this.auth.user() !== actor || this.auth.session?.() !== session) return;
        this.changed.emit({ ...house, ...data });
        this.feedback.set(status === 'maintenance' ? 'Instalación en mantenimiento.' : 'Instalación operativa.');
      },
      error: (error: unknown) => {
        this.saving.set(false); this.busyChanged.emit(false);
        if (this.house().id !== house.id || this.auth.user() !== actor || this.auth.session?.() !== session) return;
        this.error.set(maintenanceError(error, 'No se pudo cambiar el estado. Volvé a intentarlo.'));
        if (error instanceof HttpErrorResponse && [404, 409].includes(error.status)) this.refreshRequested.emit(this.error());
      },
    });
  }
}

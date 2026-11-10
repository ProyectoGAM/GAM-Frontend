import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, buildOutline, calendarOutline, personOutline } from 'ionicons/icons';
import { EMPTY, Subject, catchError, switchMap } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { formatUyuMoney } from '../../../../shared/utils/uyu-money';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { InstallationMaintenanceStatusComponent } from '../../components/installation-maintenance-status/installation-maintenance-status.component';
import { MaintenanceRecordDialogComponent } from '../../components/maintenance-record-dialog/maintenance-record-dialog.component';
import { InstallationMaintenance, MaintenanceCostTotal, MaintenanceFilters } from '../../interfaces/installation-maintenance.interface';
import { PoultryHouseDetail } from '../../interfaces/production-unit.interface';
import { InstallationMaintenanceStatus } from '../../types/installation-maintenance.type';
import { InstallationMaintenanceService } from '../../services/installation-maintenance.service';
import { canManageMaintenance, maintenanceDateLabel, maintenanceError } from '../../services/maintenance-presentation';
import { ProductionUnitsService } from '../../services/production-units.service';

@Component({
  selector: 'app-installation-maintenances-page',
  imports: [RouterLink, ReactiveFormsModule, IonButton, IonIcon, IonSpinner, FilterDialogComponent, InstallationMaintenanceStatusComponent, MaintenanceRecordDialogComponent],
  templateUrl: './installation-maintenances.page.html',
  styleUrl: './installation-maintenances.page.scss',
})
export class InstallationMaintenancesPage implements OnInit {
  private readonly api = inject(InstallationMaintenanceService);
  private readonly installations = inject(ProductionUnitsService);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<void>();
  private readonly totalRequests = new Subject<void>();
  private houseGeneration = 0;
  private unitId = 0;
  private houseId = 0;
  private filters: MaintenanceFilters = {};
  readonly dialog = viewChild(MaintenanceRecordDialogComponent);
  private readonly dateDialog = viewChild(FilterDialogComponent);
  private readonly statusControl = viewChild(InstallationMaintenanceStatusComponent);
  readonly house = signal<PoultryHouseDetail | null>(null);
  readonly state = signal<'loading' | 'success' | 'error'>('loading');
  readonly pageError = signal('');
  readonly loading = signal(false);
  readonly historyError = signal('');
  readonly records = signal<InstallationMaintenance[]>([]);
  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly total = signal(0);
  readonly feedback = signal('');
  readonly statusError = signal('');
  readonly filterError = signal('');
  readonly hasFilters = signal(false);
  readonly costLoading = signal(false);
  readonly costError = signal('');
  readonly costTotals = signal<MaintenanceCostTotal[]>([]);
  readonly costLabels = computed(() => this.costTotals().map((total) => `${formatUyuMoney(total.amount)} ${total.currency}`));
  readonly statusLabel = computed(() => {
    const status = this.house()?.status;
    return status ? ({ operational: 'Operativo', maintenance: 'En mantenimiento', out_of_service: 'Fuera de servicio', inactive: 'Inactivo' })[status] : '';
  });
  readonly canManage = computed(() => canManageMaintenance(this.auth.user()));
  readonly fromMaintenanceHub = this.route.snapshot?.data?.['maintenanceHub'] === true;
  readonly installationLink = computed(() => ['/administracion/unidades-productivas', this.house()?.production_unit_id ?? this.unitId, 'galpon', this.house()?.id ?? this.houseId]);
  readonly backLink = computed(() => this.fromMaintenanceHub ? ['/administracion/ubicaciones/mantenimiento'] : this.installationLink());
  readonly backLabel = computed(() => this.fromMaintenanceHub ? 'Mantenimiento de instalaciones' : this.house()?.name ?? 'Volver a la instalación');
  readonly rows = computed(() => this.records().map((record) => ({ record, dateLabel: maintenanceDateLabel(record.maintenance_date), costLabel: `${formatUyuMoney(record.cost.amount)} ${record.cost.currency}` })));
  readonly filtersForm = new FormGroup({
    status: new FormControl<InstallationMaintenanceStatus | ''>('', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });
  readonly dateForm = new FormGroup({
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    addIcons({ addOutline, arrowBackOutline, buildOutline, calendarOutline, personOutline });
    this.totalRequests.pipe(switchMap(() => {
      this.costTotals.set([]); this.costError.set('');
      const house = this.house();
      this.costLoading.set(!!house);
      if (!house) return EMPTY;
      return this.api.totalCost(house.id).pipe(catchError(() => {
        this.costLoading.set(false); this.costError.set('No se pudo calcular el costo total de mantenimiento.');
        return EMPTY;
      }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe((totals) => {
      this.costTotals.set(totals); this.costLoading.set(false);
    });
    this.requests.pipe(switchMap(() => {
      const house = this.house(); if (!house) return EMPTY;
      this.loading.set(true); this.historyError.set(''); this.records.set([]);
      return this.api.list(house.id, this.filters, this.page()).pipe(catchError((error: unknown) => {
        this.loading.set(false); this.historyError.set(maintenanceError(error, 'No se pudo cargar el historial. Volvé a intentarlo.'));
        return EMPTY;
      }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe((response) => {
      this.records.set(response.data); this.lastPage.set(response.meta.last_page); this.total.set(response.meta.total); this.loading.set(false);
    });
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.unitId = Number(params.get('id')); this.houseId = Number(params.get('houseId'));
      this.filters = {}; this.filtersForm.reset(); this.hasFilters.set(false); this.page.set(1); this.feedback.set(''); this.statusError.set(''); this.records.set([]);
      this.loadHouse();
    });
  }

  loadHouse(): void {
    const generation = ++this.houseGeneration;
    this.house.set(null); this.requests.next(); this.totalRequests.next(); this.state.set('loading'); this.pageError.set('');
    if (!Number.isSafeInteger(this.unitId) || this.unitId < 1 || !Number.isSafeInteger(this.houseId) || this.houseId < 1) {
      this.state.set('error'); this.pageError.set('La instalación solicitada no es válida.'); return;
    }
    this.installations.getPoultryHouseById(this.houseId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        if (generation !== this.houseGeneration) return;
        if (data.production_unit_id !== this.unitId) {
          this.pageError.set('La instalación no pertenece a esta unidad productiva.'); this.state.set('error'); return;
        }
        this.house.set(data); this.state.set('success'); this.refreshHistory(); this.refreshCost();
      },
      error: (error: unknown) => {
        if (generation !== this.houseGeneration) return;
        this.state.set('error'); this.pageError.set(error instanceof HttpErrorResponse && error.status === 404
          ? 'No se encontró la instalación.' : maintenanceError(error, 'No se pudo cargar la instalación.'));
      },
    });
  }

  refreshHistory(): void { this.requests.next(); }

  refreshCost(): void { this.totalRequests.next(); }

  applyFilters(): void {
    const { status, from, to } = this.filtersForm.getRawValue();
    if (from && to && from > to) { this.filterError.set('La fecha hasta debe ser igual o posterior a la fecha desde.'); return; }
    this.filterError.set(''); this.filters = { status: status || undefined, date_from: from || undefined, date_to: to || undefined };
    this.hasFilters.set(!!(status || from || to)); this.dateDialog()?.close();
    this.page.set(1); this.refreshHistory();
  }

  clearFilters(): void { this.filtersForm.reset(); this.applyFilters(); }

  openDates(event: Event): void {
    this.dateForm.reset({ from: this.filters.date_from ?? '', to: this.filters.date_to ?? '' });
    this.filterError.set(''); this.dateDialog()?.open(event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
  }

  applyDates(): void {
    const dates = this.dateForm.getRawValue();
    if (dates.from && dates.to && dates.from > dates.to) { this.filterError.set('La fecha hasta debe ser igual o posterior a la fecha desde.'); return; }
    this.filtersForm.patchValue(dates); this.applyFilters();
  }

  clearDates(): void { this.dateForm.reset(); this.filterError.set(''); }

  goToPage(delta: number): void {
    const page = this.page() + delta;
    if (this.loading() || page < 1 || page > this.lastPage()) return;
    this.page.set(page); this.refreshHistory();
  }

  onChanged(message: string): void { this.feedback.set(message); this.page.set(1); this.refreshHistory(); this.refreshCost(); }

  openCreate(event: Event): void {
    this.dialog()?.openCreate(event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
  }

  canLeave(): boolean { return !this.dialog()?.saving() && !this.statusControl()?.saving(); }
}

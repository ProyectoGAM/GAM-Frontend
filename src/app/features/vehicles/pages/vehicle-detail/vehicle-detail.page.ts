import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, attachOutline, chevronBackOutline, closeOutline, createOutline, documentOutline, downloadOutline, lockClosedOutline, navigateOutline, refreshOutline, waterOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { Observable } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { VehicleEditorDialogComponent } from '../../components/vehicle-editor-dialog.component';
import { VehicleSummaryComponent } from '../../components/vehicle-summary.component';
import { VehicleDetail, VehicleDocument, VehicleDriverOption, VehicleInput, VehicleMaintenance, VehicleMaintenancePlan, VehicleReading, VehicleUsage } from '../../interfaces/vehicle';
import { VehiclesApi } from '../../services/vehicles.api';
import { VehicleStatus } from '../../types/vehicle.types';
import { formatUyuMoney } from '../../../../shared/utils/uyu-money';
import { formatFuelLiters, formatFuelVolume, formatVehicleMeasure, vehicleDocumentExpired, vehicleStatusLabel } from '../../vehicle-format';

interface TimelineEvent { at: string; title: string; detail: string; type: string; }
type UsageAction = 'start' | 'close' | 'reading';
type VehicleCommand = 'start' | 'reading' | 'fuel' | 'maintenance';
type MaintenanceDialog = { kind: 'plan'; plan?: VehicleMaintenancePlan }
  | { kind: 'create' }
  | { kind: 'complete' | 'cancel' | 'receipt'; intervention: VehicleMaintenance };

@Component({
  selector: 'app-vehicle-detail-page',
  imports: [DatePipe, IonIcon, NgTemplateOutlet, ReactiveFormsModule, RouterLink, VehicleEditorDialogComponent, VehicleSummaryComponent],
  templateUrl: './vehicle-detail.page.html',
  styleUrls: ['./vehicle-detail.page.scss', './vehicle-usage.scss', './vehicle-fuel.scss', './vehicle-maintenance.scss', './vehicle-documents.scss', '../../components/vehicle-dialog.scss'],
})
export class VehicleDetailPage {
  private readonly api = inject(VehiclesApi);
  readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly editor = viewChild(VehicleEditorDialogComponent);
  private readonly statusDialog = viewChild<ElementRef<HTMLDialogElement>>('statusDialog');
  private readonly usageDialog = viewChild<ElementRef<HTMLDialogElement>>('usageDialog');
  private readonly usageHeading = viewChild<ElementRef<HTMLHeadingElement>>('usageHeading');
  private readonly fuelDialog = viewChild<ElementRef<HTMLDialogElement>>('fuelDialog');
  private readonly fuelFile = viewChild<ElementRef<HTMLInputElement>>('fuelFile');
  private readonly maintenanceDialog = viewChild<ElementRef<HTMLDialogElement>>('maintenanceDialog');
  private readonly documentDialog = viewChild<ElementRef<HTMLDialogElement>>('documentDialog');
  private readonly documentFile = viewChild<ElementRef<HTMLInputElement>>('documentFile');
  private readonly pendingCommands = new Map<VehicleCommand, { payload: string; key: string; receipt?: File }>();
  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly detail = signal<VehicleDetail | null>(null);
  readonly money = formatUyuMoney;
  readonly fuelVolume = formatFuelVolume;
  readonly fuelReceipt = signal<File | undefined>(undefined);
  readonly documentAttachment = signal<File | undefined>(undefined);
  readonly statusLabel = vehicleStatusLabel;
  readonly capacity = computed(() => formatVehicleMeasure(this.detail()?.data.capacity_kg ?? null, 'kg'));
  readonly drivers = signal<VehicleDriverOption[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly dialogError = signal<string | null>(null);
  readonly driverError = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly canManage = computed(() => this.hasPermission('vehicles.manage'));
  readonly canUseVehicle = computed(() => this.hasPermission('vehicles.use') || this.canManage());
  readonly canReadFuel = computed(() => this.hasPermission('vehicles.fuel.view') || this.hasPermission('vehicles.fuel.manage'));
  readonly canManageFuel = computed(() => this.hasPermission('vehicles.fuel.manage'));
  readonly canReadMaintenance = computed(() => this.hasPermission('vehicles.maintenance.view') || this.hasPermission('vehicles.maintenance.manage'));
  readonly canManageMaintenance = computed(() => this.hasPermission('vehicles.maintenance.manage'));
  readonly canReadDocuments = computed(() => this.hasPermission('vehicles.documents.view') || this.hasPermission('vehicles.documents.manage'));
  readonly canManageDocuments = computed(() => this.hasPermission('vehicles.documents.manage'));
  readonly canManageReadings = computed(() => this.hasPermission('vehicles.readings.manage'));
  readonly activeUsage = computed(() => this.detail()?.usages.find((usage) => !usage.ended_at) ?? null);
  readonly closedUsages = computed(() => this.detail()?.usages.filter((usage) => usage.ended_at) ?? []);
  readonly canStartUsage = computed(() => this.canUseVehicle() && !this.activeUsage() && this.detail()?.availability.availability === 'available');
  readonly canCloseUsage = computed(() => this.canUseVehicle() && !!this.activeUsage() && !this.activeUsage()?.delivery_id);
  readonly measure = formatVehicleMeasure;
  readonly tab = signal<'general' | 'usage' | 'fuel' | 'maintenance' | 'documents' | 'timeline'>('general');
  readonly documents = computed(() => {
    if (this.tab() !== 'documents') return [];
    const now = new Date();
    return this.detail()?.documents.map((document) => ({ document, expired: vehicleDocumentExpired(document.expires_at, now) })) ?? [];
  });
  readonly selectedPlanIds = signal<string[]>([]);
  readonly correctionTarget = signal<VehicleReading | null>(null);
  readonly usageAction = signal<UsageAction>('start');
  readonly usageDialogTitle = computed(() => {
    switch (this.usageAction()) {
      case 'start': return 'Iniciar uso';
      case 'close': return 'Cerrar uso';
      case 'reading': return this.correctionTarget() ? 'Rectificar lectura' : 'Registrar lectura';
    }
  });
  readonly maintenanceDraft = signal<MaintenanceDialog>({ kind: 'create' });
  readonly completedItemIds = signal<string[]>([]);
  readonly interventionLabels: Record<VehicleMaintenance['status'], string> = {
    planned: 'Planificada', in_progress: 'En curso', completed: 'Completada', cancelled: 'Anulada',
  };
  readonly maintenanceDialogCopy = computed(() => {
    const draft = this.maintenanceDraft();
    switch (draft.kind) {
      case 'plan': return { title: draft.plan ? 'Editar plan preventivo' : 'Nuevo plan', submit: 'Guardar plan' };
      case 'create': return { title: 'Nueva intervención', submit: 'Crear intervención' };
      case 'complete': return { title: 'Completar intervención', submit: 'Completar intervención' };
      case 'cancel': return { title: 'Anular intervención', submit: 'Anular intervención' };
      case 'receipt': return { title: 'Adjuntar comprobante', submit: 'Guardar comprobante' };
    }
  });
  readonly odometerReadings = computed(() => this.detail()?.readings.filter((reading) => reading.meter_type === 'odometer') ?? []);
  readonly events = computed<TimelineEvent[]>(() => {
    const record = this.detail();
    if (!record) return [];
    const events: TimelineEvent[] = [
      ...record.status_changes.map((change) => ({ at: change.occurred_at, title: 'Estado del vehiculo actualizado', detail: `${change.from_status ? `${this.statusLabel(change.from_status)} -> ` : ''}${this.statusLabel(change.to_status)} · ${change.reason}${change.actor_name ? ` · ${change.actor_name}` : ''}`, type: 'status' })),
      ...record.usages.filter((usage: VehicleUsage) => !!usage.ended_at).map((usage: VehicleUsage) => ({ at: usage.ended_at!, title: 'Uso cerrado', detail: `${usage.driver_snapshot ?? 'Sin responsable'}${usage.end_odometer_km ? ` · ${usage.end_odometer_km} km al cierre` : ''}`, type: 'usage' })),
      ...record.usages.map((usage: VehicleUsage) => ({ at: usage.started_at, title: usage.purpose === 'delivery' ? 'Reparto iniciado' : `Uso iniciado: ${usage.purpose}`, detail: `${usage.driver_snapshot ?? 'Sin responsable'}${usage.end_odometer_km ? ` · ${usage.start_odometer_km ?? '—'}–${usage.end_odometer_km} km` : ''}`, type: 'usage' })),
      ...record.readings.filter((reading) => reading.meter_type === 'odometer').map((reading: VehicleReading) => ({ at: reading.recorded_at, title: reading.event_type === 'reset' ? 'Reinicio de tablero' : reading.event_type === 'correction' ? 'Lectura rectificada' : 'Lectura de kilometraje', detail: `${reading.value} · ${reading.event_reason ?? (reading.source === 'manual' ? 'Registro manual' : 'Asociado al uso')}`, type: 'reading' })),
      ...record.fuel_entries.map((fuel) => ({ at: fuel.occurred_at, title: 'Carga de combustible', detail: `${formatFuelLiters(fuel.liters)} l · ${formatUyuMoney(fuel.amount)}${fuel.supplier ? ` · ${fuel.supplier}` : ''}`, type: 'fuel' })),
      ...record.maintenances.map((maintenance: VehicleMaintenance) => ({ at: maintenance.completed_at ?? maintenance.started_at ?? maintenance.planned_at ?? '', title: `Mantenimiento ${this.maintenanceStatus(maintenance.status)}`, detail: `${maintenance.description} · ${formatUyuMoney(maintenance.cost_amount)}`, type: 'maintenance' })),
    ].filter((event) => !!event.at);
    return events.sort((a, b) => b.at.localeCompare(a.at));
  });
  readonly readingForm = new FormGroup({ meter_type: new FormControl<'odometer'>('odometer', { nonNullable: true }), event_type: new FormControl<'reading' | 'reset'>('reading', { nonNullable: true }), value: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d+(?:[.,]\d)?$/)] }), recorded_at: new FormControl(this.localDateTime(), { nonNullable: true, validators: [Validators.required] }), event_reason: new FormControl('', { nonNullable: true }), notes: new FormControl('', { nonNullable: true }) });
  readonly useForm = new FormGroup({ purpose: new FormControl('Traslado', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }), driver_id: new FormControl(''), odometer_km: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d)?$/)] }), notes: new FormControl('', { nonNullable: true }) });
  readonly closeUseForm = new FormGroup({ odometer_km: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d)?$/)] }), notes: new FormControl('', { nonNullable: true }) });
  readonly fuelForm = new FormGroup({
    liters: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d+(?:[.,]\d{1,3})?$/)] }),
    fuel_type: new FormControl('Nafta', { nonNullable: true, validators: [Validators.required, Validators.maxLength(40)] }),
    amount: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{1,11}(?:[.,]\d{1,3})?$/)] }),
    supplier: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    occurred_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    odometer_km: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d+)?$/)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
  });
  readonly statusForm = new FormGroup({ status: new FormControl<VehicleStatus>('active', { nonNullable: true }), reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }) });
  readonly planForm = new FormGroup({
    task: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(160)] }),
    interval_days: new FormControl<number | null>(null, [Validators.min(1), Validators.max(36_500), Validators.pattern(/^\d+$/)]),
    interval_km: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d+)?$/)] }),
    next_due_at: new FormControl('', { nonNullable: true }),
    next_due_odometer_km: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d+)?$/)] }),
  });
  readonly maintenanceForm = new FormGroup({
    type: new FormControl<'preventive' | 'corrective'>('corrective', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }),
    workshop: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    planned_at: new FormControl('', { nonNullable: true }),
    odometer_km: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d+)?$/)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
    immobilizes_vehicle: new FormControl(false, { nonNullable: true }),
    cost_amount: new FormControl('0.000', { nonNullable: true, validators: [Validators.pattern(/^\d{1,11}(?:[.,]\d{1,3})?$/)] }),
  });
  readonly maintenanceCompletionForm = new FormGroup({
    cost_amount: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d{1,11}(?:[.,]\d{1,3})?$/)] }),
    odometer_km: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d+)?$/), Validators.max(999_999_999)] }),
  });
  readonly maintenanceReason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] });
  readonly documentForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(160)] }),
    document_type: new FormControl('Seguro', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
    expires_at: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    addIcons({ addOutline, attachOutline, chevronBackOutline, closeOutline, createOutline, documentOutline, downloadOutline, lockClosedOutline, navigateOutline, refreshOutline, waterOutline });
    void this.load();
    if (this.canManage()) void this.loadDrivers();
  }

  async loadDrivers(): Promise<void> {
    try { this.drivers.set((await firstValueFrom(this.api.drivers())).data); }
    catch { this.driverError.set('No se pudieron cargar los repartidores para el conductor habitual.'); }
  }

  async load(): Promise<void> {
    if (!this.id) { this.loading.set(false); this.error.set('No se indicó el vehículo.'); return; }
    this.loading.set(true); this.error.set(null);
    try {
      const data = await firstValueFrom(this.api.detail(this.id));
      this.detail.set(data);
    } catch { this.error.set('No se pudo cargar la ficha del vehículo.'); }
    finally { this.loading.set(false); }
  }

  openEditor(): void {
    const vehicle = this.detail()?.data;
    if (!vehicle || this.saving()) return;
    this.dialogError.set(null);
    this.editor()?.open(vehicle);
  }

  async saveGeneral(value: VehicleInput): Promise<void> {
    if (!this.canManage() || this.saving()) return;
    if (await this.run(() => this.api.update(this.id, value), 'Ficha actualizada.', this.dialogError)) {
      this.editor()?.close();
    }
  }

  openStatus(): void {
    const vehicle = this.detail()?.data;
    if (!vehicle || this.saving()) return;
    this.dialogError.set(null);
    this.statusForm.reset({ status: vehicle.status, reason: '' });
    this.statusDialog()?.nativeElement.showModal();
  }

  closeStatus(event?: Event): void {
    event?.preventDefault();
    if (!this.saving()) this.statusDialog()?.nativeElement.close();
  }

  async changeStatus(): Promise<void> {
    if (!this.canManage() || this.saving()) return;
    const value = this.statusForm.getRawValue();
    value.reason = value.reason.trim();
    if (this.statusForm.invalid || !value.reason) {
      this.dialogError.set('Indicá el motivo del cambio de estado.');
      return;
    }
    if (await this.run(() => this.api.status(this.id, value), 'Estado del vehículo actualizado.', this.dialogError)) {
      this.closeStatus();
    }
  }

  openUsageDialog(action: UsageAction, reading?: VehicleReading): void {
    const dialog = this.usageDialog()?.nativeElement;
    if (!dialog || dialog.open || this.saving()) return;
    switch (action) {
      case 'start':
        if (!this.canStartUsage()) return;
        this.useForm.reset({ purpose: 'Traslado', driver_id: '', odometer_km: '', notes: '' });
        break;
      case 'close':
        if (!this.canCloseUsage()) return;
        this.closeUseForm.reset({ odometer_km: '', notes: '' });
        break;
      case 'reading':
        if (!this.canManageReadings() || (reading && !this.canCorrectReading(reading))) return;
        this.correctionTarget.set(reading ?? null);
        this.readingForm.reset({
          meter_type: 'odometer', event_type: 'reading', value: reading?.value ?? '',
          recorded_at: this.localDateTime(reading ? new Date(reading.recorded_at) : new Date()), event_reason: '', notes: '',
        });
        break;
    }
    this.dialogError.set(null);
    this.usageAction.set(action);
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  closeUsageDialog(event?: Event): void {
    event?.preventDefault();
    if (!this.saving()) this.usageDialog()?.nativeElement.close();
  }

  async recordReading(): Promise<void> {
    if (!this.canManageReadings() || this.saving()) return;
    const value = this.readingForm.getRawValue();
    const target = this.correctionTarget();
    const reason = value.event_reason.trim();
    if ((target || value.event_type === 'reset') && !reason) {
      this.dialogError.set(target ? 'Indicá el motivo de la rectificación.' : 'Indicá el motivo del reinicio del contador.');
      this.readingForm.controls.event_reason.markAsTouched();
      return;
    }
    const recordedAt = new Date(value.recorded_at);
    if (this.readingForm.invalid || !Number.isFinite(recordedAt.getTime())) {
      this.readingForm.markAllAsTouched();
      this.dialogError.set('Revisá el kilometraje, la fecha y la hora de la lectura.');
      return;
    }
    const eventType = target ? 'correction' : value.event_type;
    const body = {
      meter_type: value.meter_type,
      event_type: eventType,
      value: value.value.replace(',', '.'),
      recorded_at: target?.recorded_at ?? recordedAt.toISOString(),
      ...(value.notes ? { notes: value.notes } : {}),
      ...(target ? { corrects_reading_id: target.id, correction_reason: reason, event_reason: reason } : {}),
      ...(!target && value.event_type === 'reset' ? { event_reason: reason } : {}),
    };
    const key = this.commandKey('reading', body);
    const message = target ? 'Lectura rectificada. El registro original queda en el historial.'
      : eventType === 'reset' ? 'Reinicio de tablero registrado.' : 'Lectura registrada.';
    if (await this.run(() => this.api.reading(this.id, body, key), message, this.dialogError)) {
      this.pendingCommands.delete('reading');
      this.closeUsageDialog();
      if (target) this.usageHeading()?.nativeElement.focus({ preventScroll: true });
    }
  }

  canCorrectReading(reading: VehicleReading): boolean {
    return !this.detail()?.readings.some((candidate) => candidate.corrects_reading_id === reading.id);
  }

  async startExternalUsage(): Promise<void> {
    if (!this.canStartUsage() || this.saving()) return;
    const value = this.useForm.getRawValue();
    if (this.useForm.invalid || !value.purpose.trim()) {
      this.useForm.markAllAsTouched();
      this.dialogError.set('Ingresá el motivo y revisá el kilometraje de salida si lo completaste.');
      return;
    }
    const body = {
      purpose: value.purpose.trim(),
      ...(value.driver_id ? { driver_id: Number(value.driver_id) } : {}),
      ...(value.odometer_km.trim() ? { odometer_km: value.odometer_km.trim().replace(',', '.') } : {}),
      ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
    };
    const key = this.commandKey('start', body);
    if (await this.run(() => this.api.startUsage(this.id, body, key), 'Uso del vehículo iniciado.', this.dialogError)) {
      this.pendingCommands.delete('start');
      this.closeUsageDialog();
      this.usageHeading()?.nativeElement.focus({ preventScroll: true });
    }
  }

  async closeExternalUsage(): Promise<void> {
    const usage = this.activeUsage();
    if (!usage || !this.canCloseUsage() || this.saving()) return;
    if (this.closeUseForm.invalid) {
      this.closeUseForm.markAllAsTouched();
      this.dialogError.set('Revisá el kilometraje de cierre.');
      return;
    }
    const value = this.closeUseForm.getRawValue();
    const body = {
      ...(value.odometer_km.trim() ? { odometer_km: value.odometer_km.trim().replace(',', '.') } : {}),
      ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
    };
    if (await this.run(() => this.api.closeUsage(usage.id, body), 'Uso del vehículo cerrado.', this.dialogError)) {
      this.closeUsageDialog();
      this.usageHeading()?.nativeElement.focus({ preventScroll: true });
    }
  }

  openFuelDialog(): void {
    const dialog = this.fuelDialog()?.nativeElement;
    if (!dialog || dialog.open || this.saving()) return;
    this.fuelForm.reset({ fuel_type: 'Nafta', occurred_at: this.localDateTime() });
    this.dialogError.set(null);
    this.clearFuelReceipt();
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  closeFuelDialog(event?: Event): void {
    event?.preventDefault();
    if (!this.saving()) this.fuelDialog()?.nativeElement.close();
  }

  clearFuelReceipt(): void {
    this.fuelReceipt.set(undefined);
    const input = this.fuelFile()?.nativeElement;
    if (input) input.value = '';
  }

  async recordFuel(): Promise<void> {
    if (!this.canManageFuel() || this.saving()) return;
    const value = this.fuelForm.getRawValue();
    const occurredAt = new Date(value.occurred_at);
    const liters = value.liters.replace(',', '.');
    const receipt = this.fuelReceipt();
    if (this.fuelForm.invalid || !value.fuel_type.trim() || !Number.isFinite(occurredAt.getTime())) {
      this.fuelForm.markAllAsTouched();
      this.dialogError.set('Revisá la fecha, el combustible, los litros y el importe.');
      return;
    }
    if (Number(liters) <= 0 || Number(liters) > 9_999_999) {
      this.dialogError.set('Ingresá una cantidad de litros mayor que cero y de hasta 9.999.999.');
      return;
    }
    if (receipt && receipt.size > 10 * 1024 * 1024) {
      this.dialogError.set('El comprobante debe pesar hasta 10 MB.');
      return;
    }
    const body = {
      liters, fuel_type: value.fuel_type.trim(), amount: value.amount.replace(',', '.'),
      supplier: value.supplier.trim(), occurred_at: occurredAt.toISOString(),
      ...(value.odometer_km ? { odometer_km: value.odometer_km.replace(',', '.') } : {}),
      ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
    };
    const form = new FormData();
    for (const [name, field] of Object.entries(body)) form.append(name, field);
    if (receipt) form.append('receipt', receipt);
    const key = this.commandKey('fuel', body, receipt);
    if (await this.run(() => this.api.fuel(this.id, form, key), 'Carga de combustible registrada.', this.dialogError)) {
      this.pendingCommands.delete('fuel');
      this.closeFuelDialog();
      this.clearFuelReceipt();
    }
  }

  openMaintenanceDialog(draft: MaintenanceDialog): void {
    const dialog = this.maintenanceDialog()?.nativeElement;
    if (!this.canManageMaintenance() || !dialog || dialog.open || this.saving()) return;
    switch (draft.kind) {
      case 'plan': {
        const plan = draft.plan;
        this.planForm.reset({
          task: plan?.task ?? '', interval_days: plan?.interval_days ?? null, interval_km: plan?.interval_km ?? '',
          next_due_at: plan?.next_due_at ?? '', next_due_odometer_km: plan?.next_due_odometer_km ?? '',
        });
        break;
      }
      case 'create': this.maintenanceForm.reset(); this.selectedPlanIds.set([]); break;
      case 'complete': this.maintenanceCompletionForm.reset({ cost_amount: draft.intervention.cost_amount }); this.completedItemIds.set([]); break;
      case 'cancel': this.maintenanceReason.reset(); break;
      case 'receipt': {
        const input = dialog.querySelector<HTMLInputElement>('input[type="file"]');
        if (input) input.value = '';
        break;
      }
    }
    this.dialogError.set(null);
    this.maintenanceDraft.set(draft);
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  closeMaintenanceDialog(event?: Event): void {
    event?.preventDefault();
    if (!this.saving()) this.maintenanceDialog()?.nativeElement.close();
  }

  async createPlan(): Promise<void> {
    const draft = this.maintenanceDraft();
    if (!this.canManageMaintenance() || draft.kind !== 'plan' || this.saving()) return;
    const value = this.planForm.getRawValue();
    const intervalKm = value.interval_km.replace(',', '.');
    if (this.planForm.invalid || !value.task.trim() || (intervalKm && Number(intervalKm) <= 0)) {
      this.planForm.markAllAsTouched();
      this.dialogError.set('Revisá la tarea y los intervalos o vencimientos ingresados.');
      return;
    }
    const body = {
      task: value.task.trim(), interval_days: value.interval_days, interval_km: intervalKm || null,
      next_due_at: value.next_due_at || null, next_due_odometer_km: value.next_due_odometer_km.replace(',', '.') || null,
    };
    const editing = draft.plan;
    const operation = editing
      ? () => this.api.updatePlan(this.id, editing.id, { ...body, version: editing.version })
      : () => this.api.createPlan(this.id, body);
    if (await this.run(operation, editing ? 'Plan de mantenimiento actualizado.' : 'Plan de mantenimiento guardado.', this.dialogError)) {
      this.closeMaintenanceDialog();
    }
  }

  async deactivatePlan(plan: VehicleMaintenancePlan): Promise<void> {
    if (!this.canManageMaintenance() || this.saving()) return;
    if (await this.run(() => this.api.updatePlan(this.id, plan.id, { task: plan.task, active: false, version: plan.version }), 'Plan preventivo desactivado.', this.dialogError)) {
      this.closeMaintenanceDialog();
    }
  }

  async createMaintenance(): Promise<void> {
    if (!this.canManageMaintenance() || this.saving()) return;
    const value = this.maintenanceForm.getRawValue();
    if (this.maintenanceForm.invalid || !value.description.trim() || this.selectedPlanIds().length > 30) {
      this.maintenanceForm.markAllAsTouched();
      this.dialogError.set('Revisá la descripción y los datos ingresados. Podés vincular hasta 30 tareas.');
      return;
    }
    const body = {
      ...value, description: value.description.trim(), workshop: value.workshop.trim() || null,
      planned_at: value.planned_at || null, odometer_km: value.odometer_km.replace(',', '.') || null,
      notes: value.notes.trim() || null, cost_amount: value.cost_amount.replace(',', '.') || '0.000',
      items: this.selectedPlanIds().map((plan_id) => ({ plan_id })),
    };
    const key = this.commandKey('maintenance', body);
    if (await this.run(() => this.api.createMaintenance(this.id, { ...body, idempotency_key: key }, key), 'Intervención creada.', this.dialogError)) {
      this.pendingCommands.delete('maintenance');
      this.closeMaintenanceDialog();
    }
  }

  async transition(maintenance: VehicleMaintenance, action: 'inicio' | 'finalizacion' | 'anulacion'): Promise<void> {
    if (!this.canManageMaintenance() || this.saving()) return;
    const body: Record<string, unknown> = { version: maintenance.version };
    if (action === 'finalizacion') {
      const completion = this.maintenanceCompletionForm.getRawValue();
      if (this.maintenanceCompletionForm.invalid) {
        this.maintenanceCompletionForm.markAllAsTouched();
        this.dialogError.set('Revisá el costo final y el odómetro.');
        return;
      }
      body['cost_amount'] = completion.cost_amount.replace(',', '.') || maintenance.cost_amount;
      if (completion.odometer_km) body['odometer_km'] = completion.odometer_km.replace(',', '.');
      body['completed_item_ids'] = this.completedItemIds();
    }
    if (action === 'anulacion') {
      const reason = this.maintenanceReason.value.trim();
      if (!reason || this.maintenanceReason.invalid) {
        this.dialogError.set('Indicá el motivo de la anulación.');
        return;
      }
      body['reason'] = reason;
    }
    const failure = action === 'inicio' ? this.error : this.dialogError;
    const message = action === 'inicio' ? 'Intervención iniciada.' : action === 'finalizacion' ? 'Intervención completada.' : 'Intervención anulada.';
    if (await this.run(() => this.api.transitionMaintenance(maintenance.id, action, body, crypto.randomUUID()), message, failure) && action !== 'inicio') {
      this.closeMaintenanceDialog();
    }
  }

  openDocumentDialog(): void {
    const dialog = this.documentDialog()?.nativeElement;
    if (!this.canManageDocuments() || !dialog || dialog.open || this.saving()) return;
    this.documentForm.reset();
    this.dialogError.set(null);
    this.clearDocumentAttachment();
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  closeDocumentDialog(event?: Event): void {
    event?.preventDefault();
    if (!this.saving()) {
      this.documentDialog()?.nativeElement.close();
      this.clearDocumentAttachment();
    }
  }

  clearDocumentAttachment(): void {
    this.documentAttachment.set(undefined);
    const input = this.documentFile()?.nativeElement;
    if (input) input.value = '';
  }

  async uploadDocument(): Promise<void> {
    if (!this.canManageDocuments() || this.saving()) return;
    const data = this.documentForm.getRawValue();
    const title = data.title.trim();
    const type = data.document_type.trim();
    if (this.documentForm.invalid || !title || !type) {
      this.documentForm.markAllAsTouched();
      this.dialogError.set('Ingresá el título y el tipo del documento.');
      return;
    }
    const file = this.documentAttachment();
    if (!file || file.size > 10 * 1024 * 1024) {
      this.dialogError.set('Seleccioná un PDF, JPG o PNG de hasta 10 MB.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    form.append('document_type', type);
    if (data.expires_at) form.append('expires_at', data.expires_at);
    if (await this.run(() => this.api.uploadDocument(this.id, form), 'Documento privado cargado.', this.dialogError)) {
      this.closeDocumentDialog();
    }
  }

  async uploadMaintenanceDocument(maintenanceId: string, file?: File): Promise<void> {
    if (!this.canManageMaintenance() || this.saving()) return;
    if (!file || file.size > 10 * 1024 * 1024) {
      this.dialogError.set('Seleccioná un PDF, JPG o PNG de hasta 10 MB.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('title', file.name.slice(0, 160));
    form.append('document_type', 'Comprobante');
    if (await this.run(() => this.api.uploadMaintenanceDocument(this.id, maintenanceId, form), 'Comprobante de mantenimiento cargado.', this.dialogError)) {
      this.closeMaintenanceDialog();
    }
  }

  async downloadMaintenanceDocument(maintenanceId: string, documentId: string, name: string): Promise<void> {
    try {
      const response = await firstValueFrom(this.api.downloadMaintenanceDocument(this.id, maintenanceId, documentId));
      if (!response.body) throw new Error('El comprobante no tiene contenido.');
      const url = URL.createObjectURL(response.body);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = name;
      window.document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.error.set('No se pudo descargar el comprobante de mantenimiento.');
    }
  }

  async downloadDocument(document: VehicleDocument): Promise<void> {
    try {
      const response = await firstValueFrom(this.api.downloadDocument(this.id, document.id));
      if (!response.body) throw new Error('El documento no tiene contenido.');
      const url = URL.createObjectURL(response.body);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.original_name;
      window.document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { this.error.set('No se pudo descargar el documento. Verificá que siga disponible y tengas permiso.'); }
  }

  async downloadFuelReceipt(entryId: string, name: string | null): Promise<void> {
    try {
      const response = await firstValueFrom(this.api.downloadFuelReceipt(this.id, entryId));
      if (!response.body) throw new Error('El comprobante no tiene contenido.');
      const url = URL.createObjectURL(response.body);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = name || `comprobante-combustible-${entryId}`;
      window.document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.error.set('No se pudo descargar el comprobante de combustible.');
    }
  }

  togglePlan(planId: string, checked: boolean): void {
    this.selectedPlanIds.update((ids) => checked ? [...new Set([...ids, planId])] : ids.filter((id) => id !== planId));
  }

  toggleCompletedItem(itemId: string, checked: boolean): void {
    this.completedItemIds.update((ids) => checked ? [...new Set([...ids, itemId])] : ids.filter((id) => id !== itemId));
  }

  maintenanceStatus(status: VehicleMaintenance['status']): string { return status === 'planned' ? 'planificado' : status === 'in_progress' ? 'en curso' : status === 'completed' ? 'completado' : 'anulado'; }
  planStatus(status: VehicleMaintenancePlan['status']): string { return status === 'current' ? 'Al día' : status === 'upcoming' ? 'Próximo' : status === 'overdue' ? 'Vencido' : 'Sin datos suficientes'; }
  readingLabel(reading: VehicleReading): string {
    if (reading.event_type === 'correction') return 'Rectificación';
    if (reading.event_type === 'reset') return 'Reinicio';
    if (reading.source === 'usage_start') return 'Inicio de uso';
    if (reading.source === 'usage_end') return 'Cierre de uso';
    return reading.source === 'manual' ? 'Manual' : 'Lectura';
  }

  private hasPermission(permission: string): boolean {
    const user = this.auth.user();
    return user?.roles.includes('admin') === true || user?.permissions?.includes(permission) === true;
  }

  private async run(operation: () => Observable<unknown>, success: string, failure = this.error): Promise<boolean> {
    this.saving.set(true); this.error.set(null); this.success.set(null);
    failure.set(null);
    try { await firstValueFrom(operation()); this.success.set(success); await this.load(); return true; }
    catch { failure.set('No se pudo guardar el cambio. Revisá los datos y volvé a intentar.'); return false; }
    finally { this.saving.set(false); }
  }

  private commandKey(action: VehicleCommand, body: object, receipt?: File): string {
    const payload = JSON.stringify(body);
    const existing = this.pendingCommands.get(action);
    if (existing?.payload === payload && existing.receipt === receipt) return existing.key;
    const key = crypto.randomUUID();
    this.pendingCommands.set(action, { payload, key, receipt });
    return key;
  }

  private localDateTime(date = new Date()): string {
    if (!Number.isFinite(date.getTime())) return '';
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }
}

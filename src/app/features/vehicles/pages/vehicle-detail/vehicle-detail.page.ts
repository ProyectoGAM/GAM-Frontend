import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Observable } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { VehicleDetail, VehicleDocument, VehicleDriverOption, VehicleMaintenance, VehicleMaintenancePlan, VehicleReading, VehicleUsage } from '../../interfaces/vehicle';
import { VehiclesApi } from '../../services/vehicles.api';
import { VehicleStatus } from '../../types/vehicle.types';
import { formatUyuMoney } from '../../../../shared/utils/uyu-money';
import { formatFuelLiters } from '../../vehicle-format';

interface TimelineEvent { at: string; title: string; detail: string; type: string; }

@Component({
  selector: 'app-vehicle-detail-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './vehicle-detail.page.html',
  styleUrl: './vehicle-detail.page.scss',
})
export class VehicleDetailPage {
  private readonly api = inject(VehiclesApi);
  readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly detail = signal<VehicleDetail | null>(null);
  readonly money = formatUyuMoney;
  readonly fuelLiters = formatFuelLiters;
  readonly drivers = signal<VehicleDriverOption[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
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
  readonly activeExternalUsage = computed(() => this.detail()?.usages.find((usage) => !usage.ended_at && !usage.delivery_id) ?? null);
  readonly tab = signal<'general' | 'usage' | 'fuel' | 'maintenance' | 'documents' | 'timeline'>('general');
  readonly selectedPlanIds = signal<string[]>([]);
  readonly correctionTarget = signal<VehicleReading | null>(null);
  readonly editingPlanId = signal<string | null>(null);
  readonly completedItemsByMaintenance = signal<Record<string, string[]>>({});
  readonly completionValues = signal<Record<string, { odometer_km: string; cost_amount: string }>>({});
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
  readonly generalForm = new FormGroup({
    plate: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(24)] }),
    make: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] }),
    model: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    year: new FormControl(''), admitted_at: new FormControl(''), capacity_kg: new FormControl(''), notes: new FormControl(''), habitual_driver_id: new FormControl(''), version: new FormControl(1, { nonNullable: true }),
  });
  readonly readingForm = new FormGroup({ meter_type: new FormControl<'odometer'>('odometer', { nonNullable: true }), event_type: new FormControl<'reading' | 'reset'>('reading', { nonNullable: true }), value: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d+(?:[.,]\d)?$/)] }), recorded_at: new FormControl(this.localDateTime(), { nonNullable: true, validators: [Validators.required] }), event_reason: new FormControl('', { nonNullable: true }), notes: new FormControl('', { nonNullable: true }) });
  readonly useForm = new FormGroup({ purpose: new FormControl('Traslado', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }), driver_id: new FormControl(''), odometer_km: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d)?$/)] }), notes: new FormControl('', { nonNullable: true }) });
  readonly closeUseForm = new FormGroup({ odometer_km: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d)?$/)] }), notes: new FormControl('', { nonNullable: true }) });
  readonly fuelForm = new FormGroup({ liters: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d+(?:[.,]\d{1,3})?$/)] }), fuel_type: new FormControl('Nafta', { nonNullable: true, validators: [Validators.required] }), amount: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d+(?:[.,]\d{1,3})?$/)] }), supplier: new FormControl('', { nonNullable: true }), occurred_at: new FormControl(this.localDateTime(), { nonNullable: true, validators: [Validators.required] }), odometer_km: new FormControl('', { nonNullable: true }), notes: new FormControl('', { nonNullable: true }) });
  readonly statusForm = new FormGroup({ status: new FormControl<VehicleStatus>('active', { nonNullable: true }), reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }) });
  readonly planForm = new FormGroup({ task: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(160)] }), interval_days: new FormControl(''), interval_km: new FormControl(''), next_due_at: new FormControl(''), next_due_odometer_km: new FormControl('') });
  readonly maintenanceForm = new FormGroup({ type: new FormControl<'preventive' | 'corrective'>('corrective', { nonNullable: true }), description: new FormControl('', { nonNullable: true, validators: [Validators.required] }), workshop: new FormControl(''), planned_at: new FormControl(''), odometer_km: new FormControl(''), notes: new FormControl(''), immobilizes_vehicle: new FormControl(false, { nonNullable: true }), cost_amount: new FormControl('0.000', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d{1,3})?$/)] }) });
  readonly documentForm = new FormGroup({ title: new FormControl('', { nonNullable: true, validators: [Validators.required] }), document_type: new FormControl('Seguro', { nonNullable: true, validators: [Validators.required] }), expires_at: new FormControl('') });
  readonly maintenanceDocumentForm = new FormGroup({ maintenance_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }) });

  constructor() { void this.load(); if (this.canManage()) void this.loadDrivers(); }

  async loadDrivers(): Promise<void> {
    try { this.drivers.set((await firstValueFrom(this.api.drivers())).data); }
    catch { this.error.set('No se pudieron cargar los repartidores para el conductor habitual.'); }
  }

  async load(): Promise<void> {
    if (!this.id) { this.loading.set(false); this.error.set('No se indicó el vehículo.'); return; }
    this.loading.set(true); this.error.set(null);
    try {
      const data = await firstValueFrom(this.api.detail(this.id));
      this.detail.set(data);
      this.generalForm.patchValue({ plate: data.data.plate, make: data.data.make, model: data.data.model, year: data.data.year?.toString() ?? '', admitted_at: data.data.admitted_at ?? '', capacity_kg: data.data.capacity_kg ?? '', notes: data.data.notes ?? '', habitual_driver_id: data.data.habitual_driver?.id?.toString() ?? '', version: data.data.version });
      this.statusForm.patchValue({ status: data.data.status, reason: '' });
    } catch { this.error.set('No se pudo cargar la ficha del vehículo.'); }
    finally { this.loading.set(false); }
  }

  async saveGeneral(): Promise<void> {
    if (this.generalForm.invalid || this.saving()) { this.generalForm.markAllAsTouched(); return; }
    const value = this.generalForm.getRawValue();
    await this.run(() => this.api.update(this.id, { ...value, year: value.year ? Number(value.year) : null, admitted_at: value.admitted_at || null, capacity_kg: value.capacity_kg || null, habitual_driver_id: value.habitual_driver_id ? Number(value.habitual_driver_id) : null }), 'Ficha actualizada.');
  }

  async changeStatus(): Promise<void> {
    if (this.statusForm.invalid || this.saving()) { this.statusForm.markAllAsTouched(); return; }
    await this.run(() => this.api.status(this.id, this.statusForm.getRawValue()), 'Estado del vehículo actualizado.');
  }

  async recordReading(): Promise<void> {
    if (this.readingForm.invalid || this.saving()) { this.readingForm.markAllAsTouched(); return; }
    const value = this.readingForm.getRawValue();
    const target = this.correctionTarget();
    if ((target || value.event_type === 'reset') && !value.event_reason.trim()) {
      this.error.set(target ? 'Indicá el motivo de la rectificación.' : 'Indicá el motivo del reinicio del contador.');
      this.readingForm.controls.event_reason.markAsTouched();
      return;
    }
    const eventType = target ? 'correction' : value.event_type;
    const body = {
      meter_type: value.meter_type,
      event_type: eventType,
      value: value.value.replace(',', '.'),
      recorded_at: new Date(value.recorded_at).toISOString(),
      ...(value.notes ? { notes: value.notes } : {}),
      ...(target ? { corrects_reading_id: target.id, correction_reason: value.event_reason, event_reason: value.event_reason } : {}),
      ...(!target && value.event_type === 'reset' ? { event_reason: value.event_reason } : {}),
    };
    if (await this.run(() => this.api.reading(this.id, body, crypto.randomUUID()), target ? 'Lectura rectificada; se conserva el registro original.' : value.event_type === 'reset' ? 'Reinicio de tablero registrado.' : 'Lectura registrada.')) {
      this.correctionTarget.set(null);
      this.readingForm.reset({ meter_type: 'odometer', event_type: 'reading', value: '', recorded_at: this.localDateTime(), event_reason: '', notes: '' });
    }
  }

  startCorrection(reading: VehicleReading): void {
    if (!this.canManageReadings() || !this.canCorrectReading(reading)) return;
    this.correctionTarget.set(reading);
    const recordedAt = new Date(reading.recorded_at);
    recordedAt.setMinutes(recordedAt.getMinutes() - recordedAt.getTimezoneOffset());
    this.readingForm.patchValue({ meter_type: 'odometer', event_type: 'reading', value: reading.value, recorded_at: recordedAt.toISOString().slice(0, 16), event_reason: '', notes: '' });
  }

  cancelCorrection(): void {
    this.correctionTarget.set(null);
    this.readingForm.reset({ meter_type: 'odometer', event_type: 'reading', value: '', recorded_at: this.localDateTime(), event_reason: '', notes: '' });
  }

  canCorrectReading(reading: VehicleReading): boolean {
    return !this.detail()?.readings.some((candidate) => candidate.corrects_reading_id === reading.id);
  }

  async startExternalUsage(): Promise<void> {
    if (!this.canUseVehicle() || this.useForm.invalid || this.saving()) { this.useForm.markAllAsTouched(); return; }
    const value = this.useForm.getRawValue();
    const body = {
      purpose: value.purpose.trim(),
      ...(value.driver_id ? { driver_id: Number(value.driver_id) } : {}),
      ...(value.odometer_km.trim() ? { odometer_km: value.odometer_km.trim().replace(',', '.') } : {}),
      ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
    };
    if (await this.run(() => this.api.startUsage(this.id, body, crypto.randomUUID()), 'Uso del vehículo iniciado.')) {
      this.useForm.reset({ purpose: 'Traslado', driver_id: '', odometer_km: '', notes: '' });
    }
  }

  async closeExternalUsage(usage: VehicleUsage): Promise<void> {
    if (!this.canUseVehicle() || this.closeUseForm.invalid || this.saving()) { this.closeUseForm.markAllAsTouched(); return; }
    const value = this.closeUseForm.getRawValue();
    const body = {
      ...(value.odometer_km.trim() ? { odometer_km: value.odometer_km.trim().replace(',', '.') } : {}),
      ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
    };
    if (await this.run(() => this.api.closeUsage(usage.id, body), 'Uso del vehículo cerrado.')) {
      this.closeUseForm.reset({ odometer_km: '', notes: '' });
    }
  }

  async recordFuel(event: SubmitEvent): Promise<void> {
    if (this.fuelForm.invalid || this.saving()) { this.fuelForm.markAllAsTouched(); return; }
    const value = this.fuelForm.getRawValue();
    const form = new FormData();
    form.append('liters', value.liters.replace(',', '.')); form.append('fuel_type', value.fuel_type);
    form.append('amount', value.amount.replace(',', '.')); form.append('supplier', value.supplier);
    form.append('occurred_at', new Date(value.occurred_at).toISOString());
    if (value.odometer_km) form.append('odometer_km', value.odometer_km.replace(',', '.'));
    if (value.notes) form.append('notes', value.notes);
    const receipt = (event.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
    if (receipt) form.append('receipt', receipt);
    if (await this.run(() => this.api.fuel(this.id, form, crypto.randomUUID()), 'Carga de combustible registrada.')) {
      this.fuelForm.reset({ liters: '', fuel_type: 'Nafta', amount: '', supplier: '', occurred_at: this.localDateTime(), odometer_km: '', notes: '' });
    }
  }

  async createPlan(): Promise<void> {
    if (this.planForm.invalid || this.saving()) { this.planForm.markAllAsTouched(); return; }
    const value = this.planForm.getRawValue();
    const body = { ...value, interval_days: value.interval_days ? Number(value.interval_days) : null, interval_km: value.interval_km ? value.interval_km.replace(',', '.') : null, next_due_at: value.next_due_at || null, next_due_odometer_km: value.next_due_odometer_km ? value.next_due_odometer_km.replace(',', '.') : null };
    const editing = this.detail()?.maintenance_plans.find((plan) => plan.id === this.editingPlanId());
    const operation = editing
      ? () => this.api.updatePlan(this.id, editing.id, { ...body, version: editing.version })
      : () => this.api.createPlan(this.id, body);
    if (await this.run(operation, editing ? 'Plan de mantenimiento actualizado.' : 'Plan de mantenimiento guardado.')) {
      this.planForm.reset({ task: '', interval_days: '', interval_km: '', next_due_at: '', next_due_odometer_km: '' });
      this.editingPlanId.set(null);
    }
  }

  editPlan(plan: VehicleMaintenancePlan): void {
    this.editingPlanId.set(plan.id);
    this.planForm.patchValue({ task: plan.task, interval_days: plan.interval_days?.toString() ?? '', interval_km: plan.interval_km ?? '', next_due_at: plan.next_due_at ?? '', next_due_odometer_km: plan.next_due_odometer_km ?? '' });
  }

  cancelPlanEdit(): void {
    this.editingPlanId.set(null);
    this.planForm.reset({ task: '', interval_days: '', interval_km: '', next_due_at: '', next_due_odometer_km: '' });
  }

  async deactivatePlan(plan: VehicleMaintenancePlan): Promise<void> {
    if (this.saving()) return;
    await this.run(() => this.api.updatePlan(this.id, plan.id, { task: plan.task, active: false, version: plan.version }), 'Plan preventivo desactivado.');
  }

  async createMaintenance(): Promise<void> {
    if (this.maintenanceForm.invalid || this.saving()) { this.maintenanceForm.markAllAsTouched(); return; }
    const value = this.maintenanceForm.getRawValue();
    const body = { ...value, planned_at: value.planned_at || null, odometer_km: value.odometer_km ? value.odometer_km.replace(',', '.') : null, notes: value.notes || null, cost_amount: value.cost_amount.replace(',', '.'), idempotency_key: crypto.randomUUID(), items: this.selectedPlanIds().map((plan_id) => ({ plan_id })) };
    if (await this.run(() => this.api.createMaintenance(this.id, body, body.idempotency_key), 'Intervención creada.')) {
      this.maintenanceForm.reset({ type: 'corrective', description: '', workshop: '', planned_at: '', odometer_km: '', notes: '', immobilizes_vehicle: false, cost_amount: '0.000' });
      this.selectedPlanIds.set([]);
    }
  }

  async transition(maintenance: VehicleMaintenance, action: 'inicio' | 'finalizacion' | 'anulacion'): Promise<void> {
    const body: Record<string, unknown> = { version: maintenance.version };
    if (action === 'finalizacion') {
      const completion = this.completionValues()[maintenance.id];
      body['cost_amount'] = completion?.cost_amount.trim().replace(',', '.') || maintenance.cost_amount;
      if (completion?.odometer_km.trim()) body['odometer_km'] = completion.odometer_km.trim().replace(',', '.');
      body['completed_item_ids'] = this.completedItemsByMaintenance()[maintenance.id] ?? [];
    }
    if (action === 'anulacion') {
      const reason = window.prompt('Motivo de anulación');
      if (!reason?.trim()) return;
      body['reason'] = reason.trim();
    }
    if (await this.run(() => this.api.transitionMaintenance(maintenance.id, action, body, crypto.randomUUID()), `Intervención ${action === 'inicio' ? 'iniciada' : action === 'finalizacion' ? 'completada' : 'anulada'}.`) && action === 'finalizacion') {
      this.completionValues.update((values) => { const next = { ...values }; delete next[maintenance.id]; return next; });
      this.completedItemsByMaintenance.update((values) => { const next = { ...values }; delete next[maintenance.id]; return next; });
    }
  }

  async uploadDocument(event: SubmitEvent): Promise<void> {
    if (this.documentForm.invalid || this.saving()) { this.documentForm.markAllAsTouched(); return; }
    const file = (event.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
    if (!file) { this.error.set('Seleccioná un archivo PDF o una imagen.'); return; }
    const form = new FormData(); const data = this.documentForm.getRawValue();
    form.append('file', file); form.append('title', data.title); form.append('document_type', data.document_type); if (data.expires_at) form.append('expires_at', data.expires_at);
    if (await this.run(() => this.api.uploadDocument(this.id, form), 'Documento privado cargado.')) {
      this.documentForm.reset({ title: '', document_type: 'Seguro', expires_at: '' });
    }
  }

  async uploadMaintenanceDocument(event: SubmitEvent): Promise<void> {
    if (this.maintenanceDocumentForm.invalid || this.saving()) { this.maintenanceDocumentForm.markAllAsTouched(); return; }
    const formElement = event.currentTarget as HTMLFormElement;
    const file = formElement.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
    if (!file) { this.error.set('Seleccioná un archivo PDF o una imagen.'); return; }
    const form = new FormData();
    form.append('file', file);
    const maintenanceId = this.maintenanceDocumentForm.controls.maintenance_id.value;
    if (await this.run(() => this.api.uploadMaintenanceDocument(this.id, maintenanceId, form), 'Comprobante de mantenimiento cargado.')) {
      this.maintenanceDocumentForm.reset({ maintenance_id: '' });
      formElement.reset();
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

  toggleCompletedItem(maintenanceId: string, itemId: string, checked: boolean): void {
    this.completedItemsByMaintenance.update((selection) => {
      const ids = selection[maintenanceId] ?? [];
      return { ...selection, [maintenanceId]: checked ? [...new Set([...ids, itemId])] : ids.filter((id) => id !== itemId) };
    });
  }

  itemChecked(maintenanceId: string, itemId: string): boolean {
    return (this.completedItemsByMaintenance()[maintenanceId] ?? []).includes(itemId);
  }

  completionValue(maintenance: VehicleMaintenance, key: 'odometer_km' | 'cost_amount'): string {
    return this.completionValues()[maintenance.id]?.[key] ?? (key === 'cost_amount' ? maintenance.cost_amount : '');
  }

  setCompletionValue(maintenanceId: string, key: 'odometer_km' | 'cost_amount', value: string): void {
    this.completionValues.update((values) => {
      const current = values[maintenanceId] ?? { odometer_km: '', cost_amount: '0.000' };
      return { ...values, [maintenanceId]: { ...current, [key]: value } };
    });
  }

  statusLabel(status: VehicleStatus): string { return status === 'active' ? 'Activo' : status === 'out_of_service' ? 'Fuera de servicio' : 'Retirado'; }
  maintenanceStatus(status: VehicleMaintenance['status']): string { return status === 'planned' ? 'planificado' : status === 'in_progress' ? 'en curso' : status === 'completed' ? 'completado' : 'anulado'; }
  planStatus(status: VehicleMaintenancePlan['status']): string { return status === 'current' ? 'Al día' : status === 'upcoming' ? 'Próximo' : status === 'overdue' ? 'Vencido' : 'Sin datos suficientes'; }
  readingLabel(_reading: VehicleReading): string { return 'km'; }

  private hasPermission(permission: string): boolean {
    const user = this.auth.user();
    return user?.roles.includes('admin') === true || user?.permissions?.includes(permission) === true;
  }

  private async run(operation: () => Observable<unknown>, success: string): Promise<boolean> {
    this.saving.set(true); this.error.set(null); this.success.set(null);
    try { await firstValueFrom(operation()); this.success.set(success); await this.load(); return true; }
    catch { this.error.set('No se pudo guardar el cambio. Revisá los datos y volvé a intentar.'); return false; }
    finally { this.saving.set(false); }
  }

  private localDateTime(): string {
    const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16);
  }
}

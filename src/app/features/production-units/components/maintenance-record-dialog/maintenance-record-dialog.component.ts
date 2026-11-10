import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { from } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { isAdminUser } from '../../../../core/auth/access-policy';
import { UsersService } from '../../../users/services/users.service';
import { formatUyuMoney } from '../../../../shared/utils/uyu-money';
import { InstallationMaintenance, MaintenanceCorrection, MaintenanceInput } from '../../interfaces/installation-maintenance.interface';
import { PoultryHouseDetail } from '../../interfaces/production-unit.interface';
import { MaintenanceDialogMode } from '../../types/installation-maintenance.type';
import { InstallationMaintenanceService } from '../../services/installation-maintenance.service';
import { canManageMaintenance, maintenanceCost, maintenanceDateLabel, maintenanceError, maintenanceFieldErrors, maintenanceTimestampLabel, maintenanceToday, validMaintenanceDate } from '../../services/maintenance-presentation';

@Component({
  selector: 'app-maintenance-record-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './maintenance-record-dialog.component.html',
  styleUrl: './maintenance-record-dialog.component.scss',
})
export class MaintenanceRecordDialogComponent {
  private readonly api = inject(InstallationMaintenanceService);
  private readonly users = inject(UsersService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  private trigger: HTMLElement | null = null;
  private owner = '';
  private houseId = 0;
  private generation = 0;
  private attempt: { fingerprint: string; key: string } | null = null;
  readonly house = input.required<PoultryHouseDetail>();
  readonly changed = output<string>();
  readonly refreshRequested = output<void>();
  readonly opened = signal(false);
  readonly mode = signal<MaintenanceDialogMode>('create');
  readonly record = signal<InstallationMaintenance | null>(null);
  readonly saving = signal(false);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);
  readonly blocked = signal(false);
  readonly error = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly responsibles = signal<{ id: number; name: string }[]>([]);
  readonly directoryLoading = signal(false);
  readonly directoryMessage = signal('');
  readonly maximumDate = signal(maintenanceToday());
  readonly canManage = computed(() => canManageMaintenance(this.auth.user()));
  readonly currentUserId = computed(() => this.auth.user()?.id);
  readonly canEdit = computed(() => this.canManage() && this.record()?.status === 'completed' && !this.loading() && !this.loadFailed() && !this.saving() && !this.blocked());
  readonly title = computed(() => ({ create: 'Registrar mantenimiento', detail: 'Detalle del mantenimiento', edit: 'Corregir mantenimiento', cancel: 'Anular mantenimiento' })[this.mode()]);
  readonly recordView = computed(() => {
    const record = this.record();
    return record ? { ...record, dateLabel: maintenanceDateLabel(record.maintenance_date), costLabel: `${formatUyuMoney(record.cost.amount)} ${record.cost.currency}`,
      createdLabel: maintenanceTimestampLabel(record.created_at), updatedLabel: maintenanceTimestampLabel(record.updated_at), cancelledLabel: maintenanceTimestampLabel(record.cancelled_at) } : null;
  });
  readonly archivedResponsible = computed(() => {
    const responsible = this.record()?.responsible;
    return responsible && !this.responsibles().some((user) => user.id === responsible.id) ? responsible : null;
  });
  readonly form = new FormGroup({
    date: new FormControl('', { nonNullable: true, validators: [(control) => validMaintenanceDate(String(control.value)) ? null : { date: true }] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000), (control) => String(control.value).trim() ? null : { required: true }] }),
    responsible: new FormControl<number | null>(null, { validators: [Validators.required] }),
    cost: new FormControl('0', { nonNullable: true, validators: [(control) => maintenanceCost(String(control.value)) !== null ? null : { amount: true }] }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
  });

  constructor() {
    effect(() => {
      const identity = this.identity(); const houseId = this.house().id;
      untracked(() => { if (this.opened() && (identity !== this.owner || houseId !== this.houseId)) this.dismiss(); });
    });
    this.destroyRef.onDestroy(() => { this.generation++; this.attempt = null; });
  }

  private identity(): string { return JSON.stringify([this.auth.user()?.id, this.auth.session?.()]); }

  private prepare(trigger: HTMLElement | null): void {
    this.generation++; this.owner = this.identity(); this.houseId = this.house().id;
    this.trigger = trigger; this.attempt = null;
    this.error.set(''); this.fieldErrors.set({}); this.blocked.set(false); this.loadFailed.set(false); this.loading.set(false);
    this.maximumDate.set(maintenanceToday()); this.opened.set(true);
    if (!this.dialog().nativeElement.open) this.dialog().nativeElement.showModal();
    this.focusHeading();
  }

  openCreate(trigger: HTMLElement | null = null): void {
    if (!this.canManage() || this.saving()) return;
    this.prepare(trigger); this.record.set(null); this.mode.set('create');
    this.form.reset({ date: maintenanceToday(), description: '', responsible: this.auth.user()?.id ?? null, cost: '0', reason: '' });
    this.loadResponsibles();
  }

  openRecord(record: InstallationMaintenance, trigger: HTMLElement | null = null): void {
    if (this.saving() || record.poultry_house_id !== this.house().id) return;
    this.prepare(trigger); this.record.set(record); this.mode.set('detail'); this.reloadRecord();
  }

  reloadRecord(): void {
    const record = this.record(); if (!record || this.saving() || !this.opened()) return;
    const generation = this.generation;
    this.loading.set(true); this.loadFailed.set(false);
    this.api.detail(record.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (fresh) => {
        if (!this.isCurrent(generation)) return;
        this.loading.set(false);
        if (fresh.poultry_house_id !== this.houseId) { this.loadFailed.set(true); return; }
        this.record.set(fresh); this.blocked.set(false);
      },
      error: () => { if (this.isCurrent(generation)) { this.loading.set(false); this.loadFailed.set(true); } },
    });
  }

  start(mode: 'edit' | 'cancel'): void {
    const record = this.record(); if (!record || !this.canEdit()) return;
    this.form.reset({ date: record.maintenance_date, description: record.description, responsible: record.responsible.id, cost: record.cost.amount, reason: '' });
    this.error.set(''); this.fieldErrors.set({}); this.mode.set(mode);
    if (mode === 'edit') this.loadResponsibles();
    this.focusHeading();
  }

  loadResponsibles(): void {
    const current = this.auth.user();
    this.responsibles.set(current ? [{ id: current.id, name: current.name }] : []);
    this.directoryMessage.set('');
    if (!isAdminUser(current) && !current?.permissions?.includes('identity.users.manage')) {
      this.directoryMessage.set('El directorio requiere permiso de gestión de usuarios. Podés registrarte como responsable.');
      this.directoryLoading.set(false); return;
    }
    const generation = this.generation;
    this.directoryLoading.set(true);
    from(this.users.allUsers()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (users) => {
        if (!this.isCurrent(generation)) return;
        const active = users.filter((user) => !user.deleted_at);
        const choices = new Map(active.map((user) => [user.id, { id: user.id, name: user.name }]));
        if (current && !choices.has(current.id)) choices.set(current.id, { id: current.id, name: current.name });
        this.responsibles.set([...choices.values()].sort((a, b) => a.id === current?.id ? -1 : b.id === current?.id ? 1 : a.name.localeCompare(b.name, 'es')));
        this.directoryLoading.set(false);
      },
      error: () => {
        if (!this.isCurrent(generation)) return;
        this.directoryLoading.set(false);
        this.directoryMessage.set('No se pudo consultar el directorio. Podés usar tu usuario o reintentar la consulta.');
      },
    });
  }

  back(): void { if (!this.saving()) { this.mode.set('detail'); this.error.set(''); this.fieldErrors.set({}); this.focusHeading(); } }

  close(event?: Event): void {
    event?.preventDefault();
    if (!this.saving()) this.dismiss();
  }

  private dismiss(): void {
    this.generation++; this.opened.set(false); this.saving.set(false); this.loading.set(false); this.attempt = null;
    if (this.dialog().nativeElement.open) this.dialog().nativeElement.close();
    if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
    else document.getElementById('maintenance-title')?.focus({ preventScroll: true });
    this.trigger = null;
    this.record.set(null); this.responsibles.set([]); this.form.reset(); this.error.set(''); this.fieldErrors.set({});
  }

  private focusHeading(): void {
    this.dialog().nativeElement.scrollTop = 0; this.heading().nativeElement.focus({ preventScroll: true });
  }

  private isCurrent(generation: number): boolean {
    return this.opened() && generation === this.generation && this.owner === this.identity() && this.houseId === this.house().id;
  }

  submit(): void {
    if (!this.opened() || this.saving() || this.blocked() || !this.canManage() || this.owner !== this.identity()) return;
    const mode = this.mode(); const record = this.record();
    if (mode === 'detail' || (mode !== 'create' && (!record || record.status !== 'completed' || this.loading() || this.loadFailed()))) return;
    this.form.markAllAsTouched(); this.error.set(''); this.fieldErrors.set({});
    const value = this.form.getRawValue(); const reason = value.reason.trim();
    if (mode !== 'create' && (!reason || reason.length > 1000)) { this.fieldErrors.set({ reason: 'Ingresá un motivo de hasta 1000 caracteres.' }); return; }
    const cost = maintenanceCost(value.cost);
    if (mode !== 'cancel' && (this.form.invalid || cost === null || !value.responsible)) return;
    const input: MaintenanceInput = {
      maintenance_date: value.date, description: value.description.trim(), responsible_user_id: value.responsible!,
      cost_amount: cost!, cost_currency: 'UYU',
    };
    const correction: MaintenanceCorrection = { version: record?.version ?? 1, reason };
    if (mode === 'edit' && record) {
      if (input.maintenance_date !== record.maintenance_date) correction.maintenance_date = input.maintenance_date;
      if (input.description !== record.description) correction.description = input.description;
      if (input.responsible_user_id !== record.responsible.id) correction.responsible_user_id = input.responsible_user_id;
      if (input.cost_amount !== maintenanceCost(record.cost.amount)) {
        correction.cost_amount = input.cost_amount; correction.cost_currency = 'UYU';
      }
      if (Object.keys(correction).length === 2) { this.error.set('Modificá al menos un dato del mantenimiento.'); return; }
    }
    const fingerprint = JSON.stringify([this.owner, this.houseId, input]);
    if (mode === 'create' && this.attempt?.fingerprint !== fingerprint) this.attempt = { fingerprint, key: crypto.randomUUID() };
    const operation = mode === 'create' ? this.api.create(this.houseId, input, this.attempt!.key)
      : mode === 'edit' ? this.api.correct(record!.id, correction)
      : this.api.cancel(record!.id, { version: record!.version, reason });
    const generation = this.generation;
    this.saving.set(true);
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        if (!this.isCurrent(generation)) return;
        this.saving.set(false); this.attempt = null; this.record.set(saved); this.mode.set('detail');
        this.changed.emit(mode === 'create' ? 'Mantenimiento registrado.' : mode === 'edit' ? 'Mantenimiento corregido.' : 'Mantenimiento anulado. El historial se conserva.');
        this.focusHeading();
      },
      error: (error: unknown) => {
        if (!this.isCurrent(generation)) return;
        this.saving.set(false); this.error.set(maintenanceError(error, 'No se pudo guardar. Reintentá con los mismos datos.'));
        this.fieldErrors.set(maintenanceFieldErrors(error));
        if (error instanceof HttpErrorResponse) {
          if ([401, 403, 404].includes(error.status)) this.blocked.set(true);
          if (error.status === 422) this.attempt = null;
          if (error.status === 409 || error.status === 404) {
            this.refreshRequested.emit();
            if (mode !== 'create') { this.mode.set('detail'); this.reloadRecord(); }
          }
        }
      },
    });
  }
}

import { Component, computed, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { EggPresentation } from '../../interfaces/egg-presentations';
import { EggPresentationsApi } from '../../services/egg-presentations.api';
import { InventoryConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-egg-presentations',
  templateUrl: './egg-presentations.page.html',
  styleUrl: './egg-presentations.page.scss',
  imports: [ReactiveFormsModule, InventoryConfirmationDialogComponent],
})
export class EggPresentationsPage {
  private readonly api = inject(EggPresentationsApi);
  readonly items = signal<EggPresentation[]>([]);
  readonly locked = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly creating = signal(false);
  readonly busy = computed(() => this.saving() || this.deleting() || this.creating());
  readonly creationError = signal<string | null>(null);
  @ViewChild('creationDialog', { static: true }) private readonly creationDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('creationName', { static: true }) private readonly creationName!: ElementRef<HTMLInputElement>;
  private creationTrigger: HTMLElement | null = null;
  readonly pendingDeletion = signal<EggPresentation | null>(null);
  readonly deletionError = signal<string | null>(null);
  @ViewChild(InventoryConfirmationDialogComponent) private deletionDialog!: InventoryConfirmationDialogComponent;
  readonly editing = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly form = this.makeForm();
  readonly creationForm = this.makeForm();

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.list());
      this.items.set(response.data);
      this.locked.set(response.meta.locked);
      for (const form of [this.form, this.creationForm]) {
        if (response.meta.locked) form.disable();
        else form.enable();
      }
    } catch (error) {
      this.error.set(this.errorMessage(error, 'No se pudo consultar el catálogo de presentaciones.'));
    } finally {
      this.loading.set(false);
    }
  }

  edit(item: EggPresentation): void {
    if (this.locked() || this.loading() || this.busy()) return;
    this.editing.set(item.id);
    this.message.set(null);
    this.error.set(null);
    this.form.reset({ name: item.label, eggs_per_unit: item.eggs_per_unit, default_unit_price: item.default_unit_price });
  }

  clear(): void {
    this.editing.set(null);
    this.form.reset();
    this.message.set(null);
    this.error.set(null);
  }

  openCreate(event: Event): void {
    if (this.locked() || this.loading() || this.busy()) return;
    this.creationForm.reset();
    this.creationError.set(null);
    this.message.set(null);
    this.creationTrigger = event.currentTarget as HTMLElement | null;
    this.creationDialog.nativeElement.showModal();
    this.creationName.nativeElement.focus();
  }

  cancelCreate(): void {
    if (!this.creating()) this.closeCreate();
  }

  onCreateCancel(event: Event): void {
    event.preventDefault();
    this.cancelCreate();
  }

  async create(): Promise<void> {
    if (this.locked() || this.loading() || this.busy()) return;
    if (this.creationForm.invalid) {
      this.creationForm.markAllAsTouched();
      this.creationError.set('Revisá el nombre, los huevos por unidad y el precio en pesos enteros.');
      return;
    }
    const value = this.creationForm.getRawValue();
    const body = { name: value.name.trim(), eggs_per_unit: value.eggs_per_unit!, default_unit_price: value.default_unit_price! };
    this.creating.set(true);
    this.creationError.set(null);
    try {
      await firstValueFrom(this.api.create(body));
      this.closeCreate();
      this.message.set('Presentación creada.');
      await this.load();
    } catch (error) {
      await this.load();
      this.creationError.set(this.errorMessage(error, 'No se pudo crear la presentación.'));
    } finally {
      this.creating.set(false);
    }
  }

  private closeCreate(): void {
    const dialog = this.creationDialog.nativeElement;
    if (dialog.open) dialog.close();
    this.creationForm.reset();
    this.creationError.set(null);
    if (this.creationTrigger?.isConnected) this.creationTrigger.focus();
    this.creationTrigger = null;
  }

  requestDelete(item: EggPresentation, event: Event): void {
    if (this.locked() || this.loading() || this.busy()) return;
    this.pendingDeletion.set(item);
    this.deletionError.set(null);
    this.message.set(null);
    this.error.set(null);
    this.deletionDialog.open(event.currentTarget as HTMLElement | null);
  }

  dismissDelete(): void {
    this.pendingDeletion.set(null);
    this.deletionError.set(null);
  }

  async remove(): Promise<void> {
    const item = this.pendingDeletion();
    if (!item || this.locked() || this.loading() || this.busy()) return;
    this.deleting.set(true);
    this.deletionError.set(null);
    try {
      await firstValueFrom(this.api.remove(item.id));
      if (this.editing() === item.id) this.clear();
      this.deletionDialog.close();
      this.dismissDelete();
      this.message.set('Presentación eliminada del catálogo.');
      await this.load();
    } catch (error) {
      await this.load();
      this.deletionError.set(this.errorMessage(error, 'No se pudo eliminar la presentación.'));
    } finally {
      this.deleting.set(false);
    }
  }

  async save(): Promise<void> {
    const id = this.editing();
    if (!id || this.locked() || this.loading() || this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisá el nombre, los huevos por unidad y el precio en pesos enteros.');
      return;
    }
    const value = this.form.getRawValue();
    const body = { name: value.name.trim(), eggs_per_unit: value.eggs_per_unit!, default_unit_price: value.default_unit_price! };
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.update(id, body));
      this.clear();
      this.message.set('Presentación guardada.');
      await this.load();
    } catch (error) {
      await this.load();
      this.error.set(this.errorMessage(error, 'No se pudo guardar la presentación.'));
    } finally {
      this.saving.set(false);
    }
  }

  private makeForm() {
    return new FormGroup({
      name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(160)] }),
      eggs_per_unit: new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.max(2147483647), Validators.pattern(/^\d+$/)]),
      default_unit_price: new FormControl<number | null>(null, [Validators.required, Validators.min(0), Validators.max(2147483647), Validators.pattern(/^\d+$/)]),
    });
  }

  private errorMessage(error: unknown, fallback: string): string {
    const body = (error as { error?: { message?: string; errors?: Record<string, string[]> } })?.error;
    return Object.values(body?.errors ?? {})[0]?.[0] ?? body?.message ?? fallback;
  }
}

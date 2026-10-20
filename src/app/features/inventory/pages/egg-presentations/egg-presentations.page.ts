import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { EggPresentation } from '../../interfaces/egg-presentations';
import { EggPresentationsApi } from '../../services/egg-presentations.api';

@Component({
  selector: 'app-egg-presentations',
  templateUrl: './egg-presentations.page.html',
  styleUrl: './egg-presentations.page.scss',
  imports: [ReactiveFormsModule],
})
export class EggPresentationsPage {
  private readonly api = inject(EggPresentationsApi);
  readonly items = signal<EggPresentation[]>([]);
  readonly locked = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly editing = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(160)] }),
    eggs_per_unit: new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.max(2147483647), Validators.pattern(/^\d+$/)]),
    default_unit_price: new FormControl<number | null>(null, [Validators.required, Validators.min(0), Validators.max(2147483647), Validators.pattern(/^\d+$/)]),
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(this.api.list());
      this.items.set(response.data);
      this.locked.set(response.meta.locked);
      if (response.meta.locked) this.form.disable();
      else this.form.enable();
    } catch (error) {
      this.error.set(this.errorMessage(error, 'No se pudo consultar el catálogo de presentaciones.'));
    } finally {
      this.loading.set(false);
    }
  }

  edit(item: EggPresentation): void {
    if (this.locked()) return;
    this.editing.set(item.id);
    this.message.set(null);
    this.error.set(null);
    this.form.reset({ name: item.label, eggs_per_unit: item.eggs_per_unit, default_unit_price: item.default_unit_price });
  }

  clear(): void {
    this.editing.set(null);
    this.form.reset();
  }

  async save(): Promise<void> {
    if (this.locked() || this.saving()) return;
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
      const id = this.editing();
      await firstValueFrom(id ? this.api.update(id, body) : this.api.create(body));
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

  private errorMessage(error: unknown, fallback: string): string {
    const body = (error as { error?: { message?: string; errors?: Record<string, string[]> } })?.error;
    return Object.values(body?.errors ?? {})[0]?.[0] ?? body?.message ?? fallback;
  }
}

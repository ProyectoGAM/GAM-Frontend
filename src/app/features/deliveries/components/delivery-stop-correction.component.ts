import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { DeliveriesApi } from '../deliveries.api';
import { Delivery, DeliveryProductionUnit, DeliveryStop, DeliveryStopCorrectionInput } from '../delivery.models';
import { formatDeliveryMoney } from '../delivery-money';

const decimalQuantity = /^\d{1,10}(?:\.\d{1,3})?$/;
const decimalAmount = /^\d{1,19}(?:\.\d{1,3})?$/;

@Component({
  selector: 'app-delivery-stop-correction',
  templateUrl: './delivery-stop-correction.component.html',
  styleUrl: './delivery-stop-correction.component.scss',
})
export class DeliveryStopCorrectionComponent implements OnInit {
  readonly delivery = input.required<Delivery>();
  readonly stop = input.required<DeliveryStop>();
  readonly cancelled = output<void>();
  readonly refreshed = output<string>();

  private readonly api = inject(DeliveriesApi);
  private readonly destroy = inject(DestroyRef);
  private original!: { delivery: Delivery; stop: DeliveryStop };
  private pending: { key: string; body: DeliveryStopCorrectionInput } | null = null;

  protected readonly amounts = signal<string[]>([]);
  protected readonly quantity = signal('');
  protected readonly amount = signal('');
  protected readonly reason = signal('');
  protected readonly returnUnit = signal<number | null>(null);
  protected readonly origins = signal<readonly DeliveryProductionUnit[]>([]);
  protected readonly saving = signal(false);
  protected readonly uncertain = signal(false);
  protected readonly errors = signal<Record<string, string[]>>({});
  protected readonly message = signal('');
  protected readonly money = formatDeliveryMoney;
  protected readonly hasLines = computed(() => !!this.stop().items?.length);
  protected readonly remaining = computed(() => {
    const stop = this.stop();
    const eggs = this.hasLines()
      ? stop.items!.reduce((total, item, index) => total + Math.round(Number(normalize(this.amounts()[index] ?? '')) * 1000) * item.eggs_per_unit / 1000, 0)
      : Number(this.quantity());
    return this.delivery().remaining_quantity + stop.delivered_quantity - eggs;
  });
  protected readonly needsReturn = computed(() => this.delivery().status === 'completed' && this.remaining() > 0);

  ngOnInit(): void {
    const delivery = this.delivery();
    const stop = this.stop();
    this.original = { delivery, stop };
    this.amounts.set(stop.items?.map((item) => item.amount) ?? []);
    this.quantity.set(String(stop.delivered_quantity));
    this.amount.set(stop.total_amount ?? '');
    const units = new Map<number, DeliveryProductionUnit>();
    for (const load of delivery.loads ?? []) {
      if (load.production_unit) units.set(load.production_unit.id, load.production_unit);
    }
    if (!units.size && delivery.production_unit) units.set(delivery.production_unit.id, delivery.production_unit);
    const options = delivery.return_production_unit ? [delivery.return_production_unit] : [...units.values()];
    this.origins.set(options);
    this.returnUnit.set(options.length === 1 ? options[0].id : null);
  }

  protected changeAmount(index: number, value: string): void {
    this.amounts.update((amounts) => amounts.map((old, position) => position === index ? value : old));
  }

  protected lineError(index: number): string | undefined {
    const submitted = this.pending?.body.lineas?.findIndex((line) => line.indice === index);
    return this.errors()['linea.' + index]?.[0]
      ?? (submitted === undefined || submitted < 0 ? undefined : this.errors()['lineas.' + submitted + '.cantidad']?.[0]
        ?? this.errors()['lineas.' + submitted + '.indice']?.[0]);
  }

  protected fieldError(field: string): string | undefined {
    return this.errors()[field]?.[0];
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.saving()) return;
    this.message.set('');
    this.errors.set({});
    if (!this.uncertain()) {
      const body = this.buildBody();
      if (!body) return;
      this.pending = { key: crypto.randomUUID(), body };
    }
    const operation = this.pending;
    if (!operation) return;
    this.saving.set(true);
    this.api.rectifyStop(this.original.delivery.id, this.original.stop.id, operation.body, operation.key).pipe(
      takeUntilDestroyed(this.destroy), finalize(() => this.saving.set(false)),
    ).subscribe({
      next: ({ data }) => {
        this.pending = null;
        this.uncertain.set(false);
        const balance = data.despues.saldo_huevos;
        this.refreshed.emit(balance < 0 ? 'Entrega rectificada. Quedan ' + Math.abs(balance) + ' huevos por regularizar.'
          : balance > 0 ? 'Entrega rectificada. Quedan ' + balance + ' huevos para devolver en el cierre.'
          : 'Entrega rectificada. El saldo del reparto quedó en cero.');
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.pending = null;
          this.uncertain.set(false);
          this.refreshed.emit(error.error?.message ?? 'La entrega cambió. Revisá el detalle actualizado antes de reintentar.');
        } else if (error instanceof HttpErrorResponse && error.status === 422) {
          this.uncertain.set(false);
          this.errors.set(error.error?.errors ?? {});
          this.message.set('Revisá los datos indicados.');
        } else if (!(error instanceof HttpErrorResponse) || error.status === 0 || error.status === 408 || error.status >= 500) {
          this.uncertain.set(true);
          this.message.set('No se pudo confirmar el resultado. Reintentá el mismo envío.');
        } else {
          this.uncertain.set(false);
          this.message.set('No se pudo rectificar la entrega. Revisá tu acceso o intentá nuevamente.');
        }
      },
    });
  }

  private buildBody(): DeliveryStopCorrectionInput | null {
    const stop = this.original.stop;
    const version = stop.version;
    if (version === undefined) {
      this.message.set('El detalle no incluye la versión de esta entrega.');
      return null;
    }
    const errors: Record<string, string[]> = {};
    const motivo = this.reason().trim();
    if (!motivo) errors['motivo'] = ['Ingresá el motivo de la corrección.'];
    const body: DeliveryStopCorrectionInput = { version, motivo };
    let finalEggs = 0;
    const items = stop.items ?? [];
    if (items.length) {
      const lineas: NonNullable<DeliveryStopCorrectionInput['lineas']> = [];
      items.forEach((item, indice) => {
        const cantidad = normalize(this.amounts()[indice]);
        const eggs = Math.round(Number(cantidad) * 1000) * item.eggs_per_unit / 1000;
        if (!decimalQuantity.test(cantidad) || Number(cantidad) > Number(item.amount) || !Number.isInteger(eggs)) {
          errors['linea.' + indice] = ['Ingresá una cantidad válida, hasta la cantidad original y equivalente a huevos enteros.'];
        } else {
          finalEggs += eggs;
          if (Number(cantidad) !== Number(item.amount)) lineas.push({ indice, cantidad });
        }
      });
      if (!lineas.length) errors['lineas'] = ['Reducí al menos una cantidad.'];
      body.lineas = lineas;
    } else {
      const quantity = this.quantity();
      finalEggs = Number(quantity);
      if (!/^\d{1,10}$/.test(quantity) || finalEggs > 2147483647) errors['cantidad_entregada'] = ['Ingresá una cantidad entera de huevos.'];
      body.cantidad_entregada = finalEggs;
      if (finalEggs > 0 && (this.amount() || stop.total_amount != null)) {
        const amount = normalize(this.amount());
        if (!decimalAmount.test(amount)) errors['importe'] = ['Ingresá el importe rectificado en UYU.'];
        else body.importe = amount;
      }
    }
    if (finalEggs >= stop.delivered_quantity) errors['cantidad_entregada'] = ['La rectificación debe reducir los huevos entregados.'];
    const delivery = this.original.delivery;
    if (delivery.status === 'completed' && delivery.remaining_quantity + stop.delivered_quantity - finalEggs > 0) {
      const unit = this.returnUnit();
      if (unit === null) errors['return_production_unit_id'] = ['Confirmá la UP donde se devolverá el sobrante.'];
      else body.return_production_unit_id = unit;
    }
    if (!Object.keys(errors).length) return body;
    this.errors.set(errors);
    this.message.set('Revisá los datos indicados.');
    return null;
  }
}

function normalize(value: string): string {
  return value.trim().replace(',', '.');
}

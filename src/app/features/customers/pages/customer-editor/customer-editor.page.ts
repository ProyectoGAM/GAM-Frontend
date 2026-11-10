import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { CustomerFormComponent } from '../../components/customer-form/customer-form.component';
import { Customer } from '../../interfaces/customer';
import { CustomersApi } from '../../services/customers.api';
import { customerErrorMessage } from '../../services/customer-errors';

@Component({
  selector: 'app-customer-editor',
  template: `
    <section class="customers-page" aria-labelledby="customer-editor-title">
      <header class="page-heading">
        <div>
          <a class="back-link" [routerLink]="busy() ? null : returnUrl" [attr.aria-disabled]="busy()"><span aria-hidden="true">←</span> Volver a clientes</a>
          <h1 id="customer-editor-title">{{ editing() ? 'Editar cliente' : 'Nuevo cliente' }}</h1>
          <p class="lead">{{ editing() ? 'Actualizá los datos de la ficha.' : 'Completá la ficha con los datos que tengas.' }}</p>
        </div>
      </header>
      @if (error(); as message) {
        <p class="feedback error" role="alert">{{ message }} <button class="button" type="button" (click)="load()">Reintentar</button></p>
      }
      @if (loading()) {
        <p class="state card" role="status">Cargando ficha…</p>
      } @else if (!error()) {
        <app-customer-form [customer]="customer()" (saved)="saved($event)" (cancelled)="cancel()" (busyChanged)="busy.set($event)" />
      }
    </section>
  `,
  styleUrls: ['../../customers.scss'],
  styles: [`.back-link { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; margin-bottom: 8px; color: var(--gam-color-primary); font-size: .875rem; font-weight: 600; text-decoration: none; }`],
  imports: [RouterLink, CustomerFormComponent],
})
export class CustomerEditorPage {
  private readonly api = inject(CustomersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;
  readonly customer = signal<Customer | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly editing = signal(false);
  readonly returnUrl: string;

  constructor() {
    const returnUrl: unknown = this.router.getCurrentNavigation()?.extras.state?.['customersReturnUrl'];
    this.returnUrl = typeof returnUrl === 'string' && returnUrl.startsWith('/administracion/clientes/clientes') ? returnUrl : '/administracion/clientes/clientes';
    this.destroyRef.onDestroy(() => { this.requestId++; });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }

  async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    this.editing.set(Boolean(id)); this.error.set(null);
    if (!id) { this.customer.set(null); return; }
    const request = ++this.requestId;
    this.loading.set(true);
    try {
      const response = await firstValueFrom(this.api.detail(id));
      if (request === this.requestId) this.customer.set(response.data);
    } catch (error) { if (request === this.requestId) this.error.set(customerErrorMessage(error, 'No se pudo cargar la ficha.')); }
    finally { if (request === this.requestId) this.loading.set(false); }
  }

  saved(customer: Customer): void { void this.router.navigate(['/administracion/clientes/clientes', customer.id], { state: { customersReturnUrl: this.returnUrl } }); }
  cancel(): void { if (!this.busy()) void this.router.navigateByUrl(this.returnUrl); }
}

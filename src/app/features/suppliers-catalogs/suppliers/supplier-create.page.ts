import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { SupplierFormComponent } from './components/supplier-form/supplier-form.component';

@Component({
  selector: 'app-supplier-create',
  templateUrl: './supplier-create.page.html',
  styleUrl: './supplier-create.page.scss',
  imports: [SupplierFormComponent],
})
export class SupplierCreatePage {
  private readonly router = inject(Router);

  saved(): void {
    void this.router.navigateByUrl('/administracion/proveedores/proveedores', { state: { supplierCreated: true } });
  }

  cancel(): void {
    void this.router.navigateByUrl('/administracion/proveedores/proveedores');
  }
}

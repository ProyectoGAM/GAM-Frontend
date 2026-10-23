import { Location } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { SupplierFormComponent } from './components/supplier-form/supplier-form.component';
import { SupplierEditSeed, SupplierLocality } from './suppliers.models';

function isSupplierLocality(value: unknown): value is SupplierLocality {
  if (typeof value !== 'object' || value === null) return false;
  const locality = value as Record<string, unknown>;
  if (typeof locality['department'] !== 'object' || locality['department'] === null) return false;
  const department = locality['department'] as Record<string, unknown>;
  return Number.isSafeInteger(locality['id'])
    && typeof locality['name'] === 'string'
    && Number.isSafeInteger(department['id'])
    && typeof department['name'] === 'string';
}

function supplierFromState(state: unknown): SupplierEditSeed | null {
  if (typeof state !== 'object' || state === null) return null;
  const supplier = (state as Record<string, unknown>)['supplier'];
  if (typeof supplier !== 'object' || supplier === null) return null;
  const candidate = supplier as Record<string, unknown>;
  const locality = candidate['locality'];
  if (!Number.isSafeInteger(candidate['id'])
      || typeof candidate['name'] !== 'string'
      || typeof candidate['address'] !== 'string'
      || !(locality === null || isSupplierLocality(locality))) return null;
  return {
    id: candidate['id'] as number,
    name: candidate['name'],
    address: candidate['address'],
    locality: locality as SupplierLocality | null,
  };
}

@Component({
  selector: 'app-supplier-edit',
  templateUrl: './supplier-edit.page.html',
  styleUrl: './supplier-edit.page.scss',
  imports: [SupplierFormComponent, RouterLink],
})
export class SupplierEditPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  readonly supplier = signal<SupplierEditSeed | null>(null);

  constructor() {
    const routeId = Number(this.route.snapshot.paramMap.get('id'));
    const states = [this.router.getCurrentNavigation()?.extras.state, this.location.getState()];
    if (Number.isSafeInteger(routeId) && routeId > 0) {
      this.supplier.set(states.map(supplierFromState).find((candidate) => candidate?.id === routeId) ?? null);
    }
  }

  saved(): void {
    void this.router.navigateByUrl('/administracion/proveedores/proveedores', { state: { supplierUpdated: true } });
  }

  cancel(): void {
    void this.router.navigateByUrl('/administracion/proveedores/proveedores');
  }
}

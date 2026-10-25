import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, cubeOutline, documentsOutline } from 'ionicons/icons';

import { AuthStore } from '../../../../core/auth/auth.store';

@Component({
  selector: 'app-inventory-catalog-header',
  imports: [RouterLink, IonIcon],
  templateUrl: './catalog-header.component.html',
  styleUrl: './catalog-header.component.scss',
})
export class CatalogHeaderComponent {
  readonly active = input.required<'stock' | 'products'>();
  private readonly auth = inject(AuthStore);
  readonly canCreate = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('products.manage') === true);
  readonly canViewProducts = computed(() => this.auth.isAdmin()
    || this.auth.user()?.permissions.some((permission) => ['products.view', 'products.manage', 'management-plans.manage'].includes(permission)) === true);
  readonly canViewStock = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.view') === true);

  constructor() { addIcons({ addOutline, cubeOutline, documentsOutline }); }
}

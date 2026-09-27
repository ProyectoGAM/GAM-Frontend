import { Component, inject, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { businessOutline, chevronDownOutline } from 'ionicons/icons';

import { AdminUnitContextService } from '../services/admin-unit-context.service';

@Component({
  selector: 'app-admin-unit-selector',
  templateUrl: './admin-unit-selector.component.html',
  styleUrl: './admin-unit-selector.component.scss',
  imports: [IonIcon],
})
export class AdminUnitSelectorComponent {
  readonly isAdmin = input(false);
  readonly context = inject(AdminUnitContextService);

  constructor() {
    addIcons({ 'business-outline': businessOutline, 'chevron-down-outline': chevronDownOutline });
  }

  selectUnit(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.context.select(value === '' ? null : Number(value));
  }
}

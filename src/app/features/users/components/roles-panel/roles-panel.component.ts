import { afterNextRender, Component, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, shieldCheckmarkOutline } from 'ionicons/icons';

import { MANAGED_ROLES } from '../../services/users-presentation';
import { ManagedRole } from '../../types/managed-role.type';

@Component({
  selector: 'app-user-roles-panel',
  templateUrl: './roles-panel.component.html',
  styleUrl: './roles-panel.component.scss',
  imports: [IonIcon],
})
export class RolesPanelComponent {
  readonly roles = MANAGED_ROLES;
  readonly editor = signal(false);
  readonly selected = signal<{ id: ManagedRole; label: string; description: string } | null>(null);
  private readonly title = viewChild<ElementRef<HTMLElement>>('editorTitle');
  private readonly injector = inject(Injector);
  private returnFocus: HTMLElement | null = null;

  constructor() { addIcons({ addOutline, arrowBackOutline, shieldCheckmarkOutline }); }

  open(role: (typeof MANAGED_ROLES)[number] | null): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.selected.set(role);
    this.editor.set(true);
    afterNextRender(() => this.title()?.nativeElement.focus(), { injector: this.injector });
  }

  back(): void {
    this.editor.set(false);
    afterNextRender(() => { if (this.returnFocus?.isConnected) this.returnFocus.focus(); }, { injector: this.injector });
  }
}

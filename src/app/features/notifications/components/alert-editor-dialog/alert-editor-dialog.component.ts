import { afterNextRender, Component, computed, ElementRef, input, output, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { businessOutline, carOutline, closeOutline } from 'ionicons/icons';

@Component({
  selector: 'app-alert-editor-dialog',
  imports: [IonIcon],
  templateUrl: './alert-editor-dialog.component.html',
  styleUrl: './alert-editor-dialog.component.scss',
})
export class AlertEditorDialogComponent {
  readonly title = input('Editar alerta');
  readonly alertName = input<string>();
  readonly scope = input<string>();
  readonly fleet = input(false);
  readonly saving = input(false);
  readonly dismissRequested = output<void>();
  protected readonly label = computed(() => {
    const alertName = this.alertName();
    return alertName ? `${this.title()}: ${alertName}` : this.title();
  });

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  constructor() {
    addIcons({ 'business-outline': businessOutline, 'car-outline': carOutline, 'close-outline': closeOutline });
    afterNextRender({
      write: () => {
        this.dialog().nativeElement.showModal();
        this.heading().nativeElement.focus({ preventScroll: true });
      },
    });
  }

  protected requestDismiss(event?: Event): void {
    event?.preventDefault();
    if (!this.saving()) this.dismissRequested.emit();
  }
}

import { Component, ElementRef, ViewChild, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

@Component({
  selector: 'app-filter-dialog',
  templateUrl: './filter-dialog.component.html',
  styleUrl: './filter-dialog.component.scss',
  imports: [IonIcon],
})
export class FilterDialogComponent {
  @ViewChild('dialog', { static: true }) private readonly dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('heading', { static: true }) private readonly heading!: ElementRef<HTMLHeadingElement>;
  @ViewChild('body', { static: true }) private readonly body!: ElementRef<HTMLElement>;
  readonly titleId = input.required<string>();
  readonly applyLabel = input('Ver resultados');
  readonly showClear = input(true);
  readonly clearRequested = output<void>();
  readonly applyRequested = output<void>();
  private returnFocusTo: HTMLElement | null = null;

  constructor() { addIcons({ closeOutline }); }

  open(trigger?: HTMLElement | null): void {
    if (this.dialog.nativeElement.open) return;
    this.returnFocusTo = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.dialog.nativeElement.showModal();
    this.body.nativeElement.scrollTop = 0;
    this.heading.nativeElement.focus({ preventScroll: true });
  }

  close(): void {
    if (this.dialog.nativeElement.open) this.dialog.nativeElement.close();
    if (this.returnFocusTo?.isConnected) this.returnFocusTo.focus({ preventScroll: true });
    this.returnFocusTo = null;
  }

  onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }
}

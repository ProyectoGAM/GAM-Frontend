import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-inventory-confirmation-dialog',
  templateUrl: './confirmation-dialog.component.html',
  styleUrl: './confirmation-dialog.component.scss',
})
export class InventoryConfirmationDialogComponent {
  @Input({ required: true }) title = '';
  @Input() message = '';
  @Input() confirmLabel = 'Confirmar';
  @Input() busy = false;
  @Input() errorMessage: string | null = null;
  @Output() readonly confirmed = new EventEmitter<void>();
  @Output() readonly dismissed = new EventEmitter<void>();
  @ViewChild('dialog', { static: true }) private readonly dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('cancelButton', { static: true }) private readonly cancelButton!: ElementRef<HTMLButtonElement>;

  private returnFocusTo: HTMLElement | null = null;

  open(trigger?: HTMLElement | null): void {
    this.returnFocusTo = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const dialog = this.dialog.nativeElement;
    if (!dialog.open) dialog.showModal();
    this.cancelButton.nativeElement.focus();
  }

  dismiss(): void {
    if (this.busy || !this.dialog.nativeElement.open) return;
    this.dialog.nativeElement.close();
    this.returnFocus();
    this.dismissed.emit();
  }

  close(): void {
    if (!this.dialog.nativeElement.open) return;
    this.dialog.nativeElement.close();
    this.returnFocus();
  }

  onCancel(event: Event): void {
    event.preventDefault();
    this.dismiss();
  }

  private returnFocus(): void {
    if (this.returnFocusTo?.isConnected) this.returnFocusTo.focus();
    this.returnFocusTo = null;
  }
}

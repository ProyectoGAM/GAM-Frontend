import { afterRenderEffect, Component, ElementRef, input, OnDestroy, output, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline, lockClosedOutline } from 'ionicons/icons';

import { UserActionConfirmation } from '../../interfaces/user-management.interface';

@Component({
  selector: 'app-user-password-confirmation',
  templateUrl: './password-confirmation.component.html',
  styleUrl: './password-confirmation.component.scss',
  imports: [ReactiveFormsModule, IonIcon, IonSpinner],
})
export class PasswordConfirmationComponent implements OnDestroy {
  readonly action = input<UserActionConfirmation | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly operator = input.required<string>();
  readonly confirm = output<string>();
  readonly cancelled = output<void>();
  readonly visible = signal(false);
  readonly password = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('passwordField');
  private previous: UserActionConfirmation | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor() {
    addIcons({ eyeOffOutline, eyeOutline, lockClosedOutline });
    afterRenderEffect(() => {
      const action = this.action();
      const dialog = this.dialog().nativeElement;
      if (action === this.previous) return;
      this.previous = action;
      this.password.reset();
      this.visible.set(false);
      if (action) {
        this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (!dialog.open) dialog.showModal();
        this.field()?.nativeElement.focus();
      } else {
        if (dialog.open) dialog.close();
        if (this.returnFocus?.isConnected) this.returnFocus.focus();
        this.returnFocus = null;
      }
    });
  }

  submit(): void {
    if (this.busy() || !this.action()) return;
    if (this.password.invalid) { this.password.markAsTouched(); return; }
    const password = this.password.value;
    this.password.reset();
    this.confirm.emit(password);
  }

  cancel(event?: Event): void {
    event?.preventDefault();
    if (this.busy()) return;
    this.password.reset();
    this.cancelled.emit();
  }

  ngOnDestroy(): void {
    this.password.reset();
    if (this.dialog().nativeElement.open) this.dialog().nativeElement.close();
  }
}

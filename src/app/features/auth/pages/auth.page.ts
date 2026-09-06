import { Component, computed, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { AuthStore } from '../../../core/auth/auth.store';
import { SharedUser } from '../../../core/auth/auth.types';

@Component({
  selector: 'app-auth',
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss',
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonSpinner,
    IonText,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
    RouterLink,
  ],
})
export class AuthPage {
  readonly auth = inject(AuthStore);
  readonly selectedUser = signal<SharedUser | null>(null);
  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly showPairing = signal(false);

  readonly loginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly pairingForm = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Z2-9]{10}$/)],
    }),
    name: new FormControl('Tablet compartida', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
  });

  readonly pinForm = new FormGroup({
    pin: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[0-9]{4}$/)],
    }),
  });

  readonly heading = computed(() =>
    this.auth.isShared() ? 'Dispositivo compartido' : 'Ingresar a GAM',
  );

  async submitLogin(): Promise<void> {
    if (this.loginForm.invalid || this.submitting()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { email, password } = this.loginForm.getRawValue();
    await this.auth.login(email, password);
    this.submitting.set(false);
  }

  async submitPairing(): Promise<void> {
    if (this.pairingForm.invalid || this.submitting()) {
      this.pairingForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { code, name } = this.pairingForm.getRawValue();
    await this.auth.pair(code, name);
    this.submitting.set(false);
  }

  chooseUser(user: SharedUser): void {
    this.selectedUser.set(user);
    this.pinForm.reset();
  }

  clearUser(): void {
    this.selectedUser.set(null);
    this.pinForm.reset();
  }

  async submitPin(): Promise<void> {
    const user = this.selectedUser();
    if (!user || this.pinForm.invalid || this.submitting()) {
      this.pinForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { pin } = this.pinForm.getRawValue();
    await this.auth.loginWithPin(user.id, pin);
    this.submitting.set(false);
  }

  async reloadUsers(): Promise<void> {
    await this.auth.loadSharedUsers();
  }
}

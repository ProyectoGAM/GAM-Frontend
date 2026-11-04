import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonSpinner,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, businessOutline, checkmarkCircleOutline, chevronForwardOutline, informationCircleOutline, phonePortraitOutline, refreshOutline } from 'ionicons/icons';

import { AuthStore } from '../../../core/auth/auth.store';
import { SharedUser } from '../../../core/auth/auth.types';
import { postLoginPath } from '../../../core/auth/access-policy';

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
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonSpinner,
    ReactiveFormsModule,
    RouterLink,
  ],
})
export class AuthPage {
  readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly selectedUser = signal<SharedUser | null>(null);
  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly showPairing = signal(false);
  readonly sharedLayout = computed(() => this.showPairing() || this.auth.isShared());
  readonly continuationPath = computed(() => postLoginPath(this.auth.user()));

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

  readonly heading = computed(() => this.showPairing() && !this.auth.isShared() ? 'Vincular este dispositivo'
    : this.auth.status() === 'shared_authenticated' ? 'Sesión activa'
      : this.auth.isShared() ? (this.selectedUser() ? 'Ingresá tu PIN' : '¿Quién va a trabajar?') : 'Ingresar a GAM');

  constructor() {
    addIcons({ arrowBackOutline, businessOutline, checkmarkCircleOutline, chevronForwardOutline, informationCircleOutline, phonePortraitOutline, refreshOutline });
    effect(() => {
      if (this.auth.status() !== 'shared_selector') this.clearUser();
      if (this.auth.isShared()) { this.showPairing.set(false); this.pairingForm.reset(); }
    });
    inject(DestroyRef).onDestroy(() => { this.loginForm.reset(); this.pairingForm.reset(); this.pinForm.reset(); this.selectedUser.set(null); });
  }

  togglePairing(show: boolean): void {
    if (this.submitting()) return;
    this.showPairing.set(show);
    this.loginForm.controls.password.reset(); this.pairingForm.reset();
  }

  async submitLogin(): Promise<void> {
    if (this.loginForm.invalid || this.submitting()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { email, password } = this.loginForm.getRawValue();
    const success = await this.auth.login(email, password);
    this.submitting.set(false);
    if (success) await this.router.navigateByUrl(postLoginPath(this.auth.user()));
  }

  async submitPairing(): Promise<void> {
    this.pairingForm.controls.code.setValue(this.pairingForm.controls.code.value.replace(/\s/g, '').toUpperCase());
    this.pairingForm.controls.name.setValue(this.pairingForm.controls.name.value.trim());
    if (this.pairingForm.invalid || this.submitting()) {
      this.pairingForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { code, name } = this.pairingForm.getRawValue();
    try {
      const success = await this.auth.pair(code, name);
      if (success || this.auth.isShared()) { this.pairingForm.reset(); this.showPairing.set(false); }
    } finally { this.submitting.set(false); }
  }

  chooseUser(user: SharedUser): void {
    if (this.submitting() || this.auth.sharedUsersLoading() || this.auth.status() !== 'shared_selector') return;
    this.selectedUser.set(user);
    this.pinForm.reset();
  }

  clearUser(): void {
    this.selectedUser.set(null);
    this.pinForm.reset();
  }

  async submitPin(): Promise<void> {
    const user = this.selectedUser();
    if (!user || this.auth.status() !== 'shared_selector' || this.pinForm.invalid || this.submitting()) {
      this.pinForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { pin } = this.pinForm.getRawValue();
    const success = await this.auth.loginWithPin(user.id, pin);
    this.pinForm.reset();
    this.submitting.set(false);
    if (success) await this.router.navigateByUrl(postLoginPath(this.auth.user()));
  }

  async reloadUsers(): Promise<void> {
    await this.auth.loadSharedUsers();
  }

  async retryDevice(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    try { await this.auth.retrySharedDevice(); } finally { this.submitting.set(false); }
  }
}

import { Component, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
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
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { AuthStore } from '../../core/auth/auth.store';
import { AuthUser, SharedDevice } from '../../core/auth/auth.types';
import { AdminApi } from './admin.api';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrl: './admin.page.scss',
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
    IonSelect,
    IonSelectOption,
    IonText,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
    RouterLink,
  ],
})
export class AdminPage {
  readonly auth = inject(AuthStore);
  private readonly api = inject(AdminApi);
  readonly users = signal<AuthUser[]>([]);
  readonly devices = signal<SharedDevice[]>([]);
  readonly pairingCode = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly busy = signal(false);
  readonly pinTarget = signal<AuthUser | null>(null);
  readonly passwordTarget = signal<AuthUser | null>(null);

  readonly passwordForm = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly userForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    role: new FormControl('employee', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly deviceForm = new FormGroup({
    name: new FormControl('Tablet compartida', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly pinForm = new FormGroup({
    pin: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^[0-9]{4}$/)] }),
  });
  readonly resetPasswordForm = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    try {
      const [users, devices] = await Promise.all([
        firstValueFrom(this.api.users()),
        firstValueFrom(this.api.devices()),
      ]);
      this.users.set(users.data);
      this.devices.set(devices.data);
    } catch {
      this.message.set('No se pudo cargar la administración.');
    }
  }

  selectPinTarget(user: AuthUser): void {
    this.pinTarget.set(user);
    this.pinForm.reset();
  }

  selectPasswordTarget(user: AuthUser): void {
    this.passwordTarget.set(user);
    this.resetPasswordForm.reset();
  }

  async createUser(): Promise<void> {
    if (this.userForm.invalid || !(await this.confirm())) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    try {
      const value = this.userForm.getRawValue();
      await firstValueFrom(this.api.createUser({
        nombre: value.name,
        correo_electronico: value.email,
        password: value.password,
        password_confirmation: value.password,
        rol: value.role,
      }));
      this.userForm.reset({ role: 'employee', name: '', email: '', password: '' });
      this.message.set('Usuario creado.');
      await this.reload();
    } catch {
      this.message.set('No se pudo crear el usuario.');
    } finally {
      this.busy.set(false);
    }
  }

  async setPin(): Promise<void> {
    const target = this.pinTarget();
    const pin = this.pinForm.controls.pin.value;
    if (!target || !/^[0-9]{4}$/.test(pin) || !(await this.confirm())) {
      this.pinForm.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    try {
      await firstValueFrom(this.api.setPin(target.id, pin));
      this.message.set('PIN configurado.');
      this.pinTarget.set(null);
      await this.reload();
    } catch {
      this.message.set('No se pudo configurar el PIN.');
    } finally {
      this.busy.set(false);
    }
  }

  async toggleUser(user: AuthUser): Promise<void> {
    if (!(await this.confirm())) {
      return;
    }

    this.busy.set(true);
    try {
      await firstValueFrom(this.api.changeStatus(user.id, Boolean(user.deleted_at)));
      await this.reload();
    } catch {
      this.message.set('No se pudo cambiar el estado del usuario.');
    } finally {
      this.busy.set(false);
    }
  }

  async unlockPin(user: AuthUser): Promise<void> {
    if (!(await this.confirm())) {
      return;
    }

    this.busy.set(true);
    try {
      await firstValueFrom(this.api.unlockPin(user.id));
      this.message.set('PIN desbloqueado.');
    } catch {
      this.message.set('No se pudo desbloquear el PIN.');
    } finally {
      this.busy.set(false);
    }
  }

  async resetPassword(): Promise<void> {
    const target = this.passwordTarget();
    const password = this.resetPasswordForm.controls.password.value;
    if (!target || this.resetPasswordForm.invalid || !(await this.confirm())) {
      this.resetPasswordForm.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    try {
      await firstValueFrom(this.api.resetPassword(target.id, password));
      this.passwordTarget.set(null);
      this.message.set('Contraseña restablecida; sus sesiones anteriores fueron revocadas.');
    } catch {
      this.message.set('No se pudo restablecer la contraseña.');
    } finally {
      this.busy.set(false);
    }
  }

  async revokeSessions(user: AuthUser): Promise<void> {
    if (!(await this.confirm())) {
      return;
    }

    this.busy.set(true);
    try {
      await firstValueFrom(this.api.revokeSessions(user.id));
      this.message.set('Sesiones revocadas.');
    } catch {
      this.message.set('No se pudieron revocar las sesiones.');
    } finally {
      this.busy.set(false);
    }
  }

  async generateCode(): Promise<void> {
    if (this.deviceForm.invalid || !(await this.confirm())) {
      this.deviceForm.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    try {
      const response = await firstValueFrom(
        this.api.generateCode(this.deviceForm.controls.name.value),
      );
      this.pairingCode.set(response.code);
      this.message.set('Código generado. No se guarda en el navegador.');
    } catch {
      this.message.set('No se pudo generar el código.');
    } finally {
      this.busy.set(false);
    }
  }

  async revokeDevice(device: SharedDevice): Promise<void> {
    if (!(await this.confirm())) {
      return;
    }

    this.busy.set(true);
    try {
      await firstValueFrom(this.api.revokeDevice(device.id));
      this.message.set('Dispositivo revocado.');
      await this.reload();
    } catch {
      this.message.set('No se pudo revocar el dispositivo.');
    } finally {
      this.busy.set(false);
    }
  }

  private async confirm(): Promise<boolean> {
    const password = this.passwordForm.controls.password.value;
    if (!password) {
      this.passwordForm.markAllAsTouched();
      this.message.set('Confirma tu contraseña antes de continuar.');
      return false;
    }

    return this.auth.confirmPassword(password);
  }
}

import {
  Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar, NavController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { postLoginPath } from '../../../core/auth/access-policy';
import { AuthStore } from '../../../core/auth/auth.store';
import { OwnCredential } from '../../../core/auth/auth.types';
import { InitialAvatarComponent } from '../../../shared/components/initial-avatar.component';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
  imports: [
    InitialAvatarComponent, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar,
    ReactiveFormsModule,
  ],
})
export class ProfilePage {
  private readonly auth = inject(AuthStore);
  private readonly units = inject(ProductionUnitsService);
  private readonly route = inject(ActivatedRoute);
  private readonly nav = inject(NavController);
  private readonly toasts = inject(ToastController);
  private readonly injector = inject(Injector);
  private readonly active = signal(false);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');

  readonly user = this.auth.user;
  readonly settingUpDeliveryPin = signal(false);
  readonly returnPath = computed(() => this.settingUpDeliveryPin() ? '/repartidor' : postLoginPath(this.user()));
  readonly isPin = computed(() => {
    const modality = this.user()?.modalidad_acceso;
    return modality ? modality === 'device_pin' : this.auth.session()?.auth_method === 'pin' || this.auth.isShared();
  });
  readonly role = computed(() => {
    const user = this.user();
    if (user?.rol !== undefined) return user.rol?.nombre ?? 'Sin rol asignado';
    return user?.roles.join(', ') || 'Sin rol asignado';
  });
  private readonly unitId = computed(() => {
    if (!this.active()) return null;
    const assigned = this.user()?.up_id;
    return assigned === undefined ? this.auth.session()?.up_id ?? null : assigned;
  });
  readonly unit = toSignal(toObservable(this.unitId).pipe(
    switchMap((id) => id === null ? of('Sin UP asignada') : this.units.getById(id).pipe(
      map(({ data }) => data.name),
      startWith('Consultando unidad productiva…'),
      catchError(() => of(`UP #${id}`)),
    )),
  ), { initialValue: 'Consultando unidad productiva…' });

  readonly editing = signal<OwnCredential | null>(null);
  readonly pinFields = computed(() => this.editing() === 'pin' || this.editing() === 'operation_pin');
  readonly operationPinAction = computed(() => this.user()?.pin_operativo_configurado
    ? 'Cambiar PIN operativo' : 'Configurar PIN operativo');
  readonly credentialTitle = computed(() => this.editing() === 'operation_pin'
    ? this.operationPinAction() : this.editing() === 'pin' ? 'Cambiar PIN' : 'Cambiar contraseña');
  readonly saving = signal(false);
  readonly signingOut = signal(false);
  readonly error = signal('');
  readonly form = new FormGroup({
    current: new FormControl('', { nonNullable: true }),
    next: new FormControl('', { nonNullable: true }),
    confirmation: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    addIcons({ arrowBackOutline });
    effect(() => {
      if (this.active() && !this.auth.isAuthenticated() && !this.saving() && !this.signingOut()) {
        this.resetForm();
        void this.nav.navigateRoot('/auth', { replaceUrl: true });
      }
    });
  }

  ionViewWillEnter(): void {
    this.active.set(true);
    const setupDeliveryPin = this.route.snapshot.queryParamMap.get('configurar') === 'pin-operativo'
      && !this.isPin() && this.user()?.pin_operativo_configurado === false;
    this.settingUpDeliveryPin.set(setupDeliveryPin);
    if (setupDeliveryPin) this.setEditing('operation_pin');
  }

  ionViewWillLeave(): void {
    this.active.set(false);
    this.resetForm();
  }

  setEditing(editing: OwnCredential | null): void {
    if (this.saving() || this.signingOut() || (editing !== null && (editing === 'pin') !== this.isPin())) return;
    this.resetForm();
    this.editing.set(editing);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  async signOut(): Promise<void> {
    if (this.signingOut() || this.saving()) return;
    this.signingOut.set(true);
    this.resetForm();
    try {
      if (this.auth.isShared()) {
        await this.auth.finishSharedSession();
      } else {
        await this.auth.logout();
      }
      await this.nav.navigateRoot('/auth', { replaceUrl: true });
    } catch {
      if (this.active()) this.error.set('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    } finally {
      this.signingOut.set(false);
    }
  }

  async save(): Promise<void> {
    const credential = this.editing();
    if (!credential || this.saving()) return;
    const { current, next, confirmation } = this.form.getRawValue();
    const pin = credential !== 'password';
    if (!current || !next || !confirmation) {
      this.error.set('Completa los tres campos.');
      return;
    }
    const pinValues = credential === 'pin' ? [current, next, confirmation] : [next, confirmation];
    if (pin && !pinValues.every((value) => /^[0-9]{4}$/.test(value))) {
      this.error.set(credential === 'operation_pin' ? 'Ingresa cuatro dígitos para el PIN operativo.' : 'Ingresa cuatro dígitos en cada campo.');
      return;
    }
    if (!pin && [...next].length < 8) {
      this.error.set('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (next !== confirmation) {
      this.error.set(pin ? 'Los PIN nuevos no coinciden.' : 'Las contraseñas nuevas no coinciden.');
      return;
    }

    this.error.set('');
    this.saving.set(true);
    try {
      const error = await this.auth.changeCredential(credential, current, next, confirmation);
      if (error) {
        if (this.active()) this.error.set(error);
        return;
      }
      this.resetForm();
      await this.nav.navigateRoot('/auth', { replaceUrl: true });
      const toast = await this.toasts.create({
        cssClass: 'profile-credential-toast',
        duration: 5000,
        message: credential === 'operation_pin' ? 'PIN operativo guardado. Vuelve a ingresar.'
          : pin ? 'PIN actualizado. Vuelve a ingresar.' : 'Contraseña actualizada. Vuelve a ingresar.',
      });
      await toast.present();
    } finally {
      this.saving.set(false);
    }
  }

  private resetForm(): void {
    this.form.reset();
    this.error.set('');
    this.editing.set(null);
  }
}

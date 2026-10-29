import { DatePipe } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, chevronForwardOutline, addOutline, peopleOutline, lockClosedOutline, phonePortraitOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { AuthUser } from '../../../core/auth/auth.types';
import { PasswordConfirmationComponent } from '../components/password-confirmation/password-confirmation.component';
import { RolesPanelComponent } from '../components/roles-panel/roles-panel.component';
import { ManagedDevice, PairingCode, UserActionConfirmation } from '../interfaces/user-management.interface';
import { isManagedRole, MANAGED_ROLES, managedRoleLabel, userManagementError } from '../services/users-presentation';
import { UsersService } from '../services/users.service';
import { ManagedRole } from '../types/managed-role.type';
import { UserManagementAction } from '../types/user-management-action.type';

@Component({
  selector: 'app-users',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, IonIcon, IonSpinner, PasswordConfirmationComponent, RolesPanelComponent],
  templateUrl: './users.page.html',
  styleUrl: './users.page.scss',
})
export class UsersPage {
  readonly auth = inject(AuthStore);
  private readonly api = inject(UsersService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly pageTitle = viewChild<ElementRef<HTMLElement>>('pageTitle');
  private readonly accountTitle = viewChild<ElementRef<HTMLElement>>('accountTitle');
  private readonly editorTitle = viewChild<ElementRef<HTMLElement>>('editorTitle');
  readonly tab = inject(ActivatedRoute).snapshot.data['tab'] as 'users' | 'create' | 'devices' | 'roles';
  readonly tabs = [
    { id: 'users', label: 'Usuarios', path: '/administracion/usuarios' },
    { id: 'create', label: 'Crear', path: '/administracion/usuarios/crear' },
    { id: 'devices', label: 'Dispositivos', path: '/administracion/usuarios/dispositivos' },
    { id: 'roles', label: 'Roles', path: '/administracion/usuarios/roles' },
  ];
  readonly roles = MANAGED_ROLES;
  readonly roleLabel = managedRoleLabel;
  readonly users = signal<AuthUser[]>([]);
  readonly devices = signal<ManagedDevice[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly query = signal('');
  readonly statusFilter = signal('all');
  readonly page = signal(1);
  readonly lastPage = signal<number | null>(null);
  readonly selected = signal<AuthUser | null>(null);
  readonly editor = signal<'roles' | 'pin' | 'password' | null>(null);
  readonly confirmation = signal<UserActionConfirmation | null>(null);
  readonly confirmationError = signal('');
  readonly busy = signal(false);
  readonly pairing = signal<PairingCode | null>(null);
  readonly now = signal(Date.now());
  readonly canChange = computed(() => this.auth.isAdmin() && this.auth.isAuthenticated() && !this.auth.isShared());
  readonly visibleUsers = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.users().filter((user) => (!query || `${user.name} ${user.email}`.toLocaleLowerCase().includes(query))
      && (this.statusFilter() === 'all' || (this.statusFilter() === 'enabled') === !user.deleted_at));
  });
  readonly canNext = computed(() => this.lastPage() !== null ? this.page() < this.lastPage()! : this.users().length > 0);
  readonly remaining = computed(() => Math.max(0, Math.ceil((Date.parse(this.pairing()?.expires_at ?? '') - this.now()) / 60000)));
  readonly createForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(255)] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    password_confirmation: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    role: new FormControl<ManagedRole>('employee', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly rolesForm = new FormGroup({ admin: new FormControl(false, { nonNullable: true }), employee: new FormControl(false, { nonNullable: true }), delivery: new FormControl(false, { nonNullable: true }) });
  readonly credentialForm = new FormGroup({ value: new FormControl('', { nonNullable: true }), confirmation: new FormControl('', { nonNullable: true }) });
  readonly deviceName = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] });
  private pending: UserManagementAction | null = null;
  private pendingOwner = '';
  private codeTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor() {
    addIcons({ arrowBackOutline, chevronForwardOutline, addOutline, peopleOutline, lockClosedOutline, phonePortraitOutline });
    const owner = this.owner();
    effect(() => { if (this.owner() !== owner || !this.canChange()) this.clearSensitive(); });
    this.destroyRef.onDestroy(() => { this.destroyed = true; this.clearSensitive(); });
    if (this.tab === 'users' || this.tab === 'devices') void this.load();
  }

  async load(page = this.page()): Promise<void> {
    if (this.loading()) return;
    const owner = this.owner();
    this.loading.set(true);
    this.error.set('');
    try {
      if (this.tab === 'devices') {
        const devices = await firstValueFrom(this.api.devices().pipe(takeUntilDestroyed(this.destroyRef)));
        if (this.owner() === owner && !this.destroyed) this.devices.set(devices);
      } else {
        const result = await firstValueFrom(this.api.users(page).pipe(takeUntilDestroyed(this.destroyRef)));
        if (this.owner() !== owner || this.destroyed) return;
        this.users.set(result.users);
        this.page.set(result.page);
        this.lastPage.set(result.lastPage);
        const selectedId = this.selected()?.id;
        if (selectedId) this.selected.set(result.users.find((user) => user.id === selectedId) ?? null);
      }
    } catch (error) {
      if (!this.destroyed && this.owner() === owner) this.error.set(userManagementError(error, 'No se pudo cargar la información.'));
    } finally { if (!this.destroyed) this.loading.set(false); }
  }

  openUser(user: AuthUser): void {
    this.selected.set(user); this.editor.set(null); this.error.set(''); this.message.set('');
    afterNextRender(() => this.accountTitle()?.nativeElement.focus(), { injector: this.injector });
  }
  back(): void {
    this.selected.set(null); this.editor.set(null); this.credentialForm.reset(); this.error.set('');
    afterNextRender(() => this.pageTitle()?.nativeElement.focus(), { injector: this.injector });
  }
  isOwn(user: AuthUser): boolean { return user.id === this.auth.user()?.id; }
  canManagePin(user: AuthUser): boolean { return !user.deleted_at && !user.roles.includes('admin'); }

  openEditor(kind: 'roles' | 'pin' | 'password'): void {
    const user = this.selected();
    if (!user) return;
    if (kind === 'roles' && user.roles.some((role) => !isManagedRole(role))) {
      this.error.set('Por implementar: la API no permite editar los roles personalizados de esta cuenta.'); return;
    }
    this.rolesForm.setValue({ admin: user.roles.includes('admin'), employee: user.roles.includes('employee'), delivery: user.roles.includes('delivery') });
    this.credentialForm.reset();
    this.editor.set(kind);
    this.error.set('');
    afterNextRender(() => this.editorTitle()?.nativeElement.focus(), { injector: this.injector });
  }

  create(): void {
    this.createForm.markAllAsTouched();
    const request = this.createForm.getRawValue();
    if (this.createForm.invalid || !request.name.trim() || request.password !== request.password_confirmation) {
      this.error.set('Revisá los campos. La contraseña debe tener al menos 8 caracteres y coincidir con su confirmación.'); return;
    }
    this.prepare({ kind: 'create', request: { ...request, name: request.name.trim(), email: request.email.trim() } },
      { title: 'Crear usuario', target: request.name, description: `Se creará una cuenta con el rol ${managedRoleLabel(request.role)}.`, button: 'Confirmar y crear' });
  }

  saveEditor(): void {
    const user = this.selected();
    const kind = this.editor();
    if (!user || !kind) return;
    if (kind === 'roles') {
      const roles = this.roles.filter((role) => this.rolesForm.controls[role.id].value).map((role) => role.id);
      if (!roles.length) { this.error.set('Seleccioná al menos un rol.'); return; }
      if (this.isOwn(user)) return;
      this.prepare({ kind: 'roles', userId: user.id, roles }, { title: 'Cambiar roles', target: user.name, description: `Roles seleccionados: ${roles.map(managedRoleLabel).join(', ')}.`, button: 'Confirmar y guardar' });
      return;
    }
    const { value, confirmation } = this.credentialForm.getRawValue();
    if (value !== confirmation || (kind === 'pin' ? !/^\d{4}$/.test(value) : value.length < 8)) {
      this.error.set(kind === 'pin' ? 'Ingresá cuatro dígitos y repetí el mismo PIN.' : 'Ingresá al menos 8 caracteres y repetí la misma contraseña.'); return;
    }
    this.prepare(kind === 'pin' ? { kind, userId: user.id, pin: value, confirmation } : { kind, userId: user.id, password: value, confirmation },
      { title: kind === 'pin' ? 'Configurar PIN' : 'Cambiar contraseña', target: user.name, description: kind === 'pin' ? 'Se reemplazará el PIN de acceso compartido.' : 'Se reemplazará la contraseña de esta cuenta. Sus sesiones pueden cerrarse.', button: 'Confirmar y guardar' });
  }

  userAction(kind: 'status' | 'deletePin' | 'unlockPin' | 'sessions'): void {
    const user = this.selected();
    if (!user || (kind === 'status' && this.isOwn(user))) return;
    const labels = { status: user.deleted_at ? 'Habilitar usuario' : 'Deshabilitar usuario', deletePin: 'Eliminar PIN', unlockPin: 'Desbloquear PIN', sessions: 'Cerrar sesiones' };
    const descriptions = { status: user.deleted_at ? 'La cuenta podrá volver a iniciar sesión.' : 'La cuenta perderá el acceso y se revocarán sus sesiones.', deletePin: 'La cuenta dejará de acceder con PIN en dispositivos compartidos.', unlockPin: 'Se reiniciará el bloqueo por intentos fallidos del PIN.', sessions: 'Se cerrarán las sesiones activas de esta cuenta. Tendrá que volver a ingresar.' };
    this.prepare(kind === 'status' ? { kind, userId: user.id, enabled: !!user.deleted_at } : { kind, userId: user.id },
      { title: labels[kind], target: user.name, description: descriptions[kind], button: `Confirmar: ${labels[kind].toLocaleLowerCase()}`, destructive: kind !== 'unlockPin' && !(kind === 'status' && user.deleted_at) });
  }

  generateCode(): void {
    this.deviceName.markAsTouched();
    if (this.deviceName.invalid || !this.deviceName.value.trim()) return;
    this.prepare({ kind: 'code', name: this.deviceName.value.trim() }, { title: 'Generar código de vinculación', target: this.deviceName.value.trim(), description: 'El código permitirá vincular un dispositivo compartido y se mostrará hasta que venza o salgas de esta pestaña.', button: 'Confirmar y generar' });
  }

  revokeDevice(device: ManagedDevice): void {
    this.prepare({ kind: 'revokeDevice', deviceId: device.id }, { title: 'Desvincular dispositivo', target: device.name, description: 'Se revocará el acceso de este dispositivo compartido.', button: 'Confirmar y desvincular', destructive: true });
  }

  cancelConfirmation(): void {
    if (this.busy()) return;
    this.pending = null; this.confirmation.set(null); this.confirmationError.set('');
  }

  async confirm(password: string): Promise<void> {
    const action = this.pending;
    const owner = this.pendingOwner;
    if (!action || this.busy() || !this.canChange() || this.owner() !== owner) return;
    this.busy.set(true); this.confirmationError.set('');
    try {
      const verified = await this.auth.confirmPassword(password);
      if (this.destroyed || this.pending !== action || this.owner() !== owner || !this.canChange()) return;
      if (!verified) { this.confirmationError.set(this.auth.errorMessage() ?? 'No se pudo confirmar la contraseña.'); return; }
      const result = await firstValueFrom(this.api.execute(action).pipe(takeUntilDestroyed(this.destroyRef)));
      if (this.destroyed || this.owner() !== owner) return;
      this.pending = null; this.confirmation.set(null); this.editor.set(null);
      this.credentialForm.reset();
      this.message.set('Cambio realizado correctamente.');
      if (action.kind === 'create') this.createForm.reset();
      if (action.kind === 'code') this.showCode(result);
      if ((action.kind === 'password' || action.kind === 'sessions') && action.userId === this.auth.user()?.id) {
        await this.auth.logout(); await this.router.navigateByUrl('/auth'); return;
      }
      if (this.tab === 'users' || this.tab === 'devices') await this.load();
    } catch (error) {
      if (!this.destroyed && this.owner() === owner) {
        this.pending = null; this.confirmation.set(null);
        this.error.set(userManagementError(error, 'No pudimos confirmar el resultado. Actualizá la información antes de volver a intentarlo.'));
      }
    } finally { if (!this.destroyed) this.busy.set(false); }
  }

  deviceActive(device: ManagedDevice): boolean {
    return !device.revoked_at && (!device.expires_at || Date.parse(device.expires_at) > Date.now());
  }

  private prepare(action: UserManagementAction, confirmation: UserActionConfirmation): void {
    if (!this.canChange() || this.busy()) return;
    this.error.set(''); this.message.set(''); this.confirmationError.set('');
    this.pendingOwner = this.owner(); this.pending = action; this.confirmation.set(confirmation);
  }

  private owner(): string { return `${this.auth.user()?.id ?? ''}:${this.auth.session()?.id ?? ''}:${this.auth.status()}`; }

  private showCode(result: unknown): void {
    this.clearCode();
    if (!result || typeof result !== 'object' || !('code' in result) || !('expires_at' in result)
      || typeof result.code !== 'string' || typeof result.expires_at !== 'string' || !Number.isFinite(Date.parse(result.expires_at))) {
      this.error.set('El servidor no entregó un código de vinculación válido.'); return;
    }
    this.pairing.set({ code: result.code, expires_at: result.expires_at });
    const tick = (): void => {
      this.now.set(Date.now());
      if (Date.parse(this.pairing()?.expires_at ?? '') <= this.now()) {
        this.clearCode(); this.message.set('El código venció. Podés generar uno nuevo.');
      }
    };
    tick();
    if (this.pairing()) this.codeTimer = setInterval(tick, 1000);
  }

  private clearCode(): void { if (this.codeTimer !== null) clearInterval(this.codeTimer); this.codeTimer = null; this.pairing.set(null); }
  private clearSensitive(): void {
    this.pending = null; this.confirmation.set(null); this.clearCode();
    this.createForm.reset(); this.credentialForm.reset(); this.deviceName.reset();
    this.users.set([]); this.devices.set([]); this.selected.set(null);
  }
}

import { DatePipe } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, arrowForwardOutline, businessOutline, checkmarkCircleOutline, chevronForwardOutline, addOutline, peopleOutline, lockClosedOutline, phonePortraitOutline, refreshOutline, timeOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { AuthUser } from '../../../core/auth/auth.types';
import { PasswordConfirmationComponent } from '../components/password-confirmation/password-confirmation.component';
import { RolesPanelComponent } from '../components/roles-panel/roles-panel.component';
import { DeviceProductionUnit, ManagedDevice, PairingCode, UserActionConfirmation } from '../interfaces/user-management.interface';
import { managedRoleLabel, userManagementError } from '../services/users-presentation';
import { UsersService } from '../services/users.service';
import { ManagedRoleDefinition } from '../interfaces/role-management.interface';
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
  private readonly route = inject(ActivatedRoute);
  private readonly pageTitle = viewChild<ElementRef<HTMLElement>>('pageTitle');
  private readonly accountTitle = viewChild<ElementRef<HTMLElement>>('accountTitle');
  private readonly editorTitle = viewChild<ElementRef<HTMLElement>>('editorTitle');
  private readonly rolesPanel = viewChild(RolesPanelComponent);
  readonly tab = this.route.snapshot.data['tab'] as 'users' | 'create' | 'devices' | 'roles';
  canLeave(): Promise<boolean> | boolean { return this.rolesPanel()?.canLeave() ?? true; }
  readonly tabs = [
    { id: 'users', label: 'Usuarios', path: '/administracion/usuarios' },
    { id: 'create', label: 'Crear', path: '/administracion/usuarios/crear' },
    { id: 'devices', label: 'Dispositivos', path: '/administracion/usuarios/dispositivos' },
    { id: 'roles', label: 'Roles', path: '/administracion/usuarios/roles' },
  ];
  readonly roles = signal<ManagedRoleDefinition[]>([]);
  readonly rolesLoading = signal(false);
  readonly rolesError = signal('');
  readonly assignedRole = new FormControl<number | null>(null, { validators: [Validators.required] });
  readonly roleLabel = managedRoleLabel;
  readonly users = signal<AuthUser[]>([]);
  readonly devices = signal<ManagedDevice[]>([]);
  readonly deviceUnits = signal<DeviceProductionUnit[]>([]);
  readonly unitsLoading = signal(false);
  readonly unitsError = signal('');
  readonly devicesLoaded = signal(false);
  readonly activeUnits = computed(() => this.deviceUnits().filter((unit) => unit.status === 'active'));
  readonly unitNames = computed(() => new Map(this.deviceUnits().map((unit) => [unit.id, unit.name])));
  readonly pairingContext = signal<{ name: string; upName: string } | null>(null);
  readonly formattedCode = computed(() => this.pairing()?.code.replace(/^(.{5})(.{5})$/, '$1 $2') ?? '');
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
    rol_id: new FormControl<number | null>(null, { validators: [Validators.required] }),
  });
  readonly credentialForm = new FormGroup({ value: new FormControl('', { nonNullable: true }), confirmation: new FormControl('', { nonNullable: true }) });
  readonly deviceName = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] });
  readonly deviceUnit = new FormControl<number | null>(null, { validators: [Validators.required] });
  private readonly deviceUnitId = toSignal(this.deviceUnit.valueChanges, { initialValue: null });
  readonly chosenUnit = computed(() => this.activeUnits().find((unit) => unit.id === this.deviceUnitId()) ?? null);
  private pending: UserManagementAction | null = null;
  private pendingOwner = '';
  private codeTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor() {
    addIcons({ arrowBackOutline, arrowForwardOutline, businessOutline, checkmarkCircleOutline, chevronForwardOutline, addOutline, peopleOutline, lockClosedOutline, phonePortraitOutline, refreshOutline, timeOutline });
    const owner = this.owner();
    effect(() => { if (this.owner() !== owner || !this.canChange()) this.clearSensitive(); });
    this.destroyRef.onDestroy(() => { this.destroyed = true; this.clearSensitive(); });
    const linkedUser = this.route.snapshot.paramMap?.get('userId');
    if (this.tab === 'users' && linkedUser) void this.loadLinkedUser(linkedUser);
    else if (this.tab === 'users' || this.tab === 'devices') void this.load();
    if (this.tab === 'devices') void this.loadDeviceUnits();
    if (this.tab === 'create') void this.loadRoles();
  }

  async loadRoles(): Promise<void> {
    if (this.rolesLoading() || !this.canChange()) return;
    const owner = this.owner(); const selectedId = this.selected()?.id;
    this.rolesLoading.set(true); this.rolesError.set('');
    try {
      const roles = await firstValueFrom(this.api.roleOptions().pipe(takeUntilDestroyed(this.destroyRef)));
      if (this.destroyed || this.owner() !== owner) return;
      this.roles.set(roles);
      if (this.editor() === 'roles' && this.selected()?.id === selectedId) {
        const user = this.selected();
        this.assignedRole.setValue(user?.rol?.id ?? roles.find((role) => user?.roles.includes(role.clave))?.id ?? null);
      }
    } catch (error) { if (!this.destroyed && this.owner() === owner) this.rolesError.set(userManagementError(error, 'No se pudieron cargar los roles.')); }
    finally { if (!this.destroyed) this.rolesLoading.set(false); }
  }

  async loadDeviceUnits(): Promise<void> {
    if (this.unitsLoading() || !this.canChange()) return;
    const owner = this.owner();
    this.unitsLoading.set(true); this.unitsError.set('');
    try {
      const units = await firstValueFrom(this.api.deviceUnits().pipe(takeUntilDestroyed(this.destroyRef)));
      if (this.destroyed || this.owner() !== owner) return;
      this.deviceUnits.set(units);
      if (!units.some((unit) => unit.id === this.deviceUnit.value && unit.status === 'active')) this.deviceUnit.reset();
    } catch (error) {
      if (!this.destroyed && this.owner() === owner) this.unitsError.set(userManagementError(error, 'No se pudieron cargar las unidades productivas.'));
    } finally { if (!this.destroyed) this.unitsLoading.set(false); }
  }

  private async loadLinkedUser(value: string): Promise<void> {
    if (!/^[1-9]\d*$/.test(value)) { this.error.set('El usuario solicitado no es válido.'); return; }
    const owner = this.owner();
    this.loading.set(true);
    try {
      const users = await this.api.allUsers();
      if (this.destroyed || this.owner() !== owner) return;
      const user = users.find((item) => String(item.id) === value);
      if (user) this.openUser(user);
      else this.error.set('Este usuario ya no está disponible. Puedes volver al listado de usuarios.');
    } catch {
      if (!this.destroyed && this.owner() === owner) this.error.set('No se pudo abrir el usuario. Intenta cargar el listado de nuevo.');
    } finally { if (!this.destroyed) this.loading.set(false); }
  }

  async load(page = this.page()): Promise<void> {
    if (this.loading()) return;
    const linkedUser = this.route.snapshot.paramMap?.get('userId');
    if (this.tab === 'users' && linkedUser) { await this.loadLinkedUser(linkedUser); return; }
    const owner = this.owner();
    this.loading.set(true);
    this.error.set('');
    try {
      if (this.tab === 'devices') {
        this.devicesLoaded.set(false);
        const devices = await firstValueFrom(this.api.devices().pipe(takeUntilDestroyed(this.destroyRef)));
        if (this.owner() === owner && !this.destroyed) { this.devices.set(devices); this.devicesLoaded.set(true); }
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
    if (this.route.snapshot.paramMap?.get('userId')) { void this.router.navigateByUrl('/administracion/usuarios'); return; }
    this.selected.set(null); this.editor.set(null); this.credentialForm.reset(); this.error.set('');
    afterNextRender(() => this.pageTitle()?.nativeElement.focus(), { injector: this.injector });
  }
  isOwn(user: AuthUser): boolean { return user.id === this.auth.user()?.id; }
  canManagePin(user: AuthUser): boolean { return !user.deleted_at && !user.roles.includes('admin') && user.modalidad_acceso !== 'email_password'; }

  openEditor(kind: 'roles' | 'pin' | 'password'): void {
    const user = this.selected();
    if (!user) return;
    this.credentialForm.reset();
    this.editor.set(kind);
    if (kind === 'roles') { this.assignedRole.reset(); void this.loadRoles(); }
    this.error.set('');
    afterNextRender(() => this.editorTitle()?.nativeElement.focus(), { injector: this.injector });
  }

  create(): void {
    this.createForm.markAllAsTouched();
    const request = this.createForm.getRawValue();
    const role = this.roles().find((item) => item.id === request.rol_id);
    if (this.rolesLoading() || this.rolesError() || this.createForm.invalid || !request.name.trim() || request.password !== request.password_confirmation || !role) {
      this.error.set('Revisá los campos. La contraseña debe tener al menos 8 caracteres y coincidir con su confirmación.'); return;
    }
    this.prepare({ kind: 'create', request: { ...request, rol_id: role.id, name: request.name.trim(), email: request.email.trim() } },
      { title: 'Crear usuario', target: request.name, description: `Se creará una cuenta con el rol ${role.nombre}.`, button: 'Confirmar y crear' });
  }

  saveEditor(): void {
    const user = this.selected();
    const kind = this.editor();
    if (!user || !kind) return;
    if (kind === 'roles') {
      const role = this.roles().find((item) => item.id === this.assignedRole.value);
      if (!role || this.rolesLoading() || this.rolesError()) { this.error.set('Seleccioná un rol del catálogo.'); return; }
      if (user.modalidad_acceso === 'device_pin' && role.clave === 'admin') { this.error.set('Una cuenta con PIN no puede recibir el rol Administrador.'); return; }
      if (this.isOwn(user)) return;
      this.prepare({ kind: 'roles', userId: user.id, roleId: role.id }, { title: 'Cambiar rol', target: user.name, description: `Rol seleccionado: ${role.nombre}.${role.clave === 'unassigned' ? ' La cuenta perderá el acceso y se cerrarán sus sesiones.' : ' Sus permisos provienen de este único rol.'}`, button: 'Confirmar y guardar' });
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
    this.deviceName.markAsTouched(); this.deviceUnit.markAsTouched();
    const unit = this.chosenUnit();
    if (this.pairing() || this.unitsLoading() || this.unitsError() || this.deviceName.invalid || !this.deviceName.value.trim() || !unit) return;
    this.prepare({ kind: 'code', name: this.deviceName.value.trim(), upId: unit.id }, { title: 'Generar código de vinculación', target: `${this.deviceName.value.trim()} · ${unit.name}`, description: `El equipo quedará vinculado a ${unit.name}. Solo podrán ingresar las cuentas con PIN habilitadas de esa unidad. El código es de un solo uso.`, button: 'Confirmar y generar' });
  }

  revokeDevice(device: ManagedDevice): void {
    if (!this.deviceActive(device)) return;
    const unit = device.up_id ? this.unitNames().get(device.up_id) ?? `UP ${device.up_id}` : 'Sin UP asignada';
    this.prepare({ kind: 'revokeDevice', deviceId: device.id }, { title: 'Desvincular dispositivo', target: `${device.name} · ${unit}`, description: 'Se revocará la vinculación y se cerrarán todas las sesiones de este equipo. Para volver a usarlo o cambiarlo de UP, tendrás que vincularlo con un código nuevo.', button: 'Confirmar y desvincular', destructive: true });
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
      if (action.kind === 'code') {
        this.message.set('');
        this.pairingContext.set({ name: action.name, upName: this.unitNames().get(action.upId) ?? `UP ${action.upId}` });
        this.showCode(result);
        if (this.pairing()) this.message.set('Código generado. Ingresalo en el equipo que querés vincular.');
      }
      if ((action.kind === 'password' || action.kind === 'sessions') && action.userId === this.auth.user()?.id) {
        await this.auth.logout(); await this.router.navigateByUrl('/auth'); return;
      }
      if (action.kind !== 'code' && (this.tab === 'users' || this.tab === 'devices')) await this.load();
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
    if (this.codeTimer !== null) clearInterval(this.codeTimer);
    this.codeTimer = null; this.pairing.set(null);
    if (!result || typeof result !== 'object' || !('code' in result) || !('expires_at' in result)
      || typeof result.code !== 'string' || !/^[A-Z2-9]{10}$/.test(result.code) || typeof result.expires_at !== 'string' || !Number.isFinite(Date.parse(result.expires_at))) {
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

  clearCode(): void {
    if (this.codeTimer !== null) clearInterval(this.codeTimer);
    this.codeTimer = null; this.pairing.set(null); this.pairingContext.set(null);
  }
  private clearSensitive(): void {
    this.pending = null; this.confirmation.set(null); this.clearCode();
    this.createForm.reset(); this.credentialForm.reset(); this.deviceName.reset(); this.deviceUnit.reset();
    this.deviceUnits.set([]); this.devicesLoaded.set(false);
    this.roles.set([]); this.assignedRole.reset();
    this.users.set([]); this.devices.set([]); this.selected.set(null);
  }
}

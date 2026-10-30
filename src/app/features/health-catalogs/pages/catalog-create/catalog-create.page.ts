import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, HostListener, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AlertController, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, bandageOutline, globeOutline, medkitOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { InfoHelpComponent } from '../../../../shared/components/info-help.component';
import { SearchableSelectComponent } from '../../../../shared/ui/searchable-select/searchable-select.component';
import { CatalogRecord, CreateMedicine, CreateVaccine, HealthSupplier } from '../../interfaces/health-catalog';
import { HealthCatalogKind } from '../../types/health-catalog.type';
import { HealthCatalogsApi } from '../../services/health-catalogs.api';
import { CATALOGS, catalogCommand, catalogFilters, catalogQuery, healthError } from '../../services/health-catalog-presentation';

const nonblank = (control: AbstractControl) => typeof control.value === 'string' && control.value.trim() ? null : { required: true };

@Component({
  selector: 'app-health-catalog-create', templateUrl: './catalog-create.page.html', styleUrl: './catalog-create.page.scss',
  imports: [ReactiveFormsModule, RouterLink, IonIcon, SearchableSelectComponent, InfoHelpComponent],
  host: { '[style.--health-keyboard-offset]': 'viewportBottom() + "px"' },
})
export class CatalogCreatePage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(HealthCatalogsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly alerts = inject(AlertController);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('catalogForm');
  private readonly successHeading = viewChild<ElementRef<HTMLElement>>('successHeading');
  readonly kind = this.route.snapshot.data['catalogKind'] as HealthCatalogKind;
  readonly config = CATALOGS[this.kind];
  readonly returnQuery = catalogQuery(catalogFilters(this.route.snapshot.queryParamMap, this.kind));
  readonly fromProducts = this.route.snapshot.queryParamMap.get('from') === 'products';
  readonly productCreatePath = '/administracion/inventario/existencias/productos/nuevo';
  readonly productReturnQuery = { returnTo: this.route.snapshot.queryParamMap.get('returnTo') };
  readonly allowed = computed(() => this.auth.isAdmin());
  readonly saving = signal(false);
  readonly uncertain = signal(false);
  readonly created = signal<CatalogRecord | null>(null);
  readonly error = signal<string | null>(null);
  readonly viewportBottom = signal(0);
  readonly locked = computed(() => !this.allowed() || this.saving() || this.uncertain() || !!this.created());
  readonly suppliers = signal<HealthSupplier[]>([]);
  readonly suppliersLoading = signal(false);
  readonly suppliersError = signal<string | null>(null);
  readonly supplierOptions = computed(() => this.suppliers().map((item) => ({ value: item.id, label: item.name })));
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [nonblank, Validators.maxLength(160)] }),
    description: new FormControl('', { nonNullable: true, validators: [nonblank, Validators.maxLength(5000)] }),
    supplier: new FormControl('', { nonNullable: true, validators: [Validators.required, (control) =>
      !control.value || this.suppliers().some((item) => String(item.id) === control.value && item.status === 'active') ? null : { supplier: true }] }),
    sku: new FormControl('', { nonNullable: true, validators: this.kind === 'vaccines' ? [nonblank, Validators.maxLength(80)] : [] }),
    details: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
  });
  private version = 0;
  private supplierVersion = 0;
  private attempt: { body: CreateMedicine | CreateVaccine; key: string; fingerprint: string } | null = null;
  private leavePromise: Promise<boolean> | null = null;
  private leaveAlert: HTMLIonAlertElement | null = null;

  constructor() {
    addIcons({ arrowBackOutline, bandageOutline, globeOutline, medkitOutline });
    effect(() => {
      const actor = this.auth.user()?.id;
      const allowed = this.allowed();
      untracked(() => {
        this.version++; this.supplierVersion++; this.attempt = null;
        this.saving.set(false); this.uncertain.set(false); this.created.set(null); this.error.set(null);
        this.form.reset(); this.suppliers.set([]); this.suppliersError.set(null); this.suppliersLoading.set(false);
        void this.leaveAlert?.dismiss(undefined, 'cancel');
        if (actor && allowed) void this.loadSuppliers();
      });
    });
    effect(() => this.successHeading()?.nativeElement.focus());
    const viewport = window.visualViewport;
    const updateViewport = () => this.viewportBottom.set(viewport && viewport.scale === 1
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0);
    viewport?.addEventListener('resize', updateViewport); viewport?.addEventListener('scroll', updateViewport); updateViewport();
    this.destroyRef.onDestroy(() => {
      this.version++; this.supplierVersion++;
      viewport?.removeEventListener('resize', updateViewport); viewport?.removeEventListener('scroll', updateViewport);
      void this.leaveAlert?.dismiss(undefined, 'cancel');
    });
  }

  async loadSuppliers(): Promise<void> {
    if (!this.allowed()) return;
    const version = ++this.supplierVersion;
    this.suppliersLoading.set(true); this.suppliersError.set(null);
    try {
      const items = await firstValueFrom(this.api.suppliers(true));
      if (version !== this.supplierVersion || this.destroyRef.destroyed) return;
      this.suppliers.set(items); this.form.controls.supplier.updateValueAndValidity();
    } catch (error) {
      if (version !== this.supplierVersion || this.destroyRef.destroyed) return;
      this.suppliersError.set(healthError(error, 'No se pudieron cargar los proveedores activos.'));
    } finally {
      if (version === this.supplierVersion && !this.destroyRef.destroyed) this.suppliersLoading.set(false);
    }
  }

  fieldError(control: AbstractControl): string | null {
    const server = control.getError('server');
    if (typeof server === 'string') return server;
    if (!control.touched) return null;
    if (control.hasError('required')) return 'Completa este campo.';
    if (control.hasError('maxlength')) return 'El valor supera el máximo permitido.';
    if (control.hasError('supplier')) return 'Selecciona un proveedor activo disponible.';
    return null;
  }

  async submit(): Promise<void> {
    if (!this.allowed() || this.saving() || this.created()) return;
    if (!this.uncertain()) {
      if (this.suppliersLoading() || this.suppliersError() || !this.suppliers().length) return;
      this.form.markAllAsTouched();
      if (this.form.invalid) { this.focusError(); return; }
      const body = catalogCommand(this.kind, this.form.getRawValue());
      const fingerprint = JSON.stringify(body);
      this.attempt = { body, fingerprint, key: this.attempt?.fingerprint === fingerprint ? this.attempt.key : crypto.randomUUID() };
    }
    const attempt = this.attempt;
    if (!attempt) return;
    const version = this.version;
    this.saving.set(true); this.error.set(null);
    try {
      const result = await firstValueFrom(this.api.create(this.kind, attempt.body, attempt.key));
      if (version !== this.version || this.destroyRef.destroyed) return;
      if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(result.id)) throw new Error('Invalid catalog response');
      this.created.set(result); this.uncertain.set(false); this.attempt = null;
    } catch (error) {
      if (version !== this.version || this.destroyRef.destroyed) return;
      if (error instanceof HttpErrorResponse && error.status === 422) {
        this.uncertain.set(false); this.applyValidationErrors(error);
        this.error.set('Revisa los datos ingresados.');
      } else if (error instanceof HttpErrorResponse && (error.status === 409 || error.status === 404)) {
        this.uncertain.set(false); this.attempt = null;
        this.error.set(error.status === 404 ? 'El proveedor ya no está disponible. Selecciona otro proveedor.'
          : this.kind === 'vaccines' ? 'No se pudo crear la vacuna por un conflicto. Revisa el nombre, el código y el proveedor.'
          : 'No se pudo crear el medicamento por un conflicto. Revisa el proveedor e intenta nuevamente.');
        void this.loadSuppliers();
      } else if (!(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500 || (error.status >= 200 && error.status < 300)) {
        this.uncertain.set(true);
        this.error.set('No pudimos confirmar la creación. Reintenta con los mismos datos para evitar duplicar el registro.');
      } else {
        this.uncertain.set(false);
        this.error.set(healthError(error, 'No se pudo crear el registro. Intenta nuevamente.'));
      }
      this.focusError();
    } finally {
      if (version === this.version && !this.destroyRef.destroyed) this.saving.set(false);
    }
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.auth.user() || !this.allowed() || this.created()) return true;
    if (this.saving()) return false;
    if (!this.form.dirty && !this.uncertain()) return true;
    this.leavePromise ??= this.confirmLeave().finally(() => { this.leavePromise = null; });
    return this.leavePromise;
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.auth.user() && this.allowed() && !this.created() && (this.form.dirty || this.saving() || this.uncertain())) {
      event.preventDefault(); event.returnValue = '';
    }
  }
  private async confirmLeave(): Promise<boolean> {
    const version = this.version;
    const alert = await this.alerts.create({
      header: '¿Salir sin guardar?',
      message: this.uncertain() ? 'La creación está pendiente de confirmación. Reintenta antes de salir para comprobar si se guardó.' : 'Los cambios sin guardar se perderán.',
      backdropDismiss: false,
      buttons: [{ text: 'Seguir editando', role: 'cancel' }, { text: 'Salir', role: 'discard' }],
    });
    if (version !== this.version || this.destroyRef.destroyed) return false;
    this.leaveAlert = alert; await alert.present();
    const result = await alert.onDidDismiss(); this.leaveAlert = null;
    return version === this.version && result.role === 'discard';
  }
  private applyValidationErrors(error: HttpErrorResponse): void {
    const problem = error.error as { errors?: Record<string, unknown> } | null;
    if (!problem || typeof problem !== 'object' || !problem.errors || typeof problem.errors !== 'object') return;
    const fields: Record<string, string> = { nombre: 'name', descripcion: 'description', proveedor_id: 'supplier', supplier_id: 'supplier', detalles: 'details' };
    for (const [field, messages] of Object.entries(problem.errors)) {
      if (!Array.isArray(messages)) continue;
      const message = messages.filter((item): item is string => typeof item === 'string').join(' ');
      const control = this.form.get(fields[field] ?? field);
      if (control && message) control.setErrors({ ...control.errors, server: message });
    }
  }
  private focusError(): void {
    afterNextRender(() => {
      const target = this.formElement()?.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]');
      target?.focus(); target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, { injector: this.injector });
  }
}

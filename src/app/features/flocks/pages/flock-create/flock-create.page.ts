import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, calendarOutline, chevronDownOutline, informationCircleOutline, locationOutline } from 'ionicons/icons';
import { distinctUntilChanged, filter, forkJoin, take } from 'rxjs';

import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { PoultryHouse } from '../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { FlockCatalogOption, FlockPlanTemplateOption, FlockSupplierOption } from '../../interfaces/flock.interface';
import { FlocksApi } from '../../services/flocks.api';
import {
  FlockCreateDraft,
  FlockCreateErrors,
  FlockCreateField,
  FlockCreateStep,
  buildCreateFlockRequest,
  validateFlockCreateStep,
} from '../../services/flock-create-form';
import { formatFlockEntryDate } from '../../services/flock-entry-date';

type LoadState = 'loading' | 'ready' | 'offline' | 'forbidden' | 'error';
type HouseState = LoadState | 'idle';

const LIST_PATH = '/administracion/lotes/lotes';

function localTodayIso(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function positiveRouteId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

@Component({
  selector: 'app-flock-create-page',
  templateUrl: './flock-create.page.html',
  styleUrl: './flock-create.page.scss',
  imports: [IonIcon, IonSpinner, RouterLink],
})
export class FlockCreatePage {
  @ViewChild('pageTop') private readonly pageTop?: ElementRef<HTMLElement>;

  private readonly api = inject(FlocksApi);
  private readonly unitsApi = inject(ProductionUnitsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly unitContext = inject(AdminUnitContextService);

  readonly listPath = LIST_PATH;
  readonly todayIso = localTodayIso();
  readonly step = signal<FlockCreateStep>(1);
  readonly catalogState = signal<LoadState>('loading');
  readonly houseState = signal<HouseState>('idle');
  readonly houses = signal<readonly PoultryHouse[]>([]);
  readonly breeds = signal<readonly FlockCatalogOption[]>([]);
  readonly suppliers = signal<readonly FlockSupplierOption[]>([]);
  readonly templates = signal<readonly FlockPlanTemplateOption[]>([]);
  readonly saving = signal(false);
  readonly errors = signal<FlockCreateErrors>({});
  readonly message = signal('');
  readonly draft = signal<FlockCreateDraft>({
    code: '',
    houseId: null,
    entryDate: this.todayIso,
    initialQuantity: '',
    breedId: null,
    source: 'supplier',
    supplierId: null,
    origin: '',
    notes: '',
    templateId: '',
  });

  readonly activeUnits = computed(() => this.unitContext.units().filter((unit) => unit.status === 'active'));
  readonly selectedHouse = computed(() => this.houses().find((house) => house.id === this.draft().houseId) ?? null);
  readonly selectedBreed = computed(() => this.breeds().find((breed) => breed.id === this.draft().breedId) ?? null);
  readonly selectedSupplier = computed(() => this.suppliers().find((supplier) => supplier.id === this.draft().supplierId) ?? null);
  readonly selectedTemplate = computed(() => this.templates().find((template) => template.id === this.draft().templateId) ?? null);
  readonly dateDisplay = computed(() => formatFlockEntryDate(this.draft().entryDate) ?? '—');
  readonly quantityDisplay = computed(() => {
    const quantity = Number(this.draft().initialQuantity);
    return Number.isFinite(quantity) && quantity > 0 ? new Intl.NumberFormat('es-UY').format(quantity) : '—';
  });

  private houseRequestId = 0;
  private catalogRequestId = 0;
  private requestSignature: string | null = null;
  private requestKey: string | null = null;
  private readonly initialUnitId = positiveRouteId(this.route.snapshot.queryParamMap.get('unitId'));
  private readonly initialHouseId = positiveRouteId(this.route.snapshot.queryParamMap.get('houseId'));
  private initialUnitApplied = false;
  private initialHousePending = this.initialUnitId !== null && this.initialHouseId !== null;

  constructor() {
    addIcons({ arrowBackOutline, calendarOutline, chevronDownOutline, informationCircleOutline, locationOutline });
    this.loadCatalogs();
    toObservable(this.unitContext.selectedId).pipe(
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((unitId) => {
      if (this.initialUnitApplied && unitId !== this.initialUnitId) this.initialHousePending = false;
      this.loadHouses(unitId, true);
    });
    if (this.initialHousePending) {
      toObservable(this.unitContext.state).pipe(
        filter((state) => state === 'ready'),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(() => {
        if (!this.activeUnits().some((unit) => unit.id === this.initialUnitId)) {
          this.initialHousePending = false;
          return;
        }
        this.initialUnitApplied = true;
        this.unitContext.select(this.initialUnitId);
      });
    }
  }

  update<K extends keyof FlockCreateDraft>(field: K, value: FlockCreateDraft[K]): void {
    this.draft.update((current) => ({ ...current, [field]: value }));
    this.clearError(field as FlockCreateField);
  }

  selectUnit(value: string): void {
    this.initialHousePending = false;
    const id = Number(value);
    this.unitContext.select(this.activeUnits().some((unit) => unit.id === id) ? id : null);
    this.clearError('unitId');
  }

  selectHouse(value: string): void {
    this.update('houseId', value ? Number(value) : null);
  }

  selectBreed(value: string): void {
    this.update('breedId', value ? Number(value) : null);
  }

  selectSupplier(value: string): void {
    this.update('supplierId', value ? Number(value) : null);
  }

  setSource(source: FlockCreateDraft['source']): void {
    this.update('source', source);
    this.clearError('supplierId');
    this.clearError('origin');
  }

  retryCatalogs(): void { this.loadCatalogs(); }
  retryHouses(): void { this.loadHouses(this.unitContext.selectedId(), false); }

  onFormSubmit(event: Event): void {
    event.preventDefault();
    this.next();
  }

  next(): void {
    if (this.saving()) return;
    const current = this.step();
    if (current === 3) { this.submit(); return; }
    if (current === 2 && this.catalogState() !== 'ready') {
      this.message.set('No se pudieron cargar las opciones. Reintentá antes de continuar.');
      return;
    }
    if (!this.validate(current)) return;
    this.moveTo(current === 1 ? 2 : 3);
  }

  back(): void {
    const current = this.step();
    if (current > 1) this.moveTo(current === 3 ? 2 : 1);
  }

  editData(): void { this.moveTo(1); }

  private moveTo(step: FlockCreateStep): void {
    this.step.set(step);
    this.errors.set({});
    this.message.set('');
    this.scrollToTop();
  }

  private scrollToTop(): void {
    const content = this.pageTop?.nativeElement.closest('ion-content');
    if (content) void content.scrollToTop(200);
  }

  private validate(step: FlockCreateStep): boolean {
    const errors = validateFlockCreateStep(step, this.draft(), {
      unitId: this.unitContext.selectedUnit()?.status === 'active' ? this.unitContext.selectedId() : null,
      houseIds: this.houses().map((house) => house.id),
      houseCapacity: this.selectedHouse()?.bird_capacity ?? null,
      breedIds: this.breeds().map((breed) => breed.id),
      supplierIds: this.suppliers().map((supplier) => supplier.id),
      templates: this.templates(),
      todayIso: this.todayIso,
    });
    this.errors.set(errors);
    if (Object.keys(errors).length) {
      this.message.set('Revisá los campos señalados.');
      return false;
    }
    this.message.set('');
    return true;
  }

  private submit(): void {
    for (const step of [1, 2, 3] as const) {
      if (!this.validate(step)) {
        this.step.set(step);
        this.scrollToTop();
        return;
      }
    }
    const request = buildCreateFlockRequest(this.draft(), this.selectedTemplate());
    if (!request) { this.message.set('No se pudieron preparar los datos del lote. Revisá el formulario.'); return; }
    const signature = JSON.stringify(request);
    if (signature !== this.requestSignature) {
      this.requestSignature = signature;
      this.requestKey = globalThis.crypto.randomUUID();
    }
    this.saving.set(true);
    this.api.create(request, this.requestKey!).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); void this.router.navigateByUrl(LIST_PATH); },
      error: (error: unknown) => this.handleSaveError(error),
    });
  }

  private loadCatalogs(): void {
    const requestId = ++this.catalogRequestId;
    this.catalogState.set('loading');
    forkJoin({
      breeds: this.api.activeBreeds(),
      suppliers: this.api.activeSuppliers(),
      templates: this.api.publishedTemplates(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ breeds, suppliers, templates }) => {
        if (requestId !== this.catalogRequestId) return;
        this.breeds.set(breeds.filter((breed) => breed.status === 'active'));
        this.suppliers.set(suppliers.filter((supplier) => supplier.status === 'active'));
        this.templates.set(templates);
        this.catalogState.set('ready');
      },
      error: (error: unknown) => {
        if (requestId === this.catalogRequestId) this.catalogState.set(this.errorState(error));
      },
    });
  }

  private loadHouses(unitId: number | null, clearSelection: boolean): void {
    const requestId = ++this.houseRequestId;
    if (clearSelection) {
      this.draft.update((draft) => ({ ...draft, houseId: null }));
      if (this.step() > 1) {
        this.step.set(1);
        this.message.set('La unidad productiva cambió. Seleccioná un galpón para continuar.');
        this.scrollToTop();
      }
    }
    this.houses.set([]);
    if (unitId === null) { this.houseState.set('idle'); return; }
    this.houseState.set('loading');
    this.unitsApi.poultryHouses(unitId, 'poultry').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (houses) => {
        if (requestId !== this.houseRequestId) return;
        const available = houses.filter((house) => house.type === 'poultry' && house.status === 'operational'
          && house.current_occupancy === 0);
        this.houses.set(available);
        if (this.initialHousePending && unitId === this.initialUnitId) {
          this.initialHousePending = false;
          const initialHouse = available.find((house) => house.id === this.initialHouseId);
          if (initialHouse) this.draft.update((draft) => ({ ...draft, houseId: initialHouse.id }));
        }
        if (!available.some((house) => house.id === this.draft().houseId)) {
          this.draft.update((draft) => ({ ...draft, houseId: null }));
        }
        this.houseState.set('ready');
      },
      error: (error: unknown) => {
        if (requestId === this.houseRequestId) this.houseState.set(this.errorState(error));
      },
    });
  }

  private clearError(field: FlockCreateField): void {
    this.errors.update((errors) => ({ ...errors, [field]: undefined }));
    this.message.set('');
  }

  private handleSaveError(error: unknown): void {
    this.saving.set(false);
    if (!(error instanceof HttpErrorResponse)) {
      this.message.set('No se pudo crear el lote. Intentá nuevamente.');
      return;
    }
    if (error.status === 422) {
      const backendErrors = (error.error as { errors?: Record<string, string[]> } | null)?.errors ?? {};
      const fieldMap: Record<string, FlockCreateField> = {
        code: 'code', poultry_house_id: 'houseId', entry_date: 'entryDate',
        initial_quantity: 'initialQuantity', breed_id: 'breedId', supplier_id: 'supplierId',
        origin: 'origin', notes: 'notes', plan_template_id: 'templateId', plan_template_version: 'templateId',
      };
      const errors: FlockCreateErrors = {};
      for (const [name, messages] of Object.entries(backendErrors)) {
        const field = fieldMap[name];
        if (field && messages[0]) errors[field] = messages[0];
      }
      this.errors.set(errors);
      if (Object.keys(errors).some((field) => ['code', 'houseId', 'entryDate', 'initialQuantity'].includes(field))) this.step.set(1);
      else if (Object.keys(errors).some((field) => ['breedId', 'supplierId', 'origin', 'notes'].includes(field))) this.step.set(2);
      this.message.set('Revisá los campos señalados.');
    } else if (error.status === 409) {
      this.message.set(this.problemDetail(error) ?? 'El galpón o la plantilla cambió. Revisá los datos e intentá nuevamente.');
      this.loadCatalogs();
      this.loadHouses(this.unitContext.selectedId(), false);
    } else if (error.status === 401 || error.status === 403) {
      this.message.set('No tenés permiso para crear lotes.');
    } else if (error.status === 0) {
      this.message.set('Sin conexión. Revisá tu conexión e intentá nuevamente.');
    } else {
      this.message.set('No se pudo crear el lote. Intentá nuevamente.');
    }
  }

  private problemDetail(error: HttpErrorResponse): string | null {
    const detail = (error.error as { detail?: unknown } | null)?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : null;
  }

  private errorState(error: unknown): LoadState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'offline';
      if (error.status === 401 || error.status === 403) return 'forbidden';
    }
    return 'error';
  }
}

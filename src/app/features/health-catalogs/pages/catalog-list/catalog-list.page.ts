import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, funnelOutline, globeOutline, searchOutline, chevronForwardOutline } from 'ionicons/icons';
import { debounceTime, firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { SearchableSelectComponent } from '../../../../shared/ui/searchable-select/searchable-select.component';
import { CatalogFilters, CatalogRecord, HealthPage, HealthSupplier } from '../../interfaces/health-catalog';
import { HealthCatalogKind, HealthLoadState } from '../../types/health-catalog.type';
import { HealthCatalogsApi } from '../../services/health-catalogs.api';
import { CATALOGS, catalogFilters, catalogQuery, healthError, unitLabel } from '../../services/health-catalog-presentation';

@Component({
  selector: 'app-health-catalog-list', templateUrl: './catalog-list.page.html', styleUrl: './catalog-list.page.scss',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, IonIcon, FilterDialogComponent, SearchableSelectComponent],
})
export class CatalogListPage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(HealthCatalogsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly kind = this.route.snapshot.data['catalogKind'] as HealthCatalogKind;
  readonly config = CATALOGS[this.kind];
  readonly allowed = computed(() => this.auth.isAdmin());
  readonly search = new FormControl('', { nonNullable: true });
  readonly searchForm = new FormGroup({ search: this.search });
  readonly draft = new FormGroup({
    supplier: new FormControl('', { nonNullable: true }),
    status: new FormControl<'' | 'active' | 'inactive'>('', { nonNullable: true }),
    sku: new FormControl('', { nonNullable: true }),
  });
  readonly applied = signal(catalogFilters(this.route.snapshot.queryParamMap, this.kind));
  readonly returnQuery = computed(() => catalogQuery(this.applied()));
  readonly filterCount = computed(() => Number(!!this.applied().supplier) + Number(!!this.applied().status) + Number(!!this.applied().sku));
  readonly hasCriteria = computed(() => !!this.applied().search || this.filterCount() > 0);
  readonly records = signal<CatalogRecord[]>([]);
  readonly rows = computed(() => this.records().map((item) => ({
    item, unit: item.vaccine ? unitLabel(item.vaccine.unit) : '',
    preview: item.description.length > 160 ? item.description.slice(0, 157) + '…' : item.description,
    hasMore: item.description.length > 160,
  })));
  readonly state = signal<HealthLoadState>('idle');
  readonly error = signal<string | null>(null);
  readonly meta = signal<HealthPage<CatalogRecord>['meta'] | null>(null);
  readonly suppliers = signal<HealthSupplier[]>([]);
  readonly suppliersLoading = signal(false);
  readonly suppliersError = signal<string | null>(null);
  readonly supplierOptions = computed(() => this.suppliers().map((item) => ({
    value: item.id, label: item.name, description: item.status === 'inactive' ? 'Proveedor inactivo' : undefined,
  })));
  private version = 0;
  private supplierVersion = 0;
  @ViewChild(FilterDialogComponent, { static: true }) private readonly filterDialog!: FilterDialogComponent;

  constructor() {
    addIcons({ addOutline, funnelOutline, globeOutline, searchOutline, chevronForwardOutline });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const filters = catalogFilters(params, this.kind);
      this.search.setValue(filters.search, { emitEvent: false }); this.applied.set(filters);
    });
    this.search.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => void this.searchRecords());
    effect(() => {
      const actor = this.auth.user()?.id;
      const allowed = this.allowed();
      untracked(() => {
        this.supplierVersion++; this.suppliers.set([]); this.suppliersError.set(null); this.suppliersLoading.set(false);
        this.filterDialog?.close();
        if (actor && allowed) void this.loadSuppliers();
      });
    });
    effect(() => {
      const actor = this.auth.user()?.id;
      const allowed = this.allowed();
      const filters = this.applied();
      untracked(() => {
        this.version++; this.records.set([]); this.meta.set(null); this.error.set(null);
        if (actor && allowed) void this.load(filters);
        else { this.state.set('forbidden'); this.filterDialog?.close(); }
      });
    });
  }

  async load(filters = this.applied()): Promise<void> {
    if (!this.allowed()) return;
    const version = ++this.version;
    this.records.set([]); this.meta.set(null); this.error.set(null); this.state.set('loading');
    try {
      const response = await firstValueFrom(this.api.list(this.kind, filters));
      if (version !== this.version || this.destroyRef.destroyed) return;
      this.records.set(response.data); this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch (error) {
      if (version !== this.version || this.destroyRef.destroyed) return;
      this.error.set(healthError(error, 'No se pudo cargar el catálogo. Intenta nuevamente.')); this.state.set('error');
    }
  }
  async loadSuppliers(): Promise<void> {
    if (!this.allowed()) return;
    const version = ++this.supplierVersion;
    this.suppliersLoading.set(true); this.suppliersError.set(null);
    try {
      const items = await firstValueFrom(this.api.suppliers(false));
      if (version === this.supplierVersion && !this.destroyRef.destroyed) this.suppliers.set(items);
    } catch (error) {
      if (version === this.supplierVersion && !this.destroyRef.destroyed) this.suppliersError.set(healthError(error, 'No se pudieron cargar los proveedores.'));
    } finally {
      if (version === this.supplierVersion && !this.destroyRef.destroyed) this.suppliersLoading.set(false);
    }
  }
  searchRecords(): Promise<boolean> | undefined {
    const search = this.search.value.trim().slice(0, 160);
    if (search !== this.applied().search) return this.navigate({ ...this.applied(), search, page: 1 });
    return undefined;
  }
  openFilters(trigger: HTMLElement): void {
    this.draft.reset({ supplier: this.applied().supplier, status: this.applied().status, sku: this.applied().sku });
    this.filterDialog.open(trigger);
  }
  clearDraft(): void { this.draft.reset({ supplier: '', status: '', sku: '' }); }
  async applyFilters(): Promise<void> {
    this.filterDialog.close();
    await this.navigate({ ...this.applied(), ...this.draft.getRawValue(), search: this.search.value.trim().slice(0, 160), page: 1 });
  }
  async clearCriteria(): Promise<void> {
    this.search.setValue('', { emitEvent: false });
    await this.navigate({ search: '', supplier: '', status: '', sku: '', page: 1 });
  }
  async changePage(page: number): Promise<void> {
    if (this.state() === 'loading' || !this.meta() || page < 1 || page > this.meta()!.last_page) return;
    await this.navigate({ ...this.applied(), page });
  }
  private navigate(filters: CatalogFilters) {
    return this.router.navigate([], { relativeTo: this.route, queryParams: catalogQuery(filters), replaceUrl: true });
  }
}

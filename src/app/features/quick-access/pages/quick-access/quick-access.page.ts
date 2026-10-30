import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { map } from 'rxjs';
import { addIcons } from 'ionicons';
import { businessOutline, checkmarkCircleOutline, clipboardOutline, eggOutline, informationCircleOutline, leafOutline, lockClosedOutline, medicalOutline, searchOutline } from 'ionicons/icons';
import { AuthStore } from '../../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { FlockHouseHealthDialogComponent } from '../../../flocks/components/flock-house-health-dialog/flock-house-health-dialog.component';
import { FlockHouseTaskDialogComponent } from '../../../flocks/components/flock-house-task-dialog/flock-house-task-dialog.component';
import { FlockHouseTaskRequest } from '../../../flocks/interfaces/flock-house-task.interface';
import { QuickAccessHouse } from '../../interfaces/quick-access-house';
import { QuickAccessPlant } from '../../interfaces/quick-access-plant';
import { QuickAccessManufactureRequest } from '../../interfaces/quick-access-manufacture-request';
import { QuickAccessManufactureDialogComponent } from '../../components/quick-access-manufacture-dialog/quick-access-manufacture-dialog.component';
import { PoultryHouseType } from '../../../production-units/interfaces/production-unit.interface';
import { FeedManufactureService } from '../../../production-units/services/feed-manufacture.service';
import { QuickAccessService, quickAccessSearch } from '../../services/quick-access.service';

@Component({
  selector: 'app-quick-access-page',
  imports: [IonIcon, IonSpinner, FlockHouseTaskDialogComponent, FlockHouseHealthDialogComponent, QuickAccessManufactureDialogComponent],
  templateUrl: './quick-access.page.html',
  styleUrl: './quick-access.page.scss',
})
export class QuickAccessPage {
  private readonly api = inject(QuickAccessService);
  private readonly auth = inject(AuthStore);
  private readonly manufactureService = inject(FeedManufactureService);
  readonly units = inject(AdminUnitContextService);
  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly health = viewChild(FlockHouseHealthDialogComponent);
  private readonly dialog = viewChild(FlockHouseTaskDialogComponent);
  private readonly manufactureDialog = viewChild(QuickAccessManufactureDialogComponent);
  private readonly revision = signal(0);
  private actor = this.auth.user();
  private session = this.auth.session();
  readonly state = signal<'loading' | 'ready' | 'forbidden' | 'offline' | 'error'>('loading');
  readonly houses = signal<QuickAccessHouse[]>([]);
  readonly plants = signal<QuickAccessPlant[]>([]);
  readonly facilityType = signal<PoultryHouseType>('poultry');
  readonly query = signal('');
  readonly message = signal<string | null>(null);
  readonly task = signal<FlockHouseTaskRequest | null>(null);
  readonly manufacture = signal<QuickAccessManufactureRequest | null>(null);
  readonly dialogOpen = computed(() => !!this.task() || !!this.manufacture());
  readonly pendingPlantIds = computed(() => {
    this.manufacture();
    const owner = `${this.auth.user()?.id ?? 'guest'}:${this.auth.session()?.id ?? 'personal'}`;
    return new Set(this.plants().filter((item) => this.manufactureService.readPending(owner, item.plant.id)).map((item) => item.plant.id));
  });
  readonly unitName = computed(() => this.units.selectedUnit()?.name ?? 'Todas las UP');
  readonly listTitle = computed(() => `${this.facilityType() === 'poultry' ? 'Galpones' : 'Plantas'} de ${this.units.selectedUnit() ? this.unitName() : 'todas las UP'}`);
  readonly searchLabel = computed(() => this.facilityType() === 'poultry' ? 'Buscar galpón, lote o unidad productiva' : 'Buscar planta o unidad productiva');
  readonly visibleHouses = computed(() => {
    const query = quickAccessSearch(this.query());
    return this.houses().filter((item) => !query || item.searchText.includes(query));
  });
  readonly visiblePlants = computed(() => {
    const query = quickAccessSearch(this.query());
    return this.plants().filter((item) => !query || item.searchText.includes(query));
  });
  readonly visibleCount = computed(() => this.facilityType() === 'poultry' ? this.visibleHouses().length : this.visiblePlants().length);
  readonly countLabel = computed(() => this.facilityType() === 'poultry'
    ? this.visibleCount() === 1 ? 'galpón' : 'galpones'
    : this.visibleCount() === 1 ? 'planta' : 'plantas');
  readonly tasks = computed(() => {
    const permissions = this.auth.user()?.permissions ?? [];
    return [
      { kind: 'collection' as const, label: 'Postura', icon: 'egg-outline', allowed: this.auth.isAdmin() || permissions.includes('egg-collections.manage') },
      { kind: 'mortality' as const, label: 'Mortandad', icon: 'clipboard-outline', allowed: !!this.auth.user() },
      { kind: 'feeding' as const, label: 'Cambio de ración', icon: 'leaf-outline', allowed: !!this.auth.user() },
      { kind: 'health' as const, label: 'Sanidad', icon: 'medical-outline', allowed: this.auth.isAdmin() || permissions.includes('management-plans.execute') },
    ];
  });
  readonly hasRestrictedTasks = computed(() => this.tasks().some((task) => !task.allowed));

  constructor() {
    addIcons({ businessOutline, checkmarkCircleOutline, clipboardOutline, eggOutline, informationCircleOutline, leafOutline, lockClosedOutline, medicalOutline, searchOutline });
    effect((cleanup) => {
      const actor = this.auth.user();
      const session = this.auth.session();
      const contextState = this.units.state();
      const selected = this.units.selectedId();
      const units = this.units.units();
      const facilityType = this.facilityType();
      this.revision();
      untracked(() => {
        const identityChanged = actor !== this.actor || session !== this.session;
        this.actor = actor; this.session = session;
        if (identityChanged || this.canLeave()) { this.task.set(null); this.manufacture.set(null); }
        if (identityChanged) { this.message.set(null); this.query.set(''); }
        this.houses.set([]);
        this.plants.set([]);
        this.state.set(contextState === 'error' ? 'error' : 'loading');
      });
      if (!actor || contextState !== 'ready') return;
      const selectedUnits = units.filter((unit) => selected === null || unit.id === selected);
      const request = facilityType === 'poultry'
        ? this.api.houses(selectedUnits).pipe(map((houses) => ({ houses, plants: [] as QuickAccessPlant[] })))
        : this.api.plants(selectedUnits).pipe(map((plants) => ({ houses: [] as QuickAccessHouse[], plants })));
      const subscription = request.subscribe({
        next: ({ houses, plants }) => { this.houses.set(houses); this.plants.set(plants); this.state.set('ready'); },
        error: (error: unknown) => this.state.set(error instanceof HttpErrorResponse
          ? error.status === 401 || error.status === 403 ? 'forbidden' : error.status === 0 ? 'offline' : 'error' : 'error'),
      });
      cleanup(() => subscription.unsubscribe());
    });
  }

  search(event: Event): void { this.query.set((event.target as HTMLInputElement).value); }

  selectType(type: PoultryHouseType): void {
    if (this.dialogOpen() || type === this.facilityType()) return;
    this.query.set('');
    this.message.set(null);
    this.facilityType.set(type);
  }

  elaborate(item: QuickAccessPlant, event?: Event): void {
    if (this.facilityType() !== 'feed' || this.state() !== 'ready' || this.dialogOpen()
      || (item.unavailableReason && !this.pendingPlantIds().has(item.plant.id)) || !this.plants().includes(item)) return;
    this.message.set(null);
    this.manufacture.set({ unitId: item.unit.id, plantId: item.plant.id, plantName: item.plant.name, unitName: item.unit.name,
      trigger: event?.currentTarget instanceof HTMLElement ? event.currentTarget : null });
  }

  closeManufacture(message: string | null): void {
    const request = this.manufacture();
    if (!request || !this.canLeave()) return;
    this.manufacture.set(null);
    this.message.set(message ? `${message} ${request.plantName} · ${request.unitName}.` : null);
    if (message) this.revision.update((version) => version + 1);
    this.restoreFocus(request.trigger);
  }

  retry(): void {
    if (this.units.state() === 'error') void this.units.load();
    else this.revision.update((version) => version + 1);
  }

  canLeave(): boolean { return (this.health()?.canLeave() ?? true) && !(this.dialog()?.task.saving() ?? false) && (this.manufactureDialog()?.canLeave() ?? true); }

  open(item: QuickAccessHouse, kind: FlockHouseTaskRequest['kind'], event: Event): void {
    if (this.dialogOpen() || this.state() !== 'ready' || item.unavailableReason || !item.flock
      || !this.houses().includes(item) || !this.tasks().some((task) => task.kind === kind && task.allowed)
      || (kind === 'collection' && item.flock.current_quantity <= 0)) return;
    this.message.set(null);
    this.task.set({ kind, flockId: item.flock.id, origin: { unitId: item.unit.id, houseId: item.house.id },
      houseName: item.house.name, unitName: item.unit.name,
      trigger: event.currentTarget instanceof HTMLElement ? event.currentTarget : null });
  }

  close(message: string | null): void {
    const request = this.task();
    if (!request) return;
    this.task.set(null);
    this.message.set(message ? `${message} ${request.houseName} · ${request.unitName}.` : null);
    if (message) this.revision.update((version) => version + 1);
    this.restoreFocus(request.trigger);
  }

  private restoreFocus(origin: HTMLElement | null): void {
    afterNextRender(() => {
      const trigger = origin?.isConnected ? origin
        : this.element.nativeElement.querySelector<HTMLElement>('#quick-access-title');
      trigger?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }
}

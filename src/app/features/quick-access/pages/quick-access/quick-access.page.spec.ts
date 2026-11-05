import { HttpErrorResponse } from '@angular/common/http';
import { Component, forwardRef, input, output, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { AccessDeniedPage } from '../../../admin/access-denied.page';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { FlockHouseHealthDialogComponent } from '../../../flocks/components/flock-house-health-dialog/flock-house-health-dialog.component';
import { FlockHouseTaskDialogComponent } from '../../../flocks/components/flock-house-task-dialog/flock-house-task-dialog.component';
import { FlockHouseTaskRequest } from '../../../flocks/interfaces/flock-house-task.interface';
import { Flock } from '../../../flocks/interfaces/flock.interface';
import { FlockCreatePage } from '../../../flocks/pages/flock-create/flock-create.page';
import { FlocksApi } from '../../../flocks/services/flocks.api';
import { QuickAccessHouse } from '../../interfaces/quick-access-house';
import { QuickAccessPlant } from '../../interfaces/quick-access-plant';
import { QuickAccessManufactureRequest } from '../../interfaces/quick-access-manufacture-request';
import { QuickAccessManufactureDialogComponent } from '../../components/quick-access-manufacture-dialog/quick-access-manufacture-dialog.component';
import { FeedManufactureService } from '../../../production-units/services/feed-manufacture.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { quickAccessRoutes } from '../../quick-access.routes';
import { QuickAccessService } from '../../services/quick-access.service';
import { QuickAccessPage } from './quick-access.page';

@Component({ selector: 'app-flock-house-task-dialog', template: '', providers: [{ provide: FlockHouseTaskDialogComponent, useExisting: forwardRef(() => TaskStubComponent) }] })
class TaskStubComponent {
  readonly request = input.required<FlockHouseTaskRequest>(); readonly closed = output<string | null>();
  readonly task = { saving: signal(false) };
}
@Component({ selector: 'app-flock-house-health-dialog', template: '', providers: [{ provide: FlockHouseHealthDialogComponent, useExisting: forwardRef(() => HealthStubComponent) }] })
class HealthStubComponent {
  readonly request = input.required<FlockHouseTaskRequest>(); readonly closed = output<string | null>();
  readonly locked = signal(false);
  canLeave(): boolean { return !this.locked(); }
}
@Component({ selector: 'app-quick-access-manufacture-dialog', template: '', providers: [{ provide: QuickAccessManufactureDialogComponent, useExisting: forwardRef(() => ManufactureStubComponent) }] })
class ManufactureStubComponent {
  readonly request = input.required<QuickAccessManufactureRequest>(); readonly closed = output<string | null>();
  readonly busy = signal(false);
  canLeave(): boolean { return !this.busy(); }
}

const unit = { id: 7, name: 'San José', status: 'active' as const, locality: null };
const row: QuickAccessHouse = { unit, house: { id: 22, name: 'Galpón 1', type: 'poultry', status: 'operational', bird_capacity: 1000 },
  flock: { id: 'lot-1', code: 'L-01', current_week: 32, current_quantity: 950 } as Flock,
  empty: false, unavailableReason: null, searchText: 'galpon 1 san jose l-01' };
const emptyHouse: QuickAccessHouse = {
  ...row,
  house: { ...row.house, id: 23, name: 'Galpón 2', current_occupancy: 0 },
  flock: null,
  empty: true,
  unavailableReason: 'Sin lote activo',
  searchText: 'galpon 2',
};
const flockPermissions = [
  'can_manage_flocks', 'can_view_flocks', 'can_view_production_units', 'can_view_poultry_houses',
  'can_view_breeds', 'can_view_management_plans', 'can_view_suppliers',
];
const plant: QuickAccessPlant = { unit, plant: { id: 30, name: 'Planta San José', type: 'feed', status: 'operational', bird_capacity: null },
  unavailableReason: null, searchText: 'planta san jose' };

describe('QuickAccessPage', () => {
  const houses = vi.fn(); const plants = vi.fn(); const readPending = vi.fn(); const selectedId = signal<number | null>(7);
  const actor = signal({ id: 1, roles: ['admin'], permissions: [] as string[] });
  beforeEach(() => {
    vi.resetAllMocks(); selectedId.set(7); actor.set({ id: 1, roles: ['admin'], permissions: [] });
    readPending.mockReturnValue(null);
    houses.mockReturnValue(of([row, emptyHouse]));
    plants.mockReturnValue(of([plant, { ...plant, plant: { ...plant.plant, id: 31, name: 'Planta Norte', status: 'maintenance' }, unavailableReason: 'La planta debe estar operativa para elaborar ración.', searchText: 'planta norte' }]));
    TestBed.configureTestingModule({ imports: [QuickAccessPage], providers: [
      provideRouter([]),
      { provide: AuthStore, useValue: { user: actor, session: () => null, isAdmin: () => actor().roles.includes('admin') } },
      { provide: AdminUnitContextService, useValue: { state: signal('ready'), selectedId, selectedUnit: () => selectedId() === 7 ? unit : null,
        units: signal([unit]), select: (id: number | null) => selectedId.set(id) } },
      { provide: QuickAccessService, useValue: { houses, plants } },
      { provide: FeedManufactureService, useValue: { readPending } },
    ] });
    TestBed.overrideComponent(QuickAccessPage, { remove: { imports: [FlockHouseTaskDialogComponent, FlockHouseHealthDialogComponent, QuickAccessManufactureDialogComponent] },
      add: { imports: [TaskStubComponent, HealthStubComponent, ManufactureStubComponent] } });
  });
  async function render(allowedCount?: number) {
    const fixture = TestBed.createComponent(QuickAccessPage);
    if (allowedCount !== undefined) {
      const actions = fixture.componentInstance.tasks().map((action, index) => ({ ...action, allowed: index < allowedCount }));
      vi.spyOn(fixture.componentInstance, 'tasks').mockReturnValue(actions);
    }
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture;
  }

  it('shows flock activities in the occupied house and opens creation with the empty house context', async () => {
    const fixture = await render(); const cards = fixture.nativeElement.querySelectorAll('.house');
    expect(cards.length).toBe(2); expect([...cards[0].querySelectorAll('button')].map((button) => (button as HTMLButtonElement).textContent?.trim()))
      .toEqual(['Postura', 'Mortandad', 'Cambio de ración', 'Sanidad']);
    expect(cards[1].querySelectorAll('button').length).toBe(0); expect(cards[1].textContent).toContain('Sin lote activo');
    expect(cards[0].querySelector('.add-flock-access')).toBeNull();
    const link = cards[1].querySelector('.add-flock-access a');
    expect(link?.getAttribute('href')).toBe('/administracion/acceso-rapido/nuevo-lote?unitId=7&houseId=23');
    expect(link?.querySelector('ion-icon')?.getAttribute('name')).toBe('egg-outline');
  });

  it('requires create and catalog permissions and disables creation in an empty house under maintenance', async () => {
    const permissions = flockPermissions.filter((permission) => permission !== 'can_view_suppliers');
    actor.set({ id: 2, roles: ['employee'], permissions });
    houses.mockReturnValue(of([emptyHouse, { ...emptyHouse, house: { ...emptyHouse.house, id: 24, status: 'maintenance' } }]));
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.add-flock-access a')).toBeNull();
    expect(host.querySelector('.add-flock-access button:disabled')?.textContent).toContain('Sin permiso');

    actor.set({ id: 2, roles: ['employee'], permissions: flockPermissions });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelectorAll('.add-flock-access a')).toHaveLength(1);
    expect(host.querySelector('.add-flock-access button:disabled')?.textContent).toContain('Fuera de operación');
  });

  it('shows the facility summary only for confirmed empty houses', async () => {
    const unknownOccupancy: QuickAccessHouse = {
      ...emptyHouse,
      house: { ...emptyHouse.house, id: 24, current_occupancy: null },
      empty: false,
    };
    const emptyUnderMaintenance: QuickAccessHouse = {
      ...emptyHouse,
      house: { ...emptyHouse.house, id: 25, status: 'maintenance', bird_capacity: null },
    };
    houses.mockReturnValue(of([row, unknownOccupancy, emptyHouse, emptyUnderMaintenance]));
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    const summaries = Array.from(host.querySelectorAll('.empty-house-summary'));

    expect(summaries.map((summary) => Array.from(summary.querySelectorAll('dd'), (value) => value.textContent.trim())))
      .toEqual([['1.000 aves', '0 aves', 'Operativo'], ['Sin datos', '0 aves', 'Mantenimiento']]);
  });

  it('guards the creation URL and prefills the verified house for an authorized employee', async () => {
    TestBed.overrideProvider(FlocksApi, { useValue: {
      activeBreeds: () => of([]), activeSuppliers: () => of([]), publishedTemplates: () => of([]),
    } });
    TestBed.overrideProvider(ProductionUnitsService, { useValue: { poultryHouses: () => of([emptyHouse.house]) } });
    const router = TestBed.inject(Router);
    router.resetConfig([
      { path: 'administracion/acceso-rapido', children: quickAccessRoutes },
      { path: 'acceso-denegado', component: AccessDeniedPage },
    ]);
    const path = '/administracion/acceso-rapido/nuevo-lote?unitId=7&houseId=23';
    actor.set({ id: 2, roles: ['employee'], permissions: ['can_view_flocks'] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(path, AccessDeniedPage);
    expect(router.url).toBe('/acceso-denegado');

    actor.set({ id: 2, roles: ['employee'], permissions: flockPermissions });
    const creator = await harness.navigateByUrl(path, FlockCreatePage);
    await harness.fixture.whenStable();
    expect(creator.selectedHouse()?.id).toBe(23);
    expect(creator.returnPath).toBe('/administracion/acceso-rapido');
  });

  it('offers maintenance below the activities in each card, including an empty house', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const links = [...element.querySelectorAll('.houses .maintenance-access a')];
    expect(element.querySelector('.maintenance-grid')).toBeNull();
    expect(element.querySelector('.house .actions')?.nextElementSibling?.className).toBe('maintenance-access');
    expect(element.querySelectorAll('.house > .maintenance-access')).toHaveLength(2);
    expect(element.querySelectorAll('.houses .actions button')).toHaveLength(4);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/administracion/ubicaciones/mantenimiento/7/galpon/22', '/administracion/ubicaciones/mantenimiento/7/galpon/23',
    ]);
    expect(links.every((link) => link.textContent?.includes('Hacer mantenimiento'))).toBe(true);
    expect(element.textContent).not.toContain('Poner en mantenimiento');
    expect(element.textContent).not.toContain('Marcar como operativo');
  });

  it('keeps maintenance available for a plant that cannot elaborate and follows the existing search', async () => {
    const fixture = await render(); const page = fixture.componentInstance;
    page.selectType('feed'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.plant > .maintenance-access a')).toHaveLength(2);
    expect(element.querySelector('.plant > .maintenance-access a[href$="/31"]')).not.toBeNull();
    expect(element.querySelector('.plant .plant-actions')?.nextElementSibling?.className).toBe('maintenance-access');
    page.query.set('norte'); fixture.detectChanges();
    expect(element.querySelectorAll('.maintenance-access a')).toHaveLength(1);
    expect(element.querySelector('.maintenance-access a')?.getAttribute('aria-label')).toContain('Planta Norte');
  });

  it('blocks the maintenance action while a task is open or the user can only read installations', async () => {
    const fixture = await render();
    fixture.componentInstance.open(row, 'collection', new Event('click')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.maintenance-access a')).toHaveLength(0);
    expect([...fixture.nativeElement.querySelectorAll('.maintenance-access button')].every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    fixture.componentInstance.close(null);
    const readPermissions = ['can_view_production_units', 'can_view_poultry_houses'];
    actor.set({ id: 1, roles: ['employee'], permissions: readPermissions }); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.maintenance-access a')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.maintenance-access button:disabled')?.textContent).toContain('Sin permiso');

    fixture.componentInstance.selectType('feed'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.maintenance-access a')).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll('.maintenance-access button:disabled')).toHaveLength(2);

    actor.set({ id: 1, roles: ['employee'], permissions: [...readPermissions, 'can_manage_poultry_houses'] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.maintenance-access a')).toHaveLength(2);
  });

  it.each([0, 1, 2, 3, 4])('keeps all four actions and overlays locks only on denied actions with %i grants', async (allowedCount) => {
    const fixture = await render(allowedCount);
    const element = fixture.nativeElement as HTMLElement;
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('.house button')];
    expect(buttons).toHaveLength(4);
    expect(buttons.filter((button) => !button.disabled)).toHaveLength(allowedCount);
    expect(element.querySelectorAll('.permission-lock')).toHaveLength(4 - allowedCount);
    buttons.forEach((button, index) => {
      expect(button.querySelector('.action-icon > ion-icon')?.getAttribute('name')).toBe(fixture.componentInstance.tasks()[index].icon);
      expect(button.querySelector('.action-icon .permission-lock') !== null).toBe(index >= allowedCount);
      expect(button.textContent?.includes('Sin permiso')).toBe(index >= allowedCount);
      if (index >= allowedCount) {
        expect(button.getAttribute('aria-describedby')).toBe('quick-access-permissions');
        button.click();
        fixture.componentInstance.open(row, fixture.componentInstance.tasks()[index].kind, new Event('click'));
        expect(fixture.componentInstance.task()).toBeNull();
      }
    });
    expect(element.querySelector('#quick-access-permissions') !== null).toBe(allowedCount < 4);
    if (allowedCount > 0) {
      buttons[0].click(); fixture.detectChanges();
      expect(fixture.componentInstance.task()?.kind).toBe('collection');
      expect(buttons.every((button) => button.disabled)).toBe(true);
      expect(element.querySelectorAll('.permission-lock')).toHaveLength(4 - allowedCount);
    }
  });

  it('disables Postura without a permission lock when the flock has no live birds', async () => {
    houses.mockReturnValue(of([{ ...row, flock: { ...row.flock!, current_quantity: 0 } }]));
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector<HTMLButtonElement>('.house button')!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe('quick-access-no-birds-22');
    expect(element.querySelectorAll('.permission-lock')).toHaveLength(0);
    expect(element.textContent).not.toContain('Sin permiso');
    expect(element.textContent).toContain('el lote no tiene aves vivas');
  });

  it('filters houses by normalized name and preserves the query after a task succeeds', async () => {
    const fixture = await render(); const search: HTMLInputElement = fixture.nativeElement.querySelector('input');
    search.value = 'GALPÓN 1'; search.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.house').length).toBe(1);
    fixture.nativeElement.querySelector('.house button').click(); fixture.detectChanges();
    expect(fixture.componentInstance.task()).toMatchObject({ kind: 'collection', flockId: 'lot-1', origin: { unitId: 7, houseId: 22 } });
    fixture.componentInstance.close('Postura registrada.'); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.task()).toBeNull(); expect(search.value).toBe('GALPÓN 1');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Galpón 1 · San José');
  });

  it('blocks tasks without their write or prerequisite read permissions before opening a dialog', async () => {
    const readPermissions = ['can_view_flocks', 'can_view_management_plans', 'can_view_flock_feeding'];
    actor.set({ id: 1, roles: ['employee'], permissions: readPermissions });
    const fixture = await render();
    const host: HTMLElement = fixture.nativeElement;
    const disabled = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.actions button'), (button) => button.disabled);
    expect(disabled()).toEqual([true, true, true, true]);

    const permissions = [...readPermissions, 'can_manage_egg_collections', 'can_manage_mortality',
      'can_manage_flock_feeding', 'can_execute_management_plans'];
    actor.set({ id: 1, roles: ['employee'], permissions });
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(disabled()).toEqual([false, false, true, true]);
    fixture.componentInstance.open(row, 'feeding', new Event('click'));
    fixture.componentInstance.open(row, 'health', new Event('click'));
    expect(fixture.componentInstance.task()).toBeNull();

    actor.set({ id: 1, roles: ['employee'], permissions: [...permissions, 'can_view_feed_stock', 'can_manage_management_plans'] });
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(disabled()).toEqual([false, false, false, false]);
    host.querySelectorAll<HTMLButtonElement>('.actions button')[3].click(); fixture.detectChanges();
    expect(fixture.componentInstance.task()).toMatchObject({ kind: 'health', flockId: 'lot-1', houseName: 'Galpón 1', unitName: 'San José' });
  });

  it('blocks a new manufacture without both the write and recipe permissions', async () => {
    const permissions = ['can_view_production_units', 'can_view_poultry_houses', 'can_view_feed_stock'];
    actor.set({ id: 1, roles: ['employee'], permissions: [...permissions, 'can_view_feed_recipes'] });
    const fixture = await render();
    const page = fixture.componentInstance;
    const host: HTMLElement = fixture.nativeElement;
    const action = () => host.querySelector<HTMLButtonElement>('.elaborate')!;
    page.selectType('feed'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(action().disabled).toBe(true);
    expect(action().textContent).toContain('Sin permiso');
    page.elaborate(plant);
    expect(page.manufacture()).toBeNull();

    actor.set({ id: 1, roles: ['employee'], permissions: [...permissions, 'can_manufacture_feed'] });
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(action().disabled).toBe(true);

    actor.set({ id: 1, roles: ['employee'], permissions: [...permissions, 'can_manufacture_feed', 'can_view_feed_recipes'] });
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(action().disabled).toBe(false);
  });

  it('defaults to Galpón and switches to plant cards with one Elaborar action each', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const selector = element.querySelectorAll<HTMLButtonElement>('.facility-switch button');
    expect(selector[0].textContent).toBe('Galpón');
    expect(selector[0].getAttribute('aria-pressed')).toBe('true');
    expect(plants).not.toHaveBeenCalled();
    selector[1].click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(selector[1].getAttribute('aria-pressed')).toBe('true');
    expect(plants).toHaveBeenCalledWith([unit]);
    const cards = [...element.querySelectorAll('.plant')];
    expect(cards).toHaveLength(2);
    expect(cards.every((card) => card.querySelectorAll('button').length === 1)).toBe(true);
    expect(element.querySelector('.actions')).toBeNull();
    const buttons = element.querySelectorAll<HTMLButtonElement>('.plant button');
    buttons[0].click(); fixture.detectChanges();
    expect(fixture.componentInstance.manufacture()).toMatchObject({ unitId: 7, plantId: 30, plantName: 'Planta San José', unitName: 'San José' });
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[1].getAttribute('aria-describedby')).toBe('plant-unavailable-31');
    buttons[1].click();
    fixture.componentInstance.elaborate(fixture.componentInstance.plants()[1]);
    expect(fixture.componentInstance.manufacture()?.plantId).toBe(30);
  });

  it('searches plants without accents and clears the query when changing installation type', async () => {
    const fixture = await render(); const page = fixture.componentInstance;
    page.selectType('feed'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const search = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(search.placeholder).toBe('Buscar planta');
    search.value = 'SAN JOSÉ'; search.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.plant').length).toBe(1);
    search.value = 'inexistente'; search.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se encontraron plantas');
    page.selectType('poultry'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(page.query()).toBe(''); expect(search.placeholder).toBe('Buscar galpón o lote');
    expect(fixture.nativeElement.querySelectorAll('.house').length).toBe(2);
  });

  it('cancels obsolete requests when switching type or unit and prevents stale plant navigation', async () => {
    const pendingHouses = new Subject<QuickAccessHouse[]>(); const pendingPlants = new Subject<QuickAccessPlant[]>();
    houses.mockReturnValueOnce(pendingHouses); plants.mockReturnValueOnce(pendingPlants).mockReturnValueOnce(of([]));
    const fixture = await render(); const page = fixture.componentInstance;
    page.selectType('feed'); fixture.detectChanges(); await fixture.whenStable();
    expect(pendingHouses.observed).toBe(false);
    pendingHouses.next([row]); expect(page.houses()).toEqual([]);
    selectedId.set(9); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(pendingPlants.observed).toBe(false); expect(plants).toHaveBeenLastCalledWith([]);
    pendingPlants.next([plant]); expect(page.plants()).toEqual([]);
    page.elaborate(plant); expect(page.manufacture()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No hay plantas activas');
  });

  it('keeps the selected type while retrying a failed plant request', async () => {
    plants.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));
    const fixture = await render(); const page = fixture.componentInstance;
    page.selectType('feed'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('consultar las plantas');
    page.retry(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(page.facilityType()).toBe('feed'); expect(page.plants()).toHaveLength(2);
  });

  it('allows recovery of an unresolved operation for a plant that is no longer operational', async () => {
    actor.set({ id: 1, roles: ['employee'], permissions: ['can_view_poultry_houses', 'can_view_feed_stock', 'can_manufacture_feed'] });
    readPending.mockImplementation((owner: string, id: number) => owner === '1:personal' && id === 31
      ? { key: 'pending', request: { planta_id: 31, receta_id: 12, cantidad_g: '26000' } } : null);
    const fixture = await render(); const page = fixture.componentInstance;
    page.selectType('feed'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const button = fixture.nativeElement.querySelectorAll('.elaborate')[1] as HTMLButtonElement;
    expect(button.disabled).toBe(false); expect(button.getAttribute('aria-describedby')).toBe('plant-pending-31');
    button.click(); fixture.detectChanges(); expect(page.manufacture()?.plantId).toBe(31);
  });

  it('keeps the house task open and blocks type changes until it is closed', async () => {
    const fixture = await render(); const page = fixture.componentInstance;
    fixture.nativeElement.querySelector('.house button').click(); fixture.detectChanges();
    expect([...fixture.nativeElement.querySelectorAll('.facility-switch button')].every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    page.selectType('feed'); expect(page.facilityType()).toBe('poultry');
    expect(page.task()?.kind).toBe('collection'); expect(plants).not.toHaveBeenCalled();
    page.close(null); page.selectType('feed'); fixture.detectChanges(); await fixture.whenStable();
    expect(page.facilityType()).toBe('feed');
  });

  it('keeps the plant search and type after success and blocks closure or switching type while saving', async () => {
    const fixture = await render(); const page = fixture.componentInstance;
    page.selectType('feed'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const search = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    search.value = 'SAN JOSÉ'; search.dispatchEvent(new Event('input')); fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('.elaborate') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges();
    const dialog = fixture.debugElement.query(By.directive(ManufactureStubComponent)).componentInstance as ManufactureStubComponent;
    expect(dialog.request().trigger).toBe(trigger);
    dialog.busy.set(true); expect(page.canLeave()).toBe(false);
    page.closeManufacture(null); page.selectType('poultry');
    expect(page.manufacture()).not.toBeNull(); expect(page.facilityType()).toBe('feed');
    dialog.busy.set(false); dialog.closed.emit('Elaboración registrada: 26 kg.');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(page.manufacture()).toBeNull(); expect(page.query()).toBe('SAN JOSÉ'); expect(page.facilityType()).toBe('feed');
    expect(plants).toHaveBeenCalledTimes(2);
    expect(page.message()).toContain('Planta San José · San José');
  });

  it('restores focus on cancel and discards the manufacture modal if the identity changes', async () => {
    const fixture = await render(); const page = fixture.componentInstance;
    page.selectType('feed'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('.elaborate') as HTMLButtonElement;
    const focus = vi.spyOn(trigger, 'focus');
    trigger.click(); fixture.detectChanges(); page.closeManufacture(null); fixture.detectChanges(); await fixture.whenStable();
    expect(focus).toHaveBeenCalled(); expect(plants).toHaveBeenCalledOnce();
    trigger.click(); fixture.detectChanges();
    actor.set({ id: 2, roles: ['admin'], permissions: [] }); fixture.detectChanges(); await fixture.whenStable();
    expect(page.manufacture()).toBeNull(); expect(page.message()).toBeNull();
  });

  it('cancels stale requests when the selected UP changes', async () => {
    const pending = new Subject<QuickAccessHouse[]>(); houses.mockReturnValueOnce(pending).mockReturnValueOnce(of([]));
    const fixture = await render(); expect(fixture.componentInstance.state()).toBe('loading');
    selectedId.set(9); fixture.detectChanges(); await fixture.whenStable();
    expect(pending.observed).toBe(false); expect(houses).toHaveBeenLastCalledWith([]);
    pending.next([row]); expect(fixture.componentInstance.houses()).not.toContain(row);
  });

  it('blocks leaving while saving or health is uncertain and discards a draft when identity changes', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelectorAll('.house button')[0].click(); fixture.detectChanges();
    const task = fixture.debugElement.query(By.directive(TaskStubComponent)).componentInstance as TaskStubComponent;
    task.task.saving.set(true); expect(fixture.componentInstance.canLeave()).toBe(false);
    task.task.saving.set(false); fixture.componentInstance.close(null); fixture.detectChanges();
    fixture.nativeElement.querySelectorAll('.house button')[3].click(); fixture.detectChanges();
    const health = fixture.debugElement.query(By.directive(HealthStubComponent)).componentInstance as HealthStubComponent;
    health.locked.set(true); expect(fixture.componentInstance.canLeave()).toBe(false);
    actor.set({ id: 2, roles: ['admin'], permissions: [] }); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.task()).toBeNull(); expect(fixture.componentInstance.query()).toBe('');
  });

  it.each([{ status: 403, state: 'forbidden' }, { status: 0, state: 'offline' }, { status: 500, state: 'error' }])
  ('shows a $state state and retries without retaining old houses', async ({ status, state }) => {
    houses.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
    const fixture = await render(); expect(fixture.componentInstance.state()).toBe(state);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    fixture.nativeElement.querySelector('.retry').click(); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.state()).toBe('ready');
  });
});

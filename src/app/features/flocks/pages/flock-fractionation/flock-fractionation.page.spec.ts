import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { AuthUser } from '../../../../core/auth/auth.types';
import { FractionationResult } from '../../interfaces/flock-fractionation.interface';
import { FlockFractionationService } from '../../services/flock-fractionation.service';
import { fractionationFixture } from '../../testing/fractionation-fixture';
import { FlockFractionationPage } from './flock-fractionation.page';

const actor: AuthUser = { id: 1, name: 'Admin', email: 'admin@example.test', deleted_at: null, roles: ['admin'], permissions: [] };
const saved: FractionationResult = { operation_id: 'op', destination_flock: { id: 'receiver', code: 'L-018' } };

describe('FlockFractionationPage', () => {
  const user = signal<AuthUser | null>(actor);
  const load = vi.fn<FlockFractionationService['load']>();
  const submit = vi.fn<FlockFractionationService['submit']>();
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(() => {
    user.set(actor); params = new BehaviorSubject(convertToParamMap({ id: 'source' }));
    load.mockReset().mockReturnValue(of(fractionationFixture()));
    submit.mockReset().mockReturnValue(of(saved));
    TestBed.configureTestingModule({ imports: [FlockFractionationPage], providers: [provideRouter([]),
      { provide: FlockFractionationService, useValue: { load, submit } },
      { provide: AuthStore, useValue: { user, isAdmin: () => user()?.roles.includes('admin') === true } },
      { provide: ActivatedRoute, useValue: { paramMap: params, queryParamMap: of(convertToParamMap({ lotFrom: 'house', unitId: '99', houseId: '100' })) } },
      { provide: AlertController, useValue: { create: vi.fn() } },
    ] });
  });

  async function setup() {
    const fixture = TestBed.createComponent(FlockFractionationPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
  }
  const fill = (page: FlockFractionationPage) => {
    page.form.patchValue({ quantity: '40', target: '2', code: 'L-024-B' }); page.form.markAsDirty();
  };

  it('pins the form to the original UP instead of navigation query parameters and clears incompatible fields', async () => {
    const { page, root, fixture } = await setup(); fill(page); fixture.detectChanges();
    expect(root.textContent).toContain('UP origen'); expect(load).toHaveBeenCalledExactlyOnceWith('source');
    expect(page.backQuery()).toEqual({ lotFrom: 'house', unitId: '99', houseId: '100' });
    page.setDestination('existing'); fixture.detectChanges();
    expect(page.form.controls.target.value).toBe(''); expect(page.form.controls.code.value).toBe('');
    expect(root.querySelector('#fractionation-code')).toBeNull();
    page.form.controls.target.setValue('receiver'); page.setKind('total'); fixture.detectChanges();
    expect(root.querySelector('#fractionation-quantity')).toBeNull();
    expect(root.textContent).toContain('420 aves'); expect(root.textContent).toContain('El lote de origen quedará finalizado.');
  });

  it('validates the actual form submit before writing and prevents duplicate requests while saving', async () => {
    const pending = new Subject<FractionationResult>(); submit.mockReturnValue(pending);
    const { page, root, fixture } = await setup();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); fixture.detectChanges();
    expect(submit).not.toHaveBeenCalled(); expect(root.textContent).toContain('Revisá los campos señalados.');
    fill(page);
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); fixture.detectChanges();
    page.submit(); expect(submit).toHaveBeenCalledTimes(1); expect(page.form.disabled).toBe(true); expect(page.canLeave()).toBe(false);
    expect(submit.mock.calls[0][1]).toEqual({ version: 2, quantity: 40, destination_poultry_house_id: 2, destination_code: 'L-024-B' });
    pending.next(saved); fixture.detectChanges();
    expect(root.textContent).toContain('Fraccionamiento registrado'); expect(page.canLeave()).toBe(true);
    const destinationLink = root.querySelector<HTMLAnchorElement>('.destination-link');
    expect(destinationLink?.textContent).toContain('Ver lote de destino');
    expect(destinationLink?.getAttribute('href')).toBe('/administracion/lotes/lotes/receiver');
    expect(root.textContent).toContain('Lote de destino: L-018');
  });

  it('retries an uncertain result with the identical body and key and locks edits and navigation', async () => {
    submit.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    const { page, fixture } = await setup(); fill(page); page.submit(); fixture.detectChanges();
    expect(page.uncertain()).toBe(true); expect(page.form.disabled).toBe(true); expect(page.canLeave()).toBe(false);
    page.setDestination('existing'); expect(page.destination()).toBe('empty');
    page.submit();
    expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0]); expect(page.result()).toEqual(saved);
  });

  it('preserves the form and exposes old backend capacity rejections without adding a local capacity limit', async () => {
    submit.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'La capacidad del galpón es insuficiente.' } })));
    const { page, fixture } = await setup(); fill(page); page.submit(); fixture.detectChanges();
    expect(submit).toHaveBeenCalledOnce(); expect(page.error()).toBe('La capacidad del galpón es insuficiente.');
    expect(page.form.controls.quantity.value).toBe('40'); expect(page.uncertain()).toBe(false);
    const newer = fractionationFixture(); newer.source.version = 3;
    load.mockReturnValue(of(newer)); page.load(); fixture.detectChanges(); page.submit();
    expect(submit.mock.calls[1][1].version).toBe(3); expect(submit.mock.calls[1][2]).not.toBe(submit.mock.calls[0][2]);
  });

  it('maps server errors to the selected fields and issues a new key after correcting a rejected command', async () => {
    submit.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { destination_code: ['Código ya utilizado.'] } } })));
    const { page, root, fixture } = await setup(); fill(page); page.submit(); fixture.detectChanges();
    expect(root.textContent).toContain('Código ya utilizado.'); expect(page.form.disabled).toBe(false);
    page.form.controls.code.setValue('OTRO'); page.submit();
    expect(submit.mock.calls[1][1].destination_code).toBe('OTRO'); expect(submit.mock.calls[1][2]).not.toBe(submit.mock.calls[0][2]);
  });

  it('clears identity data and ignores a late write response after logout', async () => {
    const pending = new Subject<FractionationResult>(); submit.mockReturnValue(pending);
    const { page, root, fixture } = await setup(); fill(page); page.submit(); fixture.detectChanges();
    user.set(null); fixture.detectChanges(); pending.next(saved); fixture.detectChanges();
    expect(page.context()).toBeNull(); expect(page.result()).toBeNull(); expect(page.form.controls.code.value).toBe('');
    expect(root.textContent).not.toContain('L-024'); expect(page.canLeave()).toBe(true);
  });

  it('disallows writes and loads for an identity without redistribution permissions', async () => {
    user.set({ ...actor, roles: [], permissions: ['flocks.view'] });
    const { page, root } = await setup(); page.submit();
    expect(load).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled(); expect(root.textContent).toContain('No tenés permiso');
  });

  it('ignores an outdated load after the route changes', async () => {
    const pending = new Subject<ReturnType<typeof fractionationFixture>>(); load.mockReturnValueOnce(pending);
    const { page, fixture } = await setup();
    params.next(convertToParamMap({ id: 'next' })); fixture.detectChanges();
    pending.next({ ...fractionationFixture(), unitName: 'UP anterior' }); fixture.detectChanges();
    expect(page.context()?.unitName).toBe('UP origen'); expect(page.backLink()).toEqual(['/administracion/lotes/lotes', 'next']);
  });
});

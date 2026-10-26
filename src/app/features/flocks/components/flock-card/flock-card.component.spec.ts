import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FlockCardComponent } from './flock-card.component';

const flock = { id: 'lot-1', code: 'PONEDORAS-89', status: 'active' as const, is_grouped: false,
  entry_date: '2026-10-07', current_quantity: 950 };

describe('FlockCardComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [FlockCardComponent], providers: [provideRouter([])] }));

  it('shows admission, status, live birds and recorded mortality with a link to the lot', () => {
    const fixture = TestBed.createComponent(FlockCardComponent);
    fixture.componentRef.setInput('flock', flock);
    fixture.componentRef.setInput('houseName', 'Galpón Norte');
    fixture.componentRef.setInput('mortality', { state: 'ready', value: 12 });
    fixture.detectChanges();
    const card = fixture.nativeElement as HTMLElement;
    expect(card.textContent).toContain('PONEDORAS-89');
    expect(card.textContent).toContain('Ingreso: 07-10-2026');
    expect(card.textContent).toContain('Galpón Norte');
    expect(card.textContent).toContain('Activo');
    expect(card.querySelectorAll('dd')[0].textContent).toBe('12');
    expect(card.querySelectorAll('dd')[1].textContent).toBe('950');
    expect(card.querySelector('a')?.getAttribute('href')).toBe('/administracion/lotes/lotes/lot-1');
    expect(card.querySelector('.grouped-badge')).toBeNull();
    expect(card.textContent).not.toContain('Individual');
  });

  it('keeps the grouped hen badge and identifies quarantined and finalized lots', () => {
    const fixture = TestBed.createComponent(FlockCardComponent);
    fixture.componentRef.setInput('flock', { ...flock, is_grouped: true, status: 'quarantined' });
    fixture.detectChanges();
    const card = fixture.nativeElement as HTMLElement;
    expect(card.querySelector('.grouped-badge svg')).not.toBeNull();
    expect(card.textContent).toContain('Agrupado');
    expect(card.textContent).toContain('En cuarentena');
    fixture.componentRef.setInput('flock', { ...flock, status: 'finished' });
    fixture.detectChanges();
    expect(card.textContent).toContain('Finalizado');
  });

  it('keeps weighing navigation and emits modal tasks only for an enabled house context', () => {
    const fixture = TestBed.createComponent(FlockCardComponent);
    fixture.componentRef.setInput('flock', flock);
    fixture.componentRef.setInput('returnHouse', { unitId: 7, houseId: 22 });
    fixture.detectChanges();
    const card = fixture.nativeElement as HTMLElement;
    expect(card.querySelector('.flock-tasks')).toBeNull();
    fixture.componentRef.setInput('showTasks', true); fixture.detectChanges();
    const links = [...card.querySelectorAll<HTMLElement>('.task-link')];
    expect(links[0].getAttribute('href')).toBe('/administracion/lotes/lotes/lot-1/pesajes?lotFrom=house&unitId=7&houseId=22&task=entry');
    expect(links.slice(1).every((link) => link.tagName === 'BUTTON' && link.getAttribute('aria-haspopup') === 'dialog')).toBe(true);
    const tasks = vi.fn(); fixture.componentInstance.taskRequested.subscribe(tasks);
    links[1].click(); links[2].click();
    expect(tasks.mock.calls.map(([action]) => action)).toEqual([
      { kind: 'mortality', flockId: flock.id, trigger: links[1] },
      { kind: 'feeding', flockId: flock.id, trigger: links[2] },
    ]);
    expect(card.querySelector('.flock-card-button .task-link')).toBeNull();
    expect((links[2].querySelector('ion-icon') as HTMLElement & { name: string }).name).toBe('leaf-outline');
    fixture.componentRef.setInput('flock', { ...flock, status: 'finished' }); fixture.detectChanges();
    expect(card.querySelector('.flock-tasks')).toBeNull();
  });

  it('distinguishes pending or unavailable mortality from a genuine zero', () => {
    const fixture = TestBed.createComponent(FlockCardComponent);
    fixture.componentRef.setInput('flock', flock);
    fixture.detectChanges();
    const deaths = () => (fixture.nativeElement as HTMLElement).querySelector('dd')?.textContent;
    expect(deaths()).toBe('Cargando…');
    fixture.componentRef.setInput('mortality', { state: 'unavailable', value: null }); fixture.detectChanges();
    expect(deaths()).toBe('No disponible');
    fixture.componentRef.setInput('mortality', { state: 'ready', value: 0 }); fixture.detectChanges();
    expect(deaths()).toBe('0');
  });

  it('does not display negative live birds and retains the recorded balance without guessing deaths', () => {
    const fixture = TestBed.createComponent(FlockCardComponent);
    fixture.componentRef.setInput('flock', { ...flock, current_quantity: -5, entry_date: 'invalid' });
    fixture.componentRef.setInput('mortality', { state: 'ready', value: 1050 }); fixture.detectChanges();
    const card = fixture.nativeElement as HTMLElement;
    expect(card.querySelectorAll('dd')[1].textContent).toBe('0');
    expect(card.textContent).toContain('Saldo registrado: -5 aves');
    expect(card.textContent).toContain('Fecha no disponible');
    expect(card.querySelectorAll('dd')[0].textContent).toBe('1.050');
  });
});

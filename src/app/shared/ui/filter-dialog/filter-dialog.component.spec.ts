import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FilterDialogComponent } from './filter-dialog.component';
import { stubNativeDialog } from '../../testing/native-dialog-test';

@Component({
  imports: [FilterDialogComponent],
  template: '<button #trigger (click)="filters.open(trigger)">Filtros</button><app-filter-dialog #filters titleId="test-filters-title" (applyRequested)="applied = true; filters.close()" (clearRequested)="cleared = true"><label>Estado<select><option>Todos</option></select></label></app-filter-dialog>',
})
class FilterDialogTestHostComponent {
  applied = false;
  cleared = false;
}

describe('FilterDialog', () => {
  let restoreDialog: () => void;
  beforeEach(() => { restoreDialog = stubNativeDialog(); });
  afterEach(() => { restoreDialog(); });

  it('focuses its heading and restores the opener after Escape without applying', () => {
    const fixture = TestBed.createComponent(FilterDialogTestHostComponent);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    trigger.click();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe('test-filters-title');
    expect(document.activeElement).toBe(dialog.querySelector('h2'));
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(fixture.componentInstance.applied).toBe(false);
    fixture.destroy();
  });

  it('keeps clear as a draft action and applies only on request', () => {
    const fixture = TestBed.createComponent(FilterDialogTestHostComponent);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    (dialog.querySelector('.secondary') as HTMLButtonElement).click();
    expect(fixture.componentInstance.cleared).toBe(true);
    expect(fixture.componentInstance.applied).toBe(false);
    expect(dialog.open).toBe(true);
    (dialog.querySelector('.primary') as HTMLButtonElement).click();
    expect(fixture.componentInstance.applied).toBe(true);
    expect(dialog.open).toBe(false);
    fixture.destroy();
  });
});

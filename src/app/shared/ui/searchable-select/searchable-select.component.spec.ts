import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { vi } from 'vitest';

import { SearchableSelectComponent, type SearchableSelectOption } from './searchable-select.component';

@Component({
  imports: [ReactiveFormsModule, SearchableSelectComponent],
  template: `
    <label for="choice">Producto</label>
    <app-searchable-select
      [formControl]="control"
      [options]="options()"
      inputId="choice"
      placeholder="Selecciona un producto"
      [emptyOptionLabel]="emptyOptionLabel()"
      [loading]="loading()"
      [blocked]="blocked()"
      [required]="required()"
      [invalid]="invalid()"
      [describedBy]="describedBy()"
    />
  `,
})
class SearchableSelectHostComponent {
  readonly control = new FormControl('', { nonNullable: true });
  readonly options = signal<readonly SearchableSelectOption[]>([
    { value: 4, label: 'AL-4 — Alimento balanceado' },
    { value: 5, label: 'DOS-5 — Dosis veterinaria' },
  ]);
  readonly emptyOptionLabel = signal<string | null>(null);
  readonly loading = signal(false);
  readonly blocked = signal(false);
  readonly required = signal(false);
  readonly invalid = signal(false);
  readonly describedBy = signal<string | null>(null);
}

describe('SearchableSelectComponent', () => {
  let fixture: ComponentFixture<SearchableSelectHostComponent>;
  let host: SearchableSelectHostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SearchableSelectHostComponent] });
    fixture = TestBed.createComponent(SearchableSelectHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('[role="combobox"]');
  }

  function key(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    input().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  function type(value: string): void {
    input().value = value;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  it('binds string IDs through Reactive Forms and keeps the label and error associations', () => {
    host.control.setValue('5');
    host.required.set(true);
    host.invalid.set(true);
    host.describedBy.set('product-error');
    fixture.detectChanges();

    expect(input().value).toBe('DOS-5 — Dosis veterinaria');
    expect(input().getAttribute('aria-required')).toBe('true');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toBe('product-error');
    expect(input().labels?.[0]?.textContent).toContain('Producto');

    input().focus();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="option"][aria-selected="true"]')?.textContent?.trim())
      .toBe('DOS-5 — Dosis veterinaria');
  });

  it('filters the complete visible label without case sensitivity', () => {
    input().focus();
    fixture.detectChanges();
    type('dOsIs');

    const options = [...fixture.nativeElement.querySelectorAll('[role="option"]')];
    expect(options.map((option: HTMLElement) => option.textContent?.trim()))
      .toEqual(['DOS-5 — Dosis veterinaria']);
  });

  it('searches both product-code fragments and location-name fragments in the visible label', () => {
    host.options.set([{ value: 23, label: 'VAC-23 — Newcastle vacuna' }]);
    fixture.detectChanges();
    input().focus();
    fixture.detectChanges();

    for (const query of ['VAC', '-23', 'Newcastle', 'vacuna']) {
      type(query);
      expect(fixture.nativeElement.querySelectorAll('[role="option"]')).toHaveLength(1);
      expect(fixture.nativeElement.querySelector('[role="option"]')?.textContent).toContain('Newcastle vacuna');
    }
  });

  it('moves through options with arrows and selects the active ID with Enter', () => {
    input().focus();
    fixture.detectChanges();
    key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe('choice-option-0');
    key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe('choice-option-1');
    key('ArrowUp');
    expect(input().getAttribute('aria-activedescendant')).toBe('choice-option-0');
    key('Enter');

    expect(host.control.value).toBe('4');
    expect(input().value).toBe('AL-4 — Alimento balanceado');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('preserves the selected value on Escape and clears the query when closed', () => {
    host.control.setValue('5');
    fixture.detectChanges();
    input().focus();
    fixture.detectChanges();
    type('dosis');

    expect(host.control.value).toBe('5');
    key('Escape');

    expect(host.control.value).toBe('5');
    expect(input().value).toBe('DOS-5 — Dosis veterinaria');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('reopens on click after Escape while the input keeps focus', () => {
    input().focus();
    fixture.detectChanges();
    key('Escape');
    expect(input().getAttribute('aria-expanded')).toBe('false');

    input().click();
    fixture.detectChanges();

    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(input().value).toBe('');
  });

  it('selects the empty filter option without converting it to a missing value', () => {
    host.emptyOptionLabel.set('Todos');
    fixture.detectChanges();
    input().focus();
    fixture.detectChanges();
    const allOption = fixture.nativeElement.querySelector('[role="option"]') as HTMLElement;
    expect(allOption.textContent?.trim()).toBe('Todos');
    allOption.click();
    fixture.detectChanges();

    expect(host.control.value).toBe('');
    expect(input().value).toBe('Todos');
  });

  it('keeps the selected ID and updates its visible label when options change', () => {
    host.control.setValue('5');
    host.options.set([
      { value: 5, label: 'DOS-5 — Dosis actualizada' },
      { value: 4, label: 'AL-4 — Alimento balanceado' },
    ]);
    fixture.detectChanges();

    expect(host.control.value).toBe('5');
    expect(input().value).toBe('DOS-5 — Dosis actualizada');
  });

  it('reports no options and no matching results', () => {
    host.options.set([]);
    fixture.detectChanges();
    input().focus();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('No hay opciones');

    host.options.set([{ value: 4, label: 'AL-4 — Alimento balanceado' }]);
    fixture.detectChanges();
    type('inexistente');
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('No se encontraron');
  });

  it('keeps the Todos choice while announcing that a filtered option list is empty', () => {
    host.options.set([]);
    host.emptyOptionLabel.set('Todos');
    fixture.detectChanges();
    input().focus();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('No hay opciones');
    expect(fixture.nativeElement.querySelector('[role="option"]')?.textContent?.trim()).toBe('Todos');
    expect(input().getAttribute('aria-controls')).toBe('choice-listbox');
  });

  it('keeps Tab unhandled and closes the query on blur', () => {
    input().focus();
    fixture.detectChanges();
    type('DOS');
    const tab = key('Tab');
    input().blur();
    fixture.detectChanges();

    expect(tab.defaultPrevented).toBe(false);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(host.control.value).toBe('');
  });

  it('disables for the form or loading state and exposes the busy state', () => {
    host.control.disable();
    fixture.detectChanges();
    expect(input().disabled).toBe(true);

    host.control.enable();
    host.loading.set(true);
    fixture.detectChanges();
    expect(input().disabled).toBe(true);
    expect(input().getAttribute('aria-busy')).toBe('true');
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Cargando opciones');
  });

  it('keeps the option target at least 44 pixels high', () => {
    input().focus();
    fixture.detectChanges();
    const option = fixture.nativeElement.querySelector('[role="option"]') as HTMLElement;

    expect(Number.parseFloat(getComputedStyle(option).minHeight)).toBeGreaterThanOrEqual(44);
  });

  it('flips above the input and clamps the dropdown to available viewport height', () => {
    let rect = new DOMRect(10, 100, 200, 40);
    vi.spyOn(input(), 'getBoundingClientRect').mockImplementation(() => rect);
    input().focus();
    fixture.detectChanges();

    const dropdown = fixture.nativeElement.querySelector('.dropdown') as HTMLElement;
    expect(dropdown.classList.contains('above')).toBe(false);
    rect = new DOMRect(10, 700, 200, 40);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(dropdown.classList.contains('above')).toBe(true);
    expect(Number.parseFloat(dropdown.style.maxHeight)).toBeGreaterThan(0);
    expect(Number.parseFloat(dropdown.style.maxHeight)).toBeLessThanOrEqual(window.innerHeight);
  });

  it('keeps the dropdown inside 390px, tablet, and desktop viewport widths', () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const widths = [390, 768, 1280];
    let viewportWidth = widths[0];
    vi.spyOn(input(), 'getBoundingClientRect').mockImplementation(() =>
      new DOMRect(viewportWidth - 20, 100, 240, 40));
    input().focus();
    fixture.detectChanges();

    const dropdown = fixture.nativeElement.querySelector('.dropdown') as HTMLElement;
    for (viewportWidth of widths) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewportWidth });
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      const renderedLeft = viewportWidth - 20 + Number.parseFloat(dropdown.style.left);
      const renderedWidth = Number.parseFloat(dropdown.style.width);
      expect(renderedLeft).toBeGreaterThanOrEqual(8);
      expect(renderedLeft + renderedWidth).toBeLessThanOrEqual(viewportWidth - 8);
    }
    if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
  });
});

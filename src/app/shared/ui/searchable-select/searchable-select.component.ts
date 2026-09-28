import { Component, computed, ElementRef, forwardRef, HostListener, input, signal, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SearchableSelectOption {
  readonly value: string | number;
  readonly label: string;
}

let nextSearchableSelectId = 0;

@Component({
  selector: 'app-searchable-select',
  templateUrl: './searchable-select.component.html',
  styleUrl: './searchable-select.component.scss',
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => SearchableSelectComponent),
    multi: true,
  }],
})
export class SearchableSelectComponent implements ControlValueAccessor {
  readonly options = input<readonly SearchableSelectOption[]>([]);
  readonly inputId = input(`searchable-select-${++nextSearchableSelectId}`);
  readonly placeholder = input('Selecciona una opción');
  readonly emptyOptionLabel = input<string | null>(null);
  readonly emptyMessage = input('No hay opciones disponibles.');
  readonly noResultsMessage = input('No se encontraron opciones.');
  readonly loadingMessage = input('Cargando opciones…');
  readonly loading = input(false);
  readonly blocked = input(false);
  readonly required = input(false);
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);

  readonly value = signal('');
  readonly query = signal('');
  readonly isOpen = signal(false);
  readonly activeIndex = signal(-1);
  readonly formDisabled = signal(false);
  readonly placement = signal<'above' | 'below'>('below');
  readonly dropdownMaxHeight = signal(0);
  readonly dropdownLeft = signal(0);
  readonly dropdownWidth = signal<number | null>(null);

  readonly allOptions = computed(() => {
    const emptyLabel = this.emptyOptionLabel();
    return [
      ...(emptyLabel === null ? [] : [{ value: '', label: emptyLabel }]),
      ...this.options(),
    ];
  });

  readonly filteredOptions = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return query
      ? this.allOptions().filter((option) => option.label.toLocaleLowerCase().includes(query))
      : this.allOptions();
  });

  readonly selectedOption = computed(() =>
    this.allOptions().find((option) => String(option.value) === this.value()),
  );

  readonly displayValue = computed(() =>
    this.isOpen() ? this.query() : this.selectedOption()?.label ?? '',
  );

  readonly listboxId = computed(() => `${this.inputId()}-listbox`);
  readonly activeOptionId = computed(() => {
    const index = this.activeIndex();
    return this.isOpen() && index >= 0 && index < this.filteredOptions().length
      ? this.optionId(index)
      : null;
  });
  readonly isDisabled = computed(() => this.blocked() || this.formDisabled() || this.loading());

  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: unknown): void {
    this.value.set(value === null || value === undefined ? '' : String(value));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
    if (disabled) this.close();
  }

  open(): void {
    if (this.isDisabled() || this.isOpen()) return;
    this.query.set('');
    this.isOpen.set(true);
    this.activeIndex.set(this.filteredOptions().findIndex(
      (option) => String(option.value) === this.value(),
    ));
    this.updatePlacement();
  }

  close(markTouched = false): void {
    this.isOpen.set(false);
    this.query.set('');
    this.activeIndex.set(-1);
    if (markTouched) this.onTouched();
  }

  onInput(value: string): void {
    if (this.isDisabled()) return;
    if (!this.isOpen()) this.open();
    this.query.set(value);
    this.activeIndex.set(this.filteredOptions().length ? 0 : -1);
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.isDisabled()) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.isOpen()) this.open();
      else this.moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (!this.isOpen()) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      const active = this.filteredOptions()[this.activeIndex()];
      if (active) this.select(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  @HostListener('window:resize')
  onViewportResize(): void {
    if (this.isOpen()) this.updatePlacement();
  }

  @HostListener('window:scroll')
  onViewportScroll(): void {
    if (this.isOpen()) this.updatePlacement();
  }

  select(option: SearchableSelectOption): void {
    if (this.isDisabled()) return;
    const value = String(option.value);
    this.value.set(value);
    this.onChange(value);
    this.close(true);
  }

  optionId(index: number): string {
    return `${this.inputId()}-option-${index}`;
  }

  isSelected(option: SearchableSelectOption): boolean {
    return String(option.value) === this.value();
  }

  private moveActive(direction: -1 | 1): void {
    const count = this.filteredOptions().length;
    if (!count) {
      this.activeIndex.set(-1);
      return;
    }
    const current = this.activeIndex();
    this.activeIndex.set(current < 0
      ? (direction === 1 ? 0 : count - 1)
      : (current + direction + count) % count);
  }

  private updatePlacement(): void {
    const rect = this.searchInput?.nativeElement.getBoundingClientRect();
    if (!rect) return;

    const margin = 8;
    const gap = 4;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const desiredHeight = Math.min(288, viewportHeight * 0.45);
    const roomBelow = Math.max(0, viewportHeight - rect.bottom - gap - margin);
    const roomAbove = Math.max(0, rect.top - gap - margin);
    const placement = roomBelow >= desiredHeight || roomBelow >= roomAbove ? 'below' : 'above';
    this.placement.set(placement);
    this.dropdownMaxHeight.set(Math.min(desiredHeight, placement === 'below' ? roomBelow : roomAbove));

    const maxWidth = Math.max(0, viewportWidth - margin * 2);
    const width = rect.width > 0 ? Math.min(rect.width, maxWidth) : null;
    this.dropdownWidth.set(width);
    if (width !== null) {
      const left = Math.min(Math.max(margin, rect.left), viewportWidth - margin - width);
      this.dropdownLeft.set(left - rect.left);
    }
  }
}

import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { EMPTY, Subject, catchError, switchMap, tap, timer } from 'rxjs';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../shared/ui/searchable-select/searchable-select.component';
import { ReportFilterDefinition } from '../interfaces/report';
import { reportOptionLabel } from '../services/report-help';
import { ReportingService } from '../services/reporting.service';

export interface CombinedReportFilter {
  key: string;
  definition: ReportFilterDefinition;
  value: FormControl<string>;
  selectedLabel: string | null;
}

@Component({
  selector: 'app-combined-report-filter',
  imports: [ReactiveFormsModule, SearchableSelectComponent],
  template: `
    <label [for]="inputId()">{{ filter().definition.label }}</label>
    @if (hasOptions()) {
      <app-searchable-select [inputId]="inputId()" [formControl]="filter().value"
        [options]="options()" [selectedLabel]="filter().selectedLabel" [loading]="busy()"
        placeholder="Todos" emptyOptionLabel="Todos" [remoteSearch]="remote()"
        (searchChanged)="search.next($event)" />
      @if (failed()) { <small role="alert">No se pudieron cargar las opciones. Vuelve a abrir el selector para reintentar.</small> }
    } @else {
      <input [id]="inputId()" [formControl]="filter().value" />
    }
  `,
  styles: `
    :host { display: grid; gap: .35rem; min-inline-size: 0; }
    label { font-weight: 600; }
    input { width: 100%; min-height: 2.75rem; padding: .5rem .7rem; border: 1px solid var(--gam-color-control-border); border-radius: .5rem; background: var(--gam-color-surface); color: var(--gam-color-text); }
    input:focus-visible { outline: 2px solid var(--gam-color-focus); outline-offset: 2px; }
    small { color: var(--gam-color-danger); }
  `,
})
export class CombinedReportFilterComponent implements OnInit {
  private readonly api = inject(ReportingService);
  private readonly destroyRef = inject(DestroyRef);
  readonly sourceKey = input.required<string>();
  readonly filter = input.required<CombinedReportFilter>();
  readonly changed = output<void>();
  readonly inputId = computed(() => 'filter-' + this.sourceKey() + '-' + this.filter().key);
  readonly search = new Subject<string>();
  readonly busy = signal(false);
  readonly failed = signal(false);
  readonly remoteOptions = signal<SearchableSelectOption[]>([]);
  readonly remote = computed(() => {
    const definition = this.filter().definition;
    return !!definition.options_source && !definition.options && definition.type !== 'boolean';
  });
  readonly hasOptions = computed(() => this.remote() || !!this.filter().definition.options || this.filter().definition.type === 'boolean');
  readonly options = computed(() => {
    const { key, definition } = this.filter();
    if (this.remote()) return this.remoteOptions();
    return (definition.options ?? ['true', 'false']).map(value => ({
      value, label: reportOptionLabel(this.sourceKey(), key, value, definition.type === 'boolean' ? (value === 'true' ? 'Sí' : 'No') : value),
    }));
  });

  ngOnInit(): void {
    this.filter().value.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      this.filter().selectedLabel = this.options().find(option => String(option.value) === value)?.label ?? null;
      this.changed.emit();
    });
    this.search.pipe(
      tap(() => { this.busy.set(true); this.failed.set(false); this.remoteOptions.set([]); }),
      switchMap(search => timer(search ? 250 : 0).pipe(
        switchMap(() => this.api.options(this.sourceKey(), this.filter().key, search)),
        catchError(() => { this.failed.set(true); this.busy.set(false); return EMPTY; }),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(response => {
      this.remoteOptions.set(response.data.map(option => ({
        value: String(option.value),
        label: reportOptionLabel(this.sourceKey(), this.filter().key, option.value, option.label),
      })));
      this.busy.set(false);
    });
  }
}

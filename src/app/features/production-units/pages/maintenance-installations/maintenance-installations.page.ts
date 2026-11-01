import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { buildOutline, chevronForwardOutline, searchOutline } from 'ionicons/icons';
import { forkJoin } from 'rxjs';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { PoultryHouseListItem, PoultryHouseType } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';
import { maintenanceError } from '../../services/maintenance-presentation';

function searchable(value: string): string {
  return value.toLocaleLowerCase('es-UY').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

@Component({
  selector: 'app-maintenance-installations-page',
  imports: [RouterLink, IonButton, IonIcon, IonSpinner],
  templateUrl: './maintenance-installations.page.html',
  styleUrl: './maintenance-installations.page.scss',
})
export class MaintenanceInstallationsPage implements OnInit {
  private readonly api = inject(ProductionUnitsService);
  private readonly unitContext = inject(AdminUnitContextService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  readonly state = signal<'loading' | 'success' | 'error'>('loading');
  readonly error = signal('');
  readonly installations = signal<PoultryHouseListItem[]>([]);
  readonly query = signal('');
  readonly type = signal<PoultryHouseType | 'all'>('all');
  readonly scopeName = computed(() => this.unitContext?.selectedUnit()?.name ?? 'Todas las unidades productivas');
  readonly visibleInstallations = computed(() => {
    const unitId = this.unitContext?.selectedId() ?? null;
    const query = searchable(this.query().trim());
    const type = this.type();
    return this.installations().filter((house) => (unitId === null || house.productionUnit.id === unitId)
      && (type === 'all' || house.type === type)
      && searchable(`${house.name} ${house.productionUnit.name}`).includes(query))
      .sort((a, b) => a.productionUnit.name.localeCompare(b.productionUnit.name, 'es-UY') || a.name.localeCompare(b.name, 'es-UY'));
  });

  constructor() { addIcons({ buildOutline, chevronForwardOutline, searchOutline }); }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.state.set('loading'); this.error.set('');
    forkJoin({ poultry: this.api.listAllPoultryHouses(), feed: this.api.listAllFeedPlants() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ poultry, feed }) => { this.installations.set([...poultry, ...feed]); this.state.set('success'); },
        error: (error: unknown) => { this.error.set(maintenanceError(error, 'No se pudieron cargar las instalaciones. Volvé a intentarlo.')); this.state.set('error'); },
      });
  }

  search(event: Event): void { if (event.target instanceof HTMLInputElement) this.query.set(event.target.value); }
  changeType(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const type = event.target.value;
    if (type === 'all' || type === 'poultry' || type === 'feed') this.type.set(type);
  }
}

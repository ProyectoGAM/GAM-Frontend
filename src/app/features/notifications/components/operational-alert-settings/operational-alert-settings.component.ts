import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, Injector, input, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { carOutline, locationOutline } from 'ionicons/icons';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { OperationalAlert } from '../../interfaces/operational-alert';
import { AlertSettingsService, alertSettingsError } from '../../services/alert-settings.service';
import { AlertLevel } from '../../types/alert-settings.type';
import { OperationalAlertModule, OperationalAlertValue, OperationalAlertValues } from '../../types/operational-alert.type';

const modules = {
  vehicles: { title: 'Vehículos', description: 'Configuración general de la flota', icon: 'car-outline' },
  farm_structure: { title: 'Instalaciones', description: 'Capacidad de galpones de la unidad seleccionada', icon: 'location-outline' },
} satisfies Record<OperationalAlertModule, { title: string; description: string; icon: string }>;

const urgencyLabels: Record<AlertLevel, string> = { bajo: 'Baja', medio: 'Media', alto: 'Alta' };

interface OperationalAlertState {
  unitId: number | null;
  rules: OperationalAlert[] | null;
  error: string;
}

@Component({
  selector: 'app-operational-alert-settings',
  imports: [IonButton, IonIcon],
  templateUrl: './operational-alert-settings.component.html',
  styleUrl: './operational-alert-settings.component.scss',
})
export class OperationalAlertSettingsComponent {
  readonly module = input.required<OperationalAlertModule>();
  readonly unitId = input.required<number | null>();

  private readonly settings = inject(AlertSettingsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly heading = computed(() => modules[this.module()]);
  protected readonly urgencyLabels = urgencyLabels;
  private readonly retry = signal(0);
  private readonly query = computed(() => ({ unitId: this.unitId(), module: this.module(), retry: this.retry() }));
  private readonly loaded = toSignal(toObservable(this.query).pipe(
    switchMap(({ unitId, module }) => this.settings.listOperational(unitId, module).pipe(
      map((rules): OperationalAlertState => ({ unitId, rules, error: '' })),
      startWith({ unitId, rules: null, error: '' } as OperationalAlertState),
      catchError((error: unknown) => of({
        unitId, rules: null, error: alertSettingsError(error, 'No se pudieron cargar las alertas de este módulo.'),
      })),
    )),
  ), { initialValue: { unitId: null, rules: null, error: '' } as OperationalAlertState });
  private readonly data = linkedSignal(() => this.loaded());
  protected readonly rules = computed(() => this.data().unitId === this.unitId() ? this.data().rules ?? [] : []);
  protected readonly loading = computed(() => this.data().unitId !== this.unitId() || (!this.data().rules && !this.data().error));
  protected readonly loadError = computed(() => this.data().unitId === this.unitId() ? this.data().error : '');
  protected readonly editing = linkedSignal<number | null, string | null>({ source: this.unitId, computation: () => null });
  protected readonly saved = linkedSignal<number | null, string | null>({ source: this.unitId, computation: () => null });
  protected readonly error = signal('');
  protected readonly saving = signal(false);

  constructor() {
    addIcons({ 'car-outline': carOutline, 'location-outline': locationOutline });
  }

  protected reload(): void {
    this.retry.update((value) => value + 1);
  }

  protected edit(rule: OperationalAlert): void {
    this.editing.set(rule.tipo);
    this.saved.set(null);
    this.error.set('');
    this.focusAfterRender('.editor input');
  }

  protected closeEditor(): void {
    const id = this.editing();
    this.editing.set(null);
    if (id) this.focusAfterRender(`#edit-${id}`);
  }

  protected save(event: Event, rule: OperationalAlert): void {
    event.preventDefault();
    const form = event.currentTarget;
    const unitId = this.unitId();
    if (!(form instanceof HTMLFormElement) || this.saving() || this.editing() !== rule.tipo
      || rule.unidad_productiva_id !== unitId) return;

    this.error.set('');
    const changes = this.readChanges(new FormData(form), rule);
    if (typeof changes === 'string') {
      this.error.set(changes);
      return;
    }
    if (!Object.keys(changes).length) {
      this.closeEditor();
      return;
    }

    this.saving.set(true);
    this.settings.saveOperational(unitId, rule.tipo, changes).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.saving.set(false);
        if (this.unitId() !== unitId) return;

        const current = this.data();
        if (current.unitId === unitId && current.rules) {
          this.data.set({ ...current, rules: current.rules.map((item) => item.tipo === updated.tipo ? updated : item) });
        } else {
          this.reload();
        }
        this.saved.set(updated.tipo);
        if (this.editing() === updated.tipo) this.closeEditor();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (this.unitId() === unitId && this.editing() === rule.tipo) {
          this.error.set(alertSettingsError(error, 'No se pudieron guardar los cambios. Volvé a intentar.'));
        }
      },
    });
  }

  private readChanges(form: FormData, rule: OperationalAlert): OperationalAlertValues | string {
    const changes: OperationalAlertValues = {};
    for (const field of rule.campos) {
      const raw = form.get(field.clave);
      let value: OperationalAlertValue;
      switch (field.tipo) {
        case 'booleano':
          value = raw !== null;
          break;
        case 'seleccion': {
          const option = field.opciones?.find((item) => (item ?? '') === raw);
          if (option === undefined) return 'Elegí una urgencia válida.';
          value = option;
          break;
        }
        case 'entero':
          value = Number(raw);
          if (typeof raw !== 'string' || !raw.trim() || !Number.isInteger(value)
            || value < (field.minimo ?? 0) || value > (field.maximo ?? Number.MAX_SAFE_INTEGER)) {
            return `${field.etiqueta}. Ingresá un valor entero entre ${field.minimo} y ${field.maximo}.`;
          }
          break;
      }
      if (value !== rule.configuracion[field.clave]) changes[field.clave] = value;
    }
    return changes;
  }

  private focusAfterRender(selector: string): void {
    afterNextRender({
      write: () => this.element.nativeElement.querySelector<HTMLElement>(selector)?.focus(),
    }, { injector: this.injector });
  }
}

import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowForwardOutline, closeOutline, lockClosedOutline, warningOutline } from 'ionicons/icons';
import { Flock } from '../../interfaces/flock.interface';

@Component({
  selector: 'app-flock-status-dialog',
  imports: [ReactiveFormsModule, IonIcon],
  templateUrl: './flock-status-dialog.component.html',
  styleUrl: './flock-status-dialog.component.scss',
})
export class FlockStatusDialogComponent {
  readonly flock = input.required<Flock>();
  readonly departureQuantity = computed(() => Math.max(0, this.flock().current_quantity));
  readonly departureText = computed(() => new Intl.NumberFormat('es-UY').format(this.departureQuantity()));
  readonly statusText = input.required<string>();
  readonly selectedStatus = input.required<Flock['status']>();
  readonly finalizing = computed(() => this.selectedStatus() === 'finished' && this.flock().status !== 'finished');
  readonly form = input.required<FormGroup<{
    status: FormControl<Flock['status']>;
    reason: FormControl<string>;
    confirmFinalization: FormControl<boolean>;
  }>>();
  readonly saving = input(false);
  readonly uncertain = input(false);
  readonly locked = input(false);
  readonly conflict = input(false);
  readonly canManage = input(false);
  readonly canFinalize = input(false);
  readonly error = input<string | null>(null);
  readonly submitted = output<void>();
  readonly closed = output<void>();
  readonly cancelled = output<Event>();
  readonly reloadRequested = output<void>();
  readonly backRequested = output<void>();
  readonly finalizeRequested = output<void>();
  readonly element = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly injector = inject(Injector);

  constructor() {
    addIcons({ arrowForwardOutline, closeOutline, lockClosedOutline, warningOutline });
    effect(() => {
      const finalizing = this.finalizing();
      afterNextRender(() => {
        const dialog = this.element().nativeElement;
        if (dialog.open) dialog.querySelector<HTMLElement>(finalizing ? '#status-title' : 'input[type="radio"]:not(:disabled)')?.focus();
      }, { injector: this.injector });
    });
  }
}

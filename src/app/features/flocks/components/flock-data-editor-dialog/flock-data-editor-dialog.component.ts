import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { Flock, UpdateFlockRequest } from '../../interfaces/flock.interface';

const flockCodePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;

@Component({
  selector: 'app-flock-data-editor-dialog',
  imports: [ReactiveFormsModule, IonIcon],
  templateUrl: './flock-data-editor-dialog.component.html',
  styleUrl: './flock-data-editor-dialog.component.scss',
})
export class FlockDataEditorDialogComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  private readonly original = signal<Flock | null>(null);
  private trigger: HTMLElement | null = null;
  readonly saving = input(false);
  readonly retryOnly = input(false);
  readonly showReload = input(false);
  readonly error = input<string | null>(null);
  readonly saveRequested = output<UpdateFlockRequest>();
  readonly reloadRequested = output<void>();

  protected readonly locked = computed(() => this.saving() || this.retryOnly());
  protected readonly form = new FormGroup({
    code: new FormControl('', { nonNullable: true, validators: [
      (control) => flockCodePattern.test(String(control.value).trim()) ? null : { code: true },
    ] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
  });
  private readonly draft = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly changes = computed<UpdateFlockRequest | null>(() => {
    const original = this.original();
    if (!original) return null;
    const draft = this.draft();
    const code = draft.code?.trim().toUpperCase() ?? '';
    const notes = draft.notes?.trim() || null;
    const codeChanged = code !== original.code.trim().toUpperCase();
    const notesChanged = notes !== (original.notes?.trim() || null);
    return codeChanged || notesChanged ? { version: original.version,
      ...(codeChanged ? { code } : {}), ...(notesChanged ? { notes } : {}) } : null;
  });

  constructor() { addIcons({ closeOutline }); }

  open(flock: Flock, trigger: HTMLElement): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) return;
    this.trigger = trigger;
    this.original.set(flock);
    this.form.reset({ code: flock.code, notes: flock.notes ?? '' });
    dialog.showModal();
    dialog.scrollTop = 0;
    this.heading().nativeElement.focus({ preventScroll: true });
  }

  close(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) dialog.close();
    this.original.set(null);
    if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
    this.trigger = null;
  }

  protected cancel(event?: Event): void {
    event?.preventDefault();
    if (!this.locked()) this.close();
  }

  protected submit(): void {
    const changes = this.changes();
    if (!changes || this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.dialog().nativeElement.querySelector<HTMLElement>(`#flock-editor-${this.form.controls.code.invalid ? 'code' : 'notes'}`)?.focus();
      return;
    }
    this.saveRequested.emit(changes);
  }
}

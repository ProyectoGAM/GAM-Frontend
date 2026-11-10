import { Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { IonSpinner } from '@ionic/angular';

import { AuthStore } from '../../../../core/auth/auth.store';
import { FlockHouseTaskRequest } from '../../interfaces/flock-house-task.interface';
import { canChangeBeakTrimmings } from '../../services/flock-beak-trimming';
import { FlockHouseTaskService } from '../../services/flock-house-task.service';
import { BeakTrimmingDialogComponent } from '../beak-trimming-dialog/beak-trimming-dialog.component';
import { CollectionFormComponent } from '../collection-form/collection-form.component';
import { FeedingEditorComponent } from '../feeding-editor/feeding-editor.component';
import { FlockMortalitySectionComponent } from '../flock-mortality-section/flock-mortality-section.component';

@Component({
  selector: 'app-flock-house-task-dialog',
  imports: [IonSpinner, FeedingEditorComponent, FlockMortalitySectionComponent, CollectionFormComponent, BeakTrimmingDialogComponent],
  templateUrl: './flock-house-task-dialog.component.html',
  styleUrl: './flock-house-task-dialog.component.scss',
  providers: [FlockHouseTaskService],
})
export class FlockHouseTaskDialogComponent implements OnInit {
  readonly request = input.required<FlockHouseTaskRequest>();
  readonly closed = output<string | null>();
  readonly task = inject(FlockHouseTaskService);
  readonly editorOpen = signal(true);
  readonly title = computed(() => ({ collection: 'Registrar postura', mortality: 'Registrar mortandad', feeding: 'Cambiar ración',
    health: 'Sanidad', 'beak-trimming': 'Registrar despique' })[this.request().kind]);
  readonly context = computed(() => `Lote ${this.task.flock()?.code ?? ''} · ${this.request().houseName} · ${this.request().unitName}`);
  private readonly statusDialog = viewChild<ElementRef<HTMLDialogElement>>('statusDialog');
  private readonly mortality = viewChild(FlockMortalitySectionComponent);
  private readonly collection = viewChild(CollectionFormComponent);
  private readonly beakTrimming = viewChild(BeakTrimmingDialogComponent);
  private readonly auth = inject(AuthStore);
  private readonly actorId = this.auth.user()?.id;
  private readonly session = this.auth.session?.();
  private completed = false;

  constructor() {
    effect(() => {
      const dialog = this.statusDialog()?.nativeElement;
      if (!dialog) return;
      if (this.task.state() === 'ready') { if (dialog.open) dialog.close(); }
      else if (!dialog.open) { dialog.showModal(); dialog.querySelector<HTMLButtonElement>('button')?.focus(); }
    });
    effect(() => {
      if (this.task.result()) untracked(() => {
        if (this.request().kind === 'feeding') this.editorOpen.set(false);
        else if (this.request().kind === 'collection') { this.collection()?.saved(); this.finish(); }
        else { this.mortality()?.closeForm(); this.finish(); }
      });
    });
    effect(() => {
      const form = this.collection();
      if (form) untracked(() => form.openForm());
    });
    effect(() => {
      const user = this.auth.user();
      if (user?.id !== this.actorId || (this.request().kind === 'beak-trimming'
        && (this.auth.session?.() !== this.session || !canChangeBeakTrimmings(user, 'record')))) untracked(() => this.finish());
    });
    effect(() => {
      const editor = this.beakTrimming();
      if (editor && !this.completed) untracked(() => editor.openRecord());
    });
    inject(DestroyRef).onDestroy(() => { if (this.statusDialog()?.nativeElement.open) this.statusDialog()?.nativeElement.close(); });
  }

  ngOnInit(): void { this.task.start(this.request()); }

  canLeave(): boolean { return this.beakTrimming()?.canLeave() ?? true; }

  close(): void {
    if (this.task.saving() || !this.canLeave()) return;
    if (this.request().kind === 'feeding' && this.task.state() === 'ready') this.editorOpen.set(false);
    else this.finish();
  }

  cancel(event: Event): void { event.preventDefault(); this.close(); }

  finish(message = this.task.result()): void {
    if (this.completed) return;
    this.completed = true;
    this.closed.emit(message);
  }
}

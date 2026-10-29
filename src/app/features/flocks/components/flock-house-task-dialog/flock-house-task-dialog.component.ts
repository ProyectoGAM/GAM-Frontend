import { Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { IonSpinner } from '@ionic/angular';

import { AuthStore } from '../../../../core/auth/auth.store';
import { FlockHouseTaskRequest } from '../../interfaces/flock-house-task.interface';
import { FlockHouseTaskService } from '../../services/flock-house-task.service';
import { FeedingEditorComponent } from '../feeding-editor/feeding-editor.component';
import { FlockMortalitySectionComponent } from '../flock-mortality-section/flock-mortality-section.component';

@Component({
  selector: 'app-flock-house-task-dialog',
  imports: [IonSpinner, FeedingEditorComponent, FlockMortalitySectionComponent],
  templateUrl: './flock-house-task-dialog.component.html',
  styleUrl: './flock-house-task-dialog.component.scss',
  providers: [FlockHouseTaskService],
})
export class FlockHouseTaskDialogComponent implements OnInit {
  readonly request = input.required<FlockHouseTaskRequest>();
  readonly closed = output<string | null>();
  readonly task = inject(FlockHouseTaskService);
  readonly editorOpen = signal(true);
  readonly title = computed(() => this.request().kind === 'mortality' ? 'Registrar mortandad' : 'Cambiar ración');
  readonly context = computed(() => `Lote ${this.task.flock()?.code ?? ''} · ${this.request().houseName} · ${this.request().unitName}`);
  private readonly statusDialog = viewChild<ElementRef<HTMLDialogElement>>('statusDialog');
  private readonly mortality = viewChild(FlockMortalitySectionComponent);
  private readonly auth = inject(AuthStore);
  private readonly actorId = this.auth.user()?.id;
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
        else { this.mortality()?.closeForm(); this.finish(); }
      });
    });
    effect(() => { if (this.auth.user()?.id !== this.actorId) untracked(() => this.finish()); });
    inject(DestroyRef).onDestroy(() => { if (this.statusDialog()?.nativeElement.open) this.statusDialog()?.nativeElement.close(); });
  }

  ngOnInit(): void { this.task.start(this.request()); }

  close(): void {
    if (this.task.saving()) return;
    if (this.request().kind === 'feeding' && this.task.state() === 'ready') this.editorOpen.set(false);
    else this.finish();
  }

  cancel(event: Event): void { event.preventDefault(); this.close(); }

  finish(): void {
    if (this.completed) return;
    this.completed = true;
    this.closed.emit(this.task.result());
  }
}

import { Component, DestroyRef, ElementRef, OnInit, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { IonSpinner } from '@ionic/angular';
import { AuthStore } from '../../../../core/auth/auth.store';
import { FlockHouseTaskRequest } from '../../interfaces/flock-house-task.interface';
import { FlockHealthApplicationService } from '../../services/flock-health-application.service';
import { HealthApplicationComponent } from '../health-application/health-application.component';

@Component({
  selector: 'app-flock-house-health-dialog',
  imports: [IonSpinner, HealthApplicationComponent],
  providers: [FlockHealthApplicationService],
  templateUrl: './flock-house-health-dialog.component.html',
  styleUrl: '../flock-house-task-dialog/flock-house-task-dialog.component.scss',
})
export class FlockHouseHealthDialogComponent implements OnInit {
  readonly request = input.required<FlockHouseTaskRequest>();
  readonly closed = output<string | null>();
  readonly application = inject(FlockHealthApplicationService);
  private readonly auth = inject(AuthStore);
  private readonly actor = this.auth.user();
  private readonly session = this.auth.session();
  private readonly editor = viewChild(HealthApplicationComponent);
  private readonly statusDialog = viewChild<ElementRef<HTMLDialogElement>>('statusDialog');
  private completed = false;
  private opened = false;

  constructor() {
    effect(() => {
      const editor = this.editor();
      const status = this.statusDialog()?.nativeElement;
      const success = this.application.success();
      untracked(() => {
        if (this.completed) return;
        if (success) { this.finish(success); return; }
        if (editor) {
          if (status?.open) status.close();
          if (!this.opened) { this.opened = true; editor.open(); }
        } else {
          this.opened = false;
          if (status && !status.open) { status.showModal(); status.querySelector('h2')?.focus(); }
        }
      });
    });
    effect(() => {
      const changed = this.auth.user() !== this.actor || this.auth.session() !== this.session;
      if (changed) untracked(() => { this.application.reset(''); this.finish(null); });
    });
    inject(DestroyRef).onDestroy(() => this.dismiss());
  }

  ngOnInit(): void {
    this.application.reset(this.request().flockId, this.request().origin);
    this.application.begin();
  }

  canLeave(): boolean { return this.application.canLeave(); }

  close(event?: Event): void {
    event?.preventDefault();
    if (this.canLeave()) this.finish(null);
  }

  private finish(message: string | null): void {
    if (this.completed) return;
    this.completed = true;
    this.dismiss();
    this.closed.emit(message);
  }

  private dismiss(): void {
    this.editor()?.forceClose();
    const dialog = this.statusDialog()?.nativeElement;
    if (dialog?.open) dialog.close();
  }
}

import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { clipboardOutline, closeOutline, shareSocialOutline } from 'ionicons/icons';

@Component({
  selector: 'app-report-share-dialog',
  imports: [DatePipe, IonIcon],
  template: `
    <dialog #dialog aria-labelledby="share-title" aria-describedby="share-description" (close)="dismissed.emit()">
      <h2 id="share-title"><ion-icon name="share-social-outline" aria-hidden="true" />Compartir este reporte</h2>
      <p id="share-description">Copia el enlace y envíalo a la persona con quien quieres compartir el reporte.</p>
      <label for="share-duration">¿Durante cuánto tiempo podrán abrir el enlace?</label>
      <select id="share-duration" [value]="duration()" [disabled]="busy() || actionBusy()" (change)="changeDuration($event)">
        @for (option of durations; track option.minutes) { <option [value]="option.minutes">{{ option.label }}</option> }
      </select>
      <p class="sharing-hint">Cambiar el tiempo crea un enlace nuevo. Los enlaces que ya enviaste conservan su vencimiento.</p>
      @if (busy()) { <p role="status">Preparando el enlace con el tiempo elegido…</p> }
      @else { <p class="expiry">Cualquier persona con este enlace podrá ver el reporte hasta el <strong>{{ link().expires_at | date:'dd/MM/yyyy HH:mm':'-0300' }}</strong>.</p> }
      <label for="shared-link">Enlace para compartir</label>
      <div class="link-row">
        <input #linkInput id="shared-link" readonly [value]="busy() ? '' : link().url" (click)="linkInput.select()" />
        <button class="clipboard-button" type="button" aria-label="Copiar enlace al portapapeles" title="Copiar enlace" [disabled]="busy() || actionBusy()" (click)="copyRequested.emit()"><ion-icon name="clipboard-outline" aria-hidden="true" /></button>
      </div>
      @if (notice(); as message) { <p class="feedback success" role="status">{{ message }}</p> }
      @if (error(); as message) { <p class="feedback error" role="alert">{{ message }}</p> }
      <div class="actions">
        <button autofocus class="primary" type="button" [disabled]="busy() || actionBusy()" (click)="copyRequested.emit()"><ion-icon name="clipboard-outline" aria-hidden="true" />Copiar enlace</button>
        <button type="button" [disabled]="!sharingAvailable() || busy() || actionBusy()" (click)="shareRequested.emit()"><ion-icon name="share-social-outline" aria-hidden="true" />Compartir</button>
        <button type="button" (click)="close()"><ion-icon name="close-outline" aria-hidden="true" />Cerrar</button>
      </div>
      @if (!sharingAvailable()) { <p class="sharing-hint">En este navegador, copia el enlace y pégalo en un mensaje para compartirlo.</p> }
    </dialog>
  `,
  styles: `
    dialog { box-sizing: border-box; width: min(560px, calc(100% - 2rem)); max-height: calc(100dvh - 2rem); margin: auto; padding: 1.5rem; overflow-y: auto; border: 1px solid var(--gam-color-border); border-radius: 1rem; background: var(--gam-color-surface); color: var(--gam-color-text); box-shadow: 0 8px 32px color-mix(in srgb, var(--gam-color-heading) 25%, transparent); }
    dialog::backdrop { background: color-mix(in srgb, var(--gam-color-nav) 65%, transparent); }
    h2 { display: flex; align-items: center; gap: .6rem; margin: 0; color: var(--gam-color-heading); font-size: 1.3rem; }
    h2 ion-icon { flex: 0 0 1.5rem; font-size: 1.5rem; color: var(--gam-color-primary); }
    p { line-height: 1.5; }.expiry { padding: .85rem; background: var(--gam-color-surface-alt); border-radius: .5rem; }
    label { display: block; font-weight: 600; margin-bottom: .5rem; }
    input, select { box-sizing: border-box; width: 100%; min-height: 44px; padding: .7rem; border: 1px solid var(--gam-color-control-border); border-radius: .45rem; background: var(--gam-color-surface); color: var(--gam-color-text); font: inherit; }
    .link-row { display: flex; align-items: stretch; gap: .5rem; }.link-row input { min-width: 0; flex: 1; }.clipboard-button { flex: 0 0 44px; padding: .6rem; }select { margin-bottom: .5rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .65rem; margin-top: 1.25rem; }
    button { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; min-height: 44px; padding: .7rem .9rem; border: 1px solid var(--gam-color-control-border); border-radius: .5rem; background: var(--gam-color-surface); color: var(--gam-color-primary); font: inherit; cursor: pointer; }
    button ion-icon { flex: 0 0 1.15rem; font-size: 1.15rem; }button.primary { flex: 1; background: var(--gam-color-primary); color: var(--gam-color-on-primary); border-color: var(--gam-color-primary); }
    button:disabled { opacity: .55; cursor: default; }.sharing-hint { color: var(--gam-color-text-muted); font-size: .9rem; }
    .feedback { padding: .85rem; border-radius: .5rem; }.success { color: var(--gam-color-success); background: var(--gam-color-success-soft); }.error { color: var(--gam-color-danger); background: var(--gam-color-danger-soft); }
    :focus-visible { outline: 2px solid var(--gam-color-focus); outline-offset: 2px; }
    @media (max-width: 420px) { dialog { padding: 1rem; }.actions button { width: 100%; } }
  `,
})
export class ReportShareDialogComponent {
  readonly link = input.required<{ url: string; expires_at: string }>();
  readonly notice = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly returnFocus = input<HTMLElement | null>(null);
  readonly duration = input(30);
  readonly busy = input(false);
  readonly actionBusy = input(false);
  readonly sharingAvailable = input(true);
  readonly copyRequested = output<void>();
  readonly shareRequested = output<void>();
  readonly durationRequested = output<number>();
  readonly dismissed = output<void>();
  readonly durations = [
    { minutes: 30, label: '30 minutos' }, { minutes: 60, label: '1 hora' },
    { minutes: 360, label: '6 horas' }, { minutes: 720, label: '12 horas' },
    { minutes: 1440, label: '24 horas' }, { minutes: 10080, label: '7 días' },
    { minutes: 43200, label: '30 días' },
  ];
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    addIcons({ 'clipboard-outline': clipboardOutline, 'close-outline': closeOutline, 'share-social-outline': shareSocialOutline });
    afterNextRender(() => this.dialog().nativeElement.showModal());
    inject(DestroyRef).onDestroy(() => {
      this.close();
      // The request disables its button before showModal can remember it.
      const trigger = this.returnFocus();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }

  close(): void { if (this.dialog().nativeElement.open) this.dialog().nativeElement.close(); }
  changeDuration(event: Event): void { this.durationRequested.emit(Number((event.target as HTMLSelectElement).value)); }
}

import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { FeedManufactureFlowComponent } from '../../../production-units/components/feed-manufacture-flow/feed-manufacture-flow.component';
import { QuickAccessManufactureRequest } from '../../interfaces/quick-access-manufacture-request';

@Component({
  selector: 'app-quick-access-manufacture-dialog',
  imports: [FeedManufactureFlowComponent],
  templateUrl: './quick-access-manufacture-dialog.component.html',
  styleUrl: './quick-access-manufacture-dialog.component.scss',
})
export class QuickAccessManufactureDialogComponent {
  readonly request = input.required<QuickAccessManufactureRequest>();
  readonly closed = output<string | null>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly flow = viewChild(FeedManufactureFlowComponent);
  private completed = false;

  constructor() {
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      dialog.showModal();
      dialog.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    });
    inject(DestroyRef).onDestroy(() => {
      const dialog = this.dialog().nativeElement;
      if (dialog.open) dialog.close();
    });
  }

  canLeave(): boolean { return this.flow()?.canLeave() ?? true; }

  close(event?: Event): void {
    event?.preventDefault();
    if (this.canLeave()) this.flow()?.close();
  }

  backdrop(event: MouseEvent): void {
    const dialog = this.dialog().nativeElement;
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
  }

  finish(message: string | null): void {
    if (this.completed || !this.canLeave()) return;
    this.completed = true;
    this.dialog().nativeElement.close();
    this.closed.emit(message);
  }
}

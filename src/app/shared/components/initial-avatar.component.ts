import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-initial-avatar',
  host: { 'aria-hidden': 'true' },
  template: '{{ initial() }}',
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      inline-size: var(--avatar-size, 2rem);
      block-size: var(--avatar-size, 2rem);
      border-radius: 50%;
      background: var(--gam-color-primary-soft);
      color: var(--gam-color-primary);
      font-size: calc(var(--avatar-size, 2rem) / 2);
      font-weight: 700;
      line-height: 1;
    }
  `,
})
export class InitialAvatarComponent {
  readonly name = input.required<string>();
  readonly initial = computed(() => {
    const [initial = '?'] = this.name().trim().normalize().toUpperCase();
    return initial;
  });
}

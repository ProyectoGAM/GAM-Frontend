import { Injectable, computed, effect, inject } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { PendingCustomerCommand } from '../types/customer-command.type';

@Injectable({ providedIn: 'root' })
export class CustomerPendingCommands {
  private readonly auth = inject(AuthStore);
  readonly owner = computed(() => `${this.auth.user()?.id ?? 'guest'}:${this.auth.session()?.id ?? 'personal'}`);
  private readonly commands = new Map<string, PendingCustomerCommand>();
  private previousOwner = this.owner();

  constructor() {
    effect(() => {
      const owner = this.owner();
      if (owner !== this.previousOwner) this.commands.clear();
      this.previousOwner = owner;
    });
  }

  get(scope: string): PendingCustomerCommand | null { return this.commands.get(`${this.owner()}:${scope}`) ?? null; }
  remember(scope: string, command: PendingCustomerCommand): void { this.commands.set(`${this.owner()}:${scope}`, command); }
  forget(scope: string): void { this.commands.delete(`${this.owner()}:${scope}`); }
}

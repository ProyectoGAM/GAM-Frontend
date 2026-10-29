import { TestBed } from '@angular/core/testing';

import { RolesPanelComponent } from './roles-panel.component';

describe('Role editor pending contracts', () => {
  it('shows existing roles and a disabled permission structure without claiming real permissions', () => {
    const fixture = TestBed.createComponent(RolesPanelComponent); fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Administrador');
    expect(element.textContent).toContain('Por implementar');
    fixture.componentInstance.open(null); fixture.detectChanges();
    expect(element.querySelector('input[placeholder="Ej.: LOTS"]')?.matches(':disabled')).toBe(true);
    expect(element.querySelector('input[type="checkbox"]')?.matches(':disabled')).toBe(true);
    expect(element.querySelector('input[placeholder="Ej.: ALLOW_EDIT"]')).not.toBeNull();
    expect(element.querySelector<HTMLButtonElement>('.save')?.disabled).toBe(true);
  });
});

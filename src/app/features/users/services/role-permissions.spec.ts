import { permissionItems, roleSelectionPlan, roleSelectionError, canEditRole } from './role-permissions';
import { roleModules, testRole } from '../testing/role-fixtures';

describe('Role permission selection', () => {
  const items = permissionItems(roleModules);

  it('adds dependencies without duplicating existing choices and cascades dependent removals', () => {
    const add = roleSelectionPlan(items, ['can_login_shared'], ['can_adjust_feed_stock'], true);
    expect(new Set(add.selection)).toEqual(new Set(['can_login_shared', 'can_view_feed_stock', 'can_adjust_feed_stock']));
    expect(add.added.map((item) => item.etiqueta)).toEqual(['Ver stock de alimento', 'Ajustar stock de alimento']);
    const all = roleSelectionPlan(items, add.selection, ['can_manufacture_feed', 'can_adjust_feed_stock'], true);
    expect(all.selection).toHaveLength(4);
    const remove = roleSelectionPlan(items, all.selection, ['can_view_feed_stock'], false);
    expect(remove.selection).toEqual(['can_login_shared']); expect(remove.removed).toHaveLength(3);
  });

  it('never includes nonassignable or missing dependencies in a partially applied batch', () => {
    expect(() => roleSelectionPlan(items, [], ['can_adjust_feed_stock', 'can_manage_medicines'], true)).toThrow('asignable');
    const incomplete = items.map((item) => item.nombre === 'can_adjust_feed_stock' ? { ...item, requiere: ['can_missing'] } : item);
    expect(() => roleSelectionPlan(incomplete, [], ['can_adjust_feed_stock'], true)).toThrow('asignable');
    expect(roleSelectionError(items, ['can_adjust_feed_stock'], false)).toContain('dependencias');
    expect(roleSelectionError(items, ['can_unknown'], false)).toContain('cargar');
  });

  it('supports dependencies across modules and fails safely on cycles', () => {
    const crossModule = items.map((item) => item.nombre === 'can_manufacture_feed' ? { ...item, requiere: ['can_login_shared'] } : item);
    expect(roleSelectionPlan(crossModule, [], ['can_manufacture_feed'], true).selection).toContain('can_login_shared');
    const cyclic = items.map((item) => item.nombre === 'can_view_feed_stock' ? { ...item, requiere: ['can_adjust_feed_stock'] } : item);
    expect(() => roleSelectionPlan(cyclic, [], ['can_adjust_feed_stock'], true)).toThrow('circulares');
  });

  it('treats protected editable system roles separately from Admin and Sin rol', () => {
    expect(canEditRole({ ...testRole, protegido: true, clave: 'employee' })).toBe(true);
    expect(canEditRole({ ...testRole, clave: 'unassigned', editable: true })).toBe(false);
    expect(canEditRole({ ...testRole, clave: 'admin', editable: true })).toBe(false);
  });
});


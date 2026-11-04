import { ManagedRoleDefinition, RolePermissionItem, RolePermissionModule, RoleSelectionPlan } from '../interfaces/role-management.interface';

export function canEditRole(role: ManagedRoleDefinition | null): boolean {
  return role === null || (role.editable && !['admin', 'unassigned'].includes(role.clave));
}

export function permissionItems(modules: RolePermissionModule[]): RolePermissionItem[] {
  return modules.flatMap((module) => module.permisos.map((permission) => ({ ...permission, module: module.modulo, moduleLabel: module.etiqueta })));
}

export function roleSelectionPlan(items: RolePermissionItem[], current: string[], requested: string[], enable: boolean): RoleSelectionPlan {
  const catalog = new Map(items.map((item) => [item.nombre, item]));
  const next = new Set(current);
  if (enable) {
    const visiting = new Set<string>();
    const add = (name: string) => {
      const item = catalog.get(name);
      if (!item || !item.asignable) throw new Error('No se puede completar la selección: falta un permiso asignable del catálogo.');
      if (visiting.has(name)) throw new Error('El catálogo tiene dependencias circulares. Actualizá los permisos antes de continuar.');
      visiting.add(name);
      for (const dependency of item.requiere) add(dependency);
      visiting.delete(name);
      next.add(name);
    };
    for (const name of requested) add(name);
  } else {
    requested.forEach((name) => next.delete(name));
    let changed = true;
    while (changed) {
      changed = false;
      for (const name of next) {
        const item = catalog.get(name);
        if (!item) throw new Error('No pudimos reconocer todos los permisos. Actualizá el catálogo.');
        if (item.requiere.some((dependency) => !next.has(dependency))) { next.delete(name); changed = true; }
      }
    }
  }
  return {
    selection: [...next],
    added: items.filter((item) => next.has(item.nombre) && !current.includes(item.nombre)),
    removed: items.filter((item) => !next.has(item.nombre) && current.includes(item.nombre)),
  };
}

export function roleSelectionError(items: RolePermissionItem[], selection: string[], readOnly: boolean): string {
  const catalog = new Map(items.map((item) => [item.nombre, item]));
  for (const name of selection) {
    const item = catalog.get(name);
    if (!item) return 'Hay permisos que no pudimos cargar. Actualizá el catálogo antes de guardar.';
    if (!readOnly && !item.asignable) return 'La selección contiene permisos exclusivos de Administrador. Revisá el catálogo.';
    if (item.requiere.some((dependency) => !selection.includes(dependency))) return 'La selección necesita permisos relacionados. Revisá las dependencias antes de guardar.';
  }
  return '';
}


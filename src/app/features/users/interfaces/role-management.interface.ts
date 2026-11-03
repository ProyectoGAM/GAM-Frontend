export interface RolePermission {
  nombre: string;
  etiqueta: string;
  descripcion: string;
  requiere: string[];
  asignable: boolean;
}

export interface RolePermissionModule {
  modulo: string;
  etiqueta: string;
  permisos: RolePermission[];
}

export interface ManagedRoleDefinition {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  version: number;
  protegido: boolean;
  editable: boolean;
  permisos: string[];
  usuarios_count?: number;
}

export interface ManagedRolesResponse {
  data: ManagedRoleDefinition[];
  meta: { current_page: number; last_page: number; total: number };
}

export interface RoleMetadata {
  nombre: string;
  descripcion: string | null;
}

export interface RolePermissionItem extends RolePermission {
  module: string;
  moduleLabel: string;
}

export interface RoleSelectionPlan {
  selection: string[];
  added: RolePermissionItem[];
  removed: RolePermissionItem[];
}

export interface RoleModuleView extends RolePermissionModule {
  selectedCount: number;
  missingCount: number;
  visiblePermissions: RolePermissionItem[];
}

export interface RoleFieldErrors {
  nombre?: string;
  descripcion?: string;
  permisos?: string;
}


import { ManagedRoleDefinition, RolePermissionModule } from '../interfaces/role-management.interface';

export const roleModules: RolePermissionModule[] = [
  { modulo: 'identity', etiqueta: 'Identidad y acceso', permisos: [
    { nombre: 'can_login_shared', etiqueta: 'Acceder desde dispositivo compartido', descripcion: 'Ingreso con PIN.', requiere: [], asignable: true },
  ] },
  { modulo: 'feed_stock', etiqueta: 'Alimento e ingredientes', permisos: [
    { nombre: 'can_view_feed_stock', etiqueta: 'Ver stock de alimento', descripcion: 'Consultar saldos.', requiere: [], asignable: true },
    { nombre: 'can_manufacture_feed', etiqueta: 'Elaborar alimento', descripcion: 'Registrar elaboraciones.', requiere: ['can_view_feed_stock'], asignable: true },
    { nombre: 'can_adjust_feed_stock', etiqueta: 'Ajustar stock de alimento', descripcion: 'Corregir saldos.', requiere: ['can_view_feed_stock'], asignable: true },
  ] },
  { modulo: 'health', etiqueta: 'Sanidad', permisos: [
    { nombre: 'can_manage_medicines', etiqueta: 'Gestionar medicamentos', descripcion: 'Exclusivo de Admin.', requiere: [], asignable: false },
  ] },
];

export const testRole: ManagedRoleDefinition = {
  id: 7, clave: 'operador_alimento', nombre: 'Operador de alimento', descripcion: 'Control de alimento',
  version: 3, protegido: false, editable: true, permisos: ['can_login_shared', 'can_view_feed_stock'], usuarios_count: 6,
};

export const rolePage = { data: [testRole], meta: { current_page: 1, last_page: 1, total: 1 } };


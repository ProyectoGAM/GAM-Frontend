// One-to-one renames from the backend. Older feature controls still read
// the original names and older API responses can still contain them.
const legacyKeys: Readonly<Record<string, string>> = {
  can_view_admin_dashboard: 'admin.dashboard.view',
  can_view_audit: 'audit.view',
  can_view_customers: 'customers.view',
  can_manage_customers: 'customers.manage',
  can_view_customer_accounts: 'customer-accounts.view',
  can_record_customer_payments: 'customer-payments.record',
  can_adjust_customer_accounts: 'customer-accounts.adjust',
  can_reverse_customer_accounts: 'customer-accounts.reverse',
  can_view_flocks: 'flocks.view',
  can_manage_flocks: 'flocks.manage',
  can_redistribute_flocks: 'flocks.redistribute',
  can_finalize_flocks: 'flocks.finalize',
  can_view_management_plans: 'management-plans.view',
  can_manage_management_plans: 'management-plans.manage',
  can_execute_management_plans: 'management-plans.execute',
  can_manage_egg_collections: 'egg-collections.manage',
  can_view_egg_stock: 'egg-stock.view',
  can_move_egg_stock: 'egg-stock.move',
  can_adjust_egg_stock: 'egg-stock.adjust',
  can_manage_weighings: 'weighings.manage',
  can_view_production_units: 'production-units.view',
  can_manage_production_units: 'production-units.manage',
  can_view_poultry_houses: 'poultry-houses.view',
  can_manage_poultry_houses: 'poultry-houses.manage',
  can_view_suppliers: 'suppliers.view',
  can_view_products: 'products.view',
  can_manage_products: 'products.manage',
  can_view_inventory: 'inventory.view',
  can_move_inventory: 'inventory.move',
  can_adjust_inventory: 'inventory.adjust',
  can_manage_inventory: 'inventory.manage',
  can_view_reports: 'reports.view',
  can_view_feed_recipes: 'feed-recipes.view',
  can_manage_feed_recipes: 'feed-recipes.manage',
  can_manage_users: 'identity.users.manage',
  can_record_delivery_fuel: 'delivery.fuel.record',
  can_monitor_deliveries: 'delivery.monitor',
  can_view_delivery_history: 'delivery.history',
  can_view_vehicles: 'vehicles.view',
  can_manage_vehicles: 'vehicles.manage',
  can_use_vehicles: 'vehicles.use',
  can_manage_vehicle_readings: 'vehicles.readings.manage',
  can_view_vehicle_fuel: 'vehicles.fuel.view',
  can_manage_vehicle_fuel: 'vehicles.fuel.manage',
  can_view_vehicle_maintenance: 'vehicles.maintenance.view',
  can_manage_vehicle_maintenance: 'vehicles.maintenance.manage',
  can_view_vehicle_documents: 'vehicles.documents.view',
  can_manage_vehicle_documents: 'vehicles.documents.manage',
};

export function hasAnyPermission(permissions: readonly string[] | undefined, ...keys: string[]): boolean {
  return keys.some((key) => permissions?.includes(key) || permissions?.includes(legacyKeys[key]));
}

export function withLegacyPermissionKeys(permissions: string[]): string[] {
  return [...new Set(permissions.flatMap((key) => Object.hasOwn(legacyKeys, key) ? [key, legacyKeys[key]] : [key]))];
}

export interface Expense {
  id: string;
  date: string;
  category: 'Mantenimiento de instalación' | 'Combustible' | 'Mantenimiento vehicular';
  description: string;
  origin: string;
  originLink: readonly (string | number)[];
  unit: { id: number; name: string } | null;
  amount: string;
  currency: string;
}

export interface VehicleExpenseAccess {
  fuel: boolean;
  maintenance: boolean;
}

import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, forkJoin, from, map, mergeMap, of, reduce } from 'rxjs';
import { ProductionUnit } from '../../production-units/interfaces/production-unit.interface';
import { InstallationMaintenanceService } from '../../production-units/services/installation-maintenance.service';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { Vehicle } from '../../vehicles/interfaces/vehicle';
import { VehiclesApi } from '../../vehicles/services/vehicles.api';
import { Expense, VehicleExpenseAccess } from '../interfaces/expense';

interface ExpenseSourcePage<T> {
  data: T[];
  current_page: number;
  last_page: number;
}

function allPages<T>(load: (page: number) => Observable<ExpenseSourcePage<T>>) {
  return load(1).pipe(
    expand((page) => page.current_page < page.last_page ? load(page.current_page + 1) : EMPTY, 1),
    reduce((items, page) => items.concat(page.data), [] as T[]),
  );
}

const localDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit',
});

@Injectable({ providedIn: 'root' })
export class ExpensesService {
  private readonly units = inject(ProductionUnitsService);
  private readonly maintenance = inject(InstallationMaintenanceService);
  private readonly vehicles = inject(VehiclesApi);

  list(units: readonly ProductionUnit[], vehicleAccess: VehicleExpenseAccess) {
    return forkJoin([this.installationExpenses(units), this.vehicleExpenses(vehicleAccess)]).pipe(
      map(([installations, vehicles]) => {
        const unique = new Map([...installations, ...vehicles].map((expense) => [expense.id, expense]));
        return Array.from(unique.values()).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
      }),
    );
  }

  private installationExpenses(units: readonly ProductionUnit[]) {
    return from(units).pipe(
      mergeMap((unit) => this.units.poultryHouses(unit.id).pipe(
        map((houses) => houses.map((house) => ({ unit, house }))),
      ), 4),
      mergeMap((houses) => from(houses)),
      mergeMap(({ unit, house }) => allPages((page) => this.maintenance.list(house.id, { status: 'completed' }, page, 100).pipe(
        map(({ data, meta }) => ({ data, ...meta })),
      )).pipe(map((records) => records.filter((record) => record.status === 'completed').map((record): Expense => ({
        id: `installation:${record.id}`,
        date: record.maintenance_date,
        category: 'Mantenimiento de instalación',
        description: record.description,
        origin: house.name,
        originLink: ['/administracion/ubicaciones/mantenimiento', unit.id, 'galpon', house.id],
        unit: { id: unit.id, name: unit.name },
        ...record.cost,
      })))), 4),
      reduce((expenses, records) => expenses.concat(records), [] as Expense[]),
    );
  }

  private vehicleExpenses(access: VehicleExpenseAccess) {
    if (!access.fuel && !access.maintenance) return of([]);

    return allPages((page) => this.vehicles.list({ page }).pipe(map(({ data, meta }) => ({ data, ...meta })))).pipe(
      mergeMap((vehicles) => from(vehicles)),
      mergeMap((vehicle) => this.vehicleHistory(vehicle, access), 3),
      reduce((expenses, records) => expenses.concat(records), [] as Expense[]),
    );
  }

  private vehicleHistory(vehicle: Vehicle, access: VehicleExpenseAccess) {
    const origin = {
      origin: vehicle.plate,
      originLink: ['/administracion/vehiculos', vehicle.id],
      unit: null,
    };
    const fuel = access.fuel ? allPages((page) => this.vehicles.fuelHistory(vehicle.id, page).pipe(map(({ data }) => data)))
      .pipe(map((records) => records.map((record): Expense => ({
        ...origin,
        id: `fuel:${record.id}`,
        date: localDay.format(new Date(record.occurred_at)),
        category: 'Combustible',
        description: record.supplier ? `${record.fuel_type} · ${record.supplier}` : record.fuel_type,
        amount: record.amount,
        currency: record.currency,
      })))) : of([]);
    const maintenance = access.maintenance ? allPages((page) =>
      this.vehicles.maintenanceHistory(vehicle.id, page).pipe(map(({ data }) => data)))
      .pipe(map((records) => records.filter((record) => record.status === 'completed' && record.completed_at).map((record): Expense => ({
        ...origin,
        id: `vehicle-maintenance:${record.public_id}`,
        date: localDay.format(new Date(record.completed_at!)),
        category: 'Mantenimiento vehicular',
        description: record.description,
        amount: record.cost_amount,
        currency: record.cost_currency,
      })))) : of([]);
    return forkJoin([fuel, maintenance]).pipe(map(([fuelRecords, maintenanceRecords]) => [...fuelRecords, ...maintenanceRecords]));
  }
}

import { ReportQuery, ReportSource } from '../interfaces/report';

export interface ReportFormValue {
  columns: string[];
  groupings: string[];
  metrics: string[];
  from: string;
  to: string;
  sort: string;
  direction: 'asc' | 'desc';
  filters: { field: string; operator: string; value: string }[];
}

export function queryFromForm(source: ReportSource, form: ReportFormValue): ReportQuery {
  if (!form.columns.length) throw new Error('Selecciona al menos una columna.');
  const filters: NonNullable<ReportQuery['filters']> = [];
  for (const filter of form.filters) {
    if (!filter.value.trim()) continue;
    const definition = source.filters[filter.field];
    if (!definition || !definition.operators.includes(filter.operator)) throw new Error('El filtro no está permitido.');
    const parse = (value: string): string | number | boolean => {
      if (definition.type === 'integer') {
        const result = Number(value);
        if (!Number.isSafeInteger(result) || result < 1) throw new Error('Selecciona una opción válida para ' + definition.label + '.');
        return result;
      }
      if (definition.type === 'boolean') {
        if (value !== 'true' && value !== 'false') throw new Error('El filtro debe indicar Sí o No.');
        return value === 'true';
      }
      return value;
    };
    const value = ['in', 'not_in'].includes(filter.operator)
      ? filter.value.split(',').map((item) => parse(item.trim())) : parse(filter.value);
    filters.push({ field: filter.field, operator: filter.operator, value });
  }
  if (form.from && form.to && form.to < form.from) throw new Error('La fecha final debe ser posterior a la inicial.');
  const grouped = form.groupings.length > 0 || form.metrics.length > 0;
  const available = grouped ? [...form.groupings, ...form.metrics] : Object.keys(source.sorts);
  const sort = available.includes(form.sort) ? form.sort : available[0];
  return { columns: form.columns.filter((column) => column in source.columns), filters,
    from: source.supports_date_range ? form.from || null : null, to: source.supports_date_range ? form.to || null : null,
    groupings: form.groupings.filter((field) => field in source.groupings), metrics: form.metrics.filter((field) => field in source.metrics),
    sorts: sort ? [{ field: sort, direction: form.direction }] : [], page: 1, per_page: Math.min(50, source.limits.max_page_size) };
}

export function formatReportCell(value: string | number | boolean | null, type: string): string {
  if (value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return String(value).split('-').reverse().join('/');
  }
  if (type === 'datetime') {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('es-UY', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Montevideo' }).format(date);
  }
  if (['number', 'integer', 'quantity', 'money', 'count'].includes(type) && /^-?\d+(\.\d+)?$/.test(String(value))) {
    const raw = String(value);
    const [integer, fraction] = raw.replace(/^-/, '').split('.');
    const decimals = fraction?.replace(/0+$/, '');
    return (raw.startsWith('-') ? '-' : '') + new Intl.NumberFormat('es-UY').format(BigInt(integer)) + (decimals ? ',' + decimals : '');
  }
  return String(value);
}

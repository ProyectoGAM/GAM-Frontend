import { ReportSource } from '../interfaces/report';

export function reportSourceFixture(): ReportSource {
  return {
    key: 'lots.egg-production', definition_version: '1.0', label: 'Postura', description: 'Historial de postura',
    columns: { poultry_house: { label: 'Galpón', type: 'string' }, quantity: { label: 'Huevos', type: 'quantity', unit: 'huevos' } },
    filters: { poultry_house_id: { label: 'Galpón', type: 'integer', operators: ['eq', 'in'] }, active: { label: 'Activo', type: 'boolean', operators: ['eq'] } },
    groupings: { poultry_house: { label: 'Galpón', type: 'dimension' } }, metrics: { egg_count: { label: 'Huevos producidos', type: 'quantity', unit: 'huevos' } },
    sorts: { poultry_house: { label: 'Galpón', direction: 'both' }, quantity: { label: 'Huevos', direction: 'both' }, egg_count: { label: 'Total', direction: 'both' } },
    default_sort: 'quantity:desc', default_columns: ['poultry_house', 'quantity'], standard_queries: [], supports_date_range: true,
    formats: ['xlsx', 'pdf'], limits: { max_page_size: 100, max_range_days: 0, max_export_rows: 50000 }, format_limits: { xlsx: 50000, pdf: 2000 },
    capabilities: { export: true, share: true, presets: false },
  };
}

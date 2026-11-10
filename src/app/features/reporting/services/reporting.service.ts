import { Injectable, inject } from '@angular/core';
import { Observable, exhaustMap, map, takeWhile, timer } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { FileDownloadService } from '../../../core/native/file-download.service';
import { ReportEnvelope, ReportExport, ReportOptions, ReportPage, ReportPreset, ReportQuery, ReportResult, ReportSource, ReportTemporaryLink } from '../interfaces/report';
import { reportHelp } from './report-presentation';

@Injectable({ providedIn: 'root' })
export class ReportingService {
  private readonly api = inject(ApiClient);
  private readonly files = inject(FileDownloadService);

  sources(): Observable<ReportEnvelope<ReportSource[]>> {
    return this.api.get<ReportEnvelope<ReportSource[]>>('reportes/fuentes').pipe(map((response) => ({
      ...response,
      data: response.data.map((source) => source.key === 'lots.weighing-measurements'
        ? { ...source, label: 'Posturas', description: reportHelp[source.key] }
        : source),
    })));
  }
  preview(source: string, query: ReportQuery): Observable<ReportEnvelope<ReportResult>> {
    return this.api.post('reportes/' + encodeURIComponent(source) + '/previsualizaciones', query);
  }
  options(source: string, field: string, search = '', page = 1): Observable<ReportOptions> {
    return this.api.get('reportes/' + encodeURIComponent(source) + '/opciones', { params: { field, search: search || undefined, page } });
  }
  presets(page = 1): Observable<ReportPage<ReportPreset>> { return this.api.get('configuraciones-reportes', { params: { page, per_page: 50 } }); }
  preset(id: number): Observable<ReportEnvelope<ReportPreset>> { return this.api.get('configuraciones-reportes/' + id); }
  createPreset(name: string, source: string, configuration: ReportQuery): Observable<ReportEnvelope<ReportPreset>> {
    return this.api.post('configuraciones-reportes', { name, source_key: source, configuration });
  }
  updatePreset(id: number, name: string, configuration: ReportQuery): Observable<ReportEnvelope<ReportPreset>> {
    return this.api.patch('configuraciones-reportes/' + id, { name, configuration });
  }
  deletePreset(id: number): Observable<void> { return this.api.delete('configuraciones-reportes/' + id); }
  requestExport(source: string, query: ReportQuery, format: 'xlsx' | 'pdf', key: string): Observable<ReportEnvelope<ReportExport>> {
    return this.api.post('reportes/' + encodeURIComponent(source) + '/exportaciones', { ...query, page: 1, format }, { headers: { 'Idempotency-Key': key } });
  }
  exports(page = 1): Observable<ReportPage<ReportExport>> { return this.api.get('exportaciones-reportes', { params: { page, per_page: 20 } }); }
  watchExport(id: number): Observable<ReportEnvelope<ReportExport>> {
    return timer(0, 3000).pipe(exhaustMap(() => this.api.get<ReportEnvelope<ReportExport>>('exportaciones-reportes/' + id)),
      takeWhile((response) => response.data.status === 'pending' || response.data.status === 'processing', true));
  }
  download(item: ReportExport): Promise<void> { return this.files.download('exportaciones-reportes/' + item.id + '/descarga', item.file_name); }
  temporaryLink(id: number, minutes = 30): Observable<ReportTemporaryLink> {
    return this.api.post('exportaciones-reportes/' + id + '/enlaces-temporales', { expires_in: minutes });
  }
  canShareLink(): boolean { return this.files.canShareLink(); }
  copyLink(url: string): Promise<void> { return this.files.copyLink(url); }
  shareLink(url: string): Promise<boolean> { return this.files.shareLink(url); }
}

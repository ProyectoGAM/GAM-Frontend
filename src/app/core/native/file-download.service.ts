import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable, effect, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import { Share } from '@capacitor/share';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../api/api-client';
import { API_CONFIG } from '../config/api.config';
import { AuthStore } from '../auth/auth.store';

@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  private readonly api = inject(ApiClient);
  private readonly config = inject(API_CONFIG);
  private readonly auth = inject(AuthStore);
  private readonly pendingFiles = new Set<string>();
  private sessionContext: string | null = null;

  constructor() {
    effect(() => {
      const context = JSON.stringify([this.auth.user()?.id ?? null, this.auth.session()?.id ?? null]);
      if (context === this.sessionContext) return;
      this.sessionContext = context;
      for (const file of this.pendingFiles) void this.remove(file);
    });
    if (Capacitor.isNativePlatform()) void this.removePreviousFiles();
  }

  private async removePreviousFiles(): Promise<void> {
    const result = await Filesystem.readdir({ directory: Directory.Cache, path: '' }).catch(() => ({ files: [] }));
    for (const file of result.files) {
      if (file.name.startsWith('report-') && !this.pendingFiles.has(file.name)) await this.remove(file.name);
    }
  }

  private async remove(path: string): Promise<void> {
    await Filesystem.deleteFile({ directory: Directory.Cache, path }).catch(() => undefined);
    this.pendingFiles.delete(path);
  }

  async download(path: string, suggestedName: string): Promise<void> {
    const actor = this.auth.user()?.id;
    const initialSession = this.auth.sharedSessionId();
    const name = suggestedName.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) || 'reporte';
    if (!Capacitor.isNativePlatform()) {
      let response: HttpResponse<Blob>;
      try {
        response = await firstValueFrom(this.api.getFile(path));
      } catch (error) {
        if (error instanceof HttpErrorResponse) this.auth.handleHttpError(error, path);
        throw error;
      }
      if (actor !== this.auth.user()?.id || initialSession !== this.auth.sharedSessionId()) throw new Error('La sesión cambió durante la descarga.');
      if (!response.body) throw new Error('El archivo está vacío.');
      const url = URL.createObjectURL(response.body);
      const anchor = document.createElement('a');
      anchor.href = url;
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = /filename="?([^";]+)"?/.exec(disposition);
      anchor.download = (match?.[1] ?? name).replace(/[\\/\u0000-\u001f]/g, '_');
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    const base = new URL(this.config.baseUrl, globalThis.location?.origin);
    const url = new URL(base.pathname.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, ''), base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname.replace(/\/+$/, '') + '/')) {
      throw new Error('El destino de descarga no está autorizado.');
    }
    const headers: Record<string, string> = {};
    const token = this.auth.bearerToken();
    const device = this.auth.sharedDeviceToken();
    const session = this.auth.sharedSessionId();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (device) headers['X-Shared-Device-Token'] = device;
    if (session) headers['X-GAM-Session'] = session;
    const temporary = 'report-' + crypto.randomUUID() + '-' + name;
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: temporary });
    let shared = false;
    this.pendingFiles.add(temporary);
    try {
      await FileTransfer.downloadFile({ url: url.toString(), path: uri, headers, disableRedirects: true });
      if (actor !== this.auth.user()?.id || session !== this.auth.sharedSessionId()) {
        throw new Error('La sesión cambió durante la descarga.');
      }
      await Share.share({ title: name, files: [uri], dialogTitle: 'Guardar o compartir reporte' });
      shared = true;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'httpStatus' in error) {
        const status = Number(error.httpStatus);
        let problem: unknown = undefined;
        if ('body' in error && typeof error.body === 'string') {
          try { problem = JSON.parse(error.body); } catch { problem = undefined; }
        }
        this.auth.handleHttpError(new HttpErrorResponse({ status, error: problem }), url.toString());
      }
      throw new Error('No se pudo descargar o compartir el archivo. Intenta nuevamente.');
    } finally {
      if (shared) setTimeout(() => void this.remove(temporary), 3600000);
      else await this.remove(temporary);
    }
  }

  async shareLink(url: string): Promise<void> {
    if (Capacitor.isNativePlatform() || typeof navigator.share === 'function') {
      await Share.share({ title: 'Reporte GAM', url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  }
}

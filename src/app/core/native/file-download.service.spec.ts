import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { Filesystem } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import { Share } from '@capacitor/share';
import { of } from 'rxjs';
import { ApiClient } from '../api/api-client';
import { API_CONFIG } from '../config/api.config';
import { AuthStore } from '../auth/auth.store';
import { FileDownloadService } from './file-download.service';

vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: { getUri: vi.fn(), deleteFile: vi.fn(), readdir: vi.fn() } }));
vi.mock('@capacitor/file-transfer', () => ({ FileTransfer: { downloadFile: vi.fn() } }));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: { write: vi.fn() } }));

describe('Authenticated file downloads', () => {
  const user = signal<{ id: number } | null>({ id: 1 });
  const session = signal({ id: 'employee-session' });
  const auth = { user, session, bearerToken: () => 'personal-token', sharedDeviceToken: () => 'device-secret', sharedSessionId: () => session().id, handleHttpError: vi.fn() };
  const api = { getFile: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); user.set({ id: 1 }); vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.mocked(Filesystem.getUri).mockResolvedValue({ uri: 'file:///private/cache/report.xlsx' });
    vi.mocked(Filesystem.deleteFile).mockResolvedValue(undefined);
    vi.mocked(Filesystem.readdir).mockResolvedValue({ files: [] });
    vi.mocked(FileTransfer.downloadFile).mockResolvedValue({ path: 'file:///private/cache/report.xlsx' });
    vi.mocked(Share.share).mockResolvedValue({ activityType: 'save' });
    TestBed.configureTestingModule({ providers: [{ provide: AuthStore, useValue: auth }, { provide: ApiClient, useValue: api }, { provide: API_CONFIG, useValue: { baseUrl: 'https://gam.test/api/v1' } }] });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  it('uses secret headers only for the configured API and forbids redirects', async () => {
    vi.useFakeTimers(); const files = TestBed.inject(FileDownloadService); TestBed.tick();
    await files.download('exportaciones-reportes/7/descarga', 'postura.xlsx');
    expect(FileTransfer.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://gam.test/api/v1/exportaciones-reportes/7/descarga', disableRedirects: true, headers: { Authorization: 'Bearer personal-token', 'X-Shared-Device-Token': 'device-secret', 'X-GAM-Session': 'employee-session' } }));
    expect(Filesystem.deleteFile).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(3600000); expect(Filesystem.deleteFile).toHaveBeenCalled();
  });
  it('rejects paths that escape the authorized API', async () => {
    const files = TestBed.inject(FileDownloadService); TestBed.tick();
    await expect(files.download('../../private', 'file.xlsx')).rejects.toThrow('autorizado'); expect(FileTransfer.downloadFile).not.toHaveBeenCalled();
  });
  it('preserves the shared-device error code when a native download is denied', async () => {
    const files = TestBed.inject(FileDownloadService); TestBed.tick();
    vi.mocked(FileTransfer.downloadFile).mockRejectedValueOnce({ httpStatus: 401, body: JSON.stringify({ code: 'SHARED_DEVICE_UNAUTHORIZED' }) });
    await expect(files.download('exportaciones-reportes/7/descarga', 'postura.xlsx')).rejects.toThrow('descargar');
    expect(auth.handleHttpError).toHaveBeenCalledWith(expect.objectContaining({ status: 401, error: { code: 'SHARED_DEVICE_UNAUTHORIZED' } }), 'https://gam.test/api/v1/exportaciones-reportes/7/descarga');
  });
  it('refuses to share a completed download after identity changes', async () => {
    const files = TestBed.inject(FileDownloadService); TestBed.tick();
    vi.mocked(FileTransfer.downloadFile).mockImplementationOnce(async () => { user.set({ id: 2 }); return {}; });
    await expect(files.download('exportaciones-reportes/7/descarga', 'postura.xlsx')).rejects.toThrow('descargar'); expect(Share.share).not.toHaveBeenCalled(); expect(Filesystem.deleteFile).toHaveBeenCalled();
  });
  it('downloads web binary data with the server filename and releases object URLs', async () => {
    vi.useFakeTimers(); vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const create = vi.fn(() => 'blob:report'); const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    api.getFile.mockReturnValue(of(new HttpResponse({ body: new Blob(['content']), headers: new HttpHeaders({ 'Content-Disposition': 'attachment; filename="postura-final.xlsx"' }) })));
    const files = TestBed.inject(FileDownloadService); TestBed.tick(); await files.download('exportaciones-reportes/7/descarga', 'fallback.xlsx');
    expect(click).toHaveBeenCalled(); expect(create).toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1000); expect(revoke).toHaveBeenCalledWith('blob:report'); expect(FileTransfer.downloadFile).not.toHaveBeenCalled();
  });
  it('copies native links to the clipboard without opening the share sheet', async () => {
    vi.mocked(Clipboard.write).mockResolvedValue(undefined);
    const files = TestBed.inject(FileDownloadService); await files.copyLink('https://gam.test/report');
    expect(Clipboard.write).toHaveBeenCalledWith({ string: 'https://gam.test/report', label: 'Enlace del reporte' }); expect(Share.share).not.toHaveBeenCalled();
  });
  it('copies web links even when sharing is available', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const writeText = vi.fn().mockResolvedValue(undefined); const share = vi.fn();
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard'); const shareDescriptor = Object.getOwnPropertyDescriptor(navigator, 'share');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } }); Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    try { await TestBed.inject(FileDownloadService).copyLink('https://gam.test/report'); expect(writeText).toHaveBeenCalledWith('https://gam.test/report'); expect(Share.share).not.toHaveBeenCalled(); expect(share).not.toHaveBeenCalled(); }
    finally { if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor); else Reflect.deleteProperty(navigator, 'clipboard'); if (shareDescriptor) Object.defineProperty(navigator, 'share', shareDescriptor); else Reflect.deleteProperty(navigator, 'share'); }
  });
  it('shares native links without copying and does not copy when web sharing is unsupported', async () => {
    const files = TestBed.inject(FileDownloadService); expect(await files.shareLink('https://gam.test/report')).toBe(true);
    expect(Share.share).toHaveBeenCalledWith({ title: 'Reporte GAM', url: 'https://gam.test/report' }); expect(Clipboard.write).not.toHaveBeenCalled();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    expect(files.canShareLink()).toBe(false); await expect(files.shareLink('https://gam.test/report')).rejects.toThrow('Puedes copiar'); expect(Clipboard.write).not.toHaveBeenCalled();
  });
});

import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';

import { DailyWeighingDetail, DailyWeighingEntry } from '../../interfaces/flock-weighing.interface';
import { FlockWeighingsService } from '../../services/flock-weighings.service';

type State = 'loading' | 'ready' | 'not-found' | 'forbidden' | 'offline' | 'error';

const formatGrams = (value: string | null): string => {
  if (value === null) return 'Sin registros';
  return new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 }).format(Number(value));
};

@Component({
  selector: 'app-flock-weighing-record-page',
  templateUrl: './flock-weighing-record.page.html',
  styleUrl: './flock-weighing-record.page.scss',
  imports: [RouterLink, IonIcon, IonSpinner],
})
export class FlockWeighingRecordPage {
  readonly formatGrams = formatGrams;
  private readonly route = inject(ActivatedRoute);
  private readonly weighings = inject(FlockWeighingsService);
  private readonly destroyRef = inject(DestroyRef);
  private loadVersion = 0;

  readonly state = signal<State>('loading');
  readonly record = signal<DailyWeighingDetail | null>(null);
  readonly entries = signal<DailyWeighingEntry[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loadingMore = signal(false);
  readonly loadMoreError = signal(false);
  readonly flockId = signal('');
  readonly weighingId = signal('');
  readonly backLink = computed(() => `/administracion/lotes/lotes/${encodeURIComponent(this.flockId())}/pesajes`);
  readonly date = computed(() => {
    const value = this.record()?.date;
    if (!value) return '';
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? 'Fecha no disponible'
      : new Intl.DateTimeFormat('es-UY', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  });
  readonly average = computed(() => formatGrams(this.record()?.average_weight_g ?? null));
  readonly rows = computed(() => this.entries().map((entry) => ({
    id: entry.id,
    time: new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Montevideo' })
      .format(new Date(entry.occurred_at)),
    mode: entry.mode === 'individual' ? 'Individual' : 'Grupal',
    birds: entry.bird_count,
    weight: formatGrams(entry.mode === 'individual' ? entry.weight_g : entry.total_weight_g),
    average: formatGrams(entry.average_weight_g),
    anomalous: entry.outside_expected_range,
  })));

  constructor() {
    addIcons({ arrowBackOutline });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.flockId.set(params.get('id') ?? '');
      this.weighingId.set(params.get('weighingId') ?? '');
      this.load();
    });
  }

  load(): void {
    const version = ++this.loadVersion;
    this.state.set('loading');
    this.record.set(null);
    this.entries.set([]);
    this.nextCursor.set(null);
    this.loadMoreError.set(false);
    if (!this.flockId() || !this.weighingId()) { this.state.set('not-found'); return; }
    this.loadPage(null, version);
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.loadMoreError.set(false);
    this.loadPage(cursor, this.loadVersion);
  }

  private loadPage(cursor: string | null, version: number): void {
    this.weighings.getDaily(this.weighingId(), cursor, 50).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (record) => {
        if (version !== this.loadVersion) return;
        if (record.flock_id !== this.flockId()) { this.state.set('not-found'); return; }
        this.record.set(record);
        this.entries.set(cursor ? [...this.entries(), ...record.entries] : record.entries);
        this.nextCursor.set(record.next_cursor);
        this.loadingMore.set(false);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        if (version !== this.loadVersion) return;
        this.loadingMore.set(false);
        if (cursor) { this.nextCursor.set(cursor); this.loadMoreError.set(true); return; }
        if (error instanceof HttpErrorResponse) {
          if (error.status === 404) { this.state.set('not-found'); return; }
          if (error.status === 401 || error.status === 403) { this.state.set('forbidden'); return; }
          if (error.status === 0) { this.state.set('offline'); return; }
        }
        this.state.set('error');
      },
    });
  }
}

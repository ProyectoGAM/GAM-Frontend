import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, Injector, linkedSignal, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, globeOutline, searchOutline } from 'ionicons/icons';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { BreedEditorDialogComponent } from '../../components/breed-editor-dialog/breed-editor-dialog.component';
import { BreedCatalogPage, BreedDraft } from '../../interfaces/breed-catalog';
import { BreedWeighingSettings } from '../../interfaces/flock-weighing.interface';
import { breedChanges, breedError, breedRange, breedReferences } from '../../services/breed-catalog-presentation';
import { BreedCatalogService } from '../../services/breed-catalog.service';
import { FlockWeighingsService } from '../../services/flock-weighings.service';

interface CatalogState {
  result: BreedCatalogPage | null;
  error: string;
  forbidden: boolean;
}

const loading: CatalogState = { result: null, error: '', forbidden: false };

@Component({
  selector: 'app-breeds-page',
  imports: [BreedEditorDialogComponent, IonIcon],
  templateUrl: './breeds.page.html',
  styleUrl: './breeds.page.scss',
})
export class BreedsPage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(BreedCatalogService);
  private readonly weighings = inject(FlockWeighingsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly editor = viewChild(BreedEditorDialogComponent);
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  private readonly actor = computed(() => this.auth.user()?.id ?? null);
  private readonly permissions = computed(() => this.auth.user()?.permissions ?? []);
  private readonly canRead = computed(() => this.auth.isAdmin() || this.permissions().includes('can_view_breeds'));
  protected readonly canManage = computed(() =>
    this.canRead() && (this.auth.isAdmin() || this.permissions().includes('can_manage_breeds')));

  protected readonly searchInput = signal('');
  protected readonly status = signal<BreedWeighingSettings['status'] | ''>('');
  private readonly search = toSignal(toObservable(this.searchInput).pipe(
    debounceTime(250), map((value) => value.trim().slice(0, 120)), distinctUntilChanged(),
  ), { initialValue: '' });
  private readonly filters = computed(() => ({ search: this.search(), status: this.status() }));
  protected readonly page = linkedSignal({ source: this.filters, computation: () => 1 });
  private readonly retry = signal(0);
  private readonly query = computed(() => ({
    actor: this.canRead() ? this.actor() : null, ...this.filters(), page: this.page(), retry: this.retry(),
  }));
  protected readonly state = toSignal(toObservable(this.query).pipe(
    switchMap(({ actor, search, status, page }) => actor === null
      ? of({ ...loading, forbidden: true })
      : this.api.list({ search, status, page }).pipe(
        map((result): CatalogState => ({ ...loading, result })),
        startWith(loading),
        catchError((error: unknown) => of({
          ...loading,
          forbidden: error instanceof HttpErrorResponse && error.status === 403,
          error: breedError(error, 'No se pudo cargar el catálogo de razas.'),
        })),
      )),
  ), { initialValue: loading });
  protected readonly hasFilters = computed(() => !!this.search() || !!this.status());
  protected readonly rows = computed(() => (this.state().result?.data ?? []).map((breed) => ({
    breed, chick: breedRange(breed, 'chick'), adult: breedRange(breed, 'adult'),
  })));

  private readonly settingsActor = computed(() =>
    this.auth.isAdmin() || this.permissions().includes('can_manage_weighing_settings') ? this.actor() : null);
  private readonly globalSettings = toSignal(toObservable(this.settingsActor).pipe(
    switchMap((actor) => actor === null ? of(null) : this.weighings.settings().pipe(startWith(null), catchError(() => of(null)))),
  ), { initialValue: null });
  protected readonly references = computed(() => breedReferences(this.globalSettings(), this.state().result?.data ?? []));
  protected readonly saving = signal(false);
  protected readonly retryOnly = signal(false);
  protected readonly conflict = signal(false);
  protected readonly saveError = signal('');
  protected readonly success = signal('');
  private attempt: { signature: string; key: string } | null = null;

  constructor() {
    addIcons({ addOutline, globeOutline, searchOutline });
    effect(() => {
      const meta = this.state().result?.meta;
      if (meta && meta.current_page > meta.last_page) this.page.set(meta.last_page);
    });
    effect(() => {
      this.actor();
      this.canManage();
      this.editor()?.close();
    });
  }

  protected selectStatus(value: string): void {
    this.status.set(value === 'active' || value === 'inactive' ? value : '');
  }

  protected reload(): void {
    this.retry.update((value) => value + 1);
  }

  protected openEditor(breed: BreedWeighingSettings | null): void {
    if (!this.canManage() || this.saving()) return;
    this.saveError.set('');
    this.success.set('');
    this.conflict.set(false);
    this.retryOnly.set(false);
    this.attempt = null;
    this.editor()?.open(breed);
  }

  protected save({ breed, values }: BreedDraft): void {
    if (!this.canManage() || this.saving() || this.conflict()) return;
    const actor = this.actor();
    const changes = breed ? breedChanges(breed, values) : null;
    if (changes && Object.keys(changes).length === 1) {
      this.editor()?.close();
      return;
    }
    const signature = JSON.stringify([breed?.id, changes ?? values]);
    if (this.retryOnly() && this.attempt?.signature !== signature) return;
    const key = this.attempt?.signature === signature ? this.attempt.key : globalThis.crypto.randomUUID();
    this.attempt = { signature, key };
    this.saving.set(true);
    this.saveError.set('');

    const request = breed && changes ? this.api.update(breed.id, changes, key) : this.api.create(values, key);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        if (actor !== this.actor()) return;
        this.retryOnly.set(false);
        this.editor()?.close();
        this.success.set(breed ? 'Raza actualizada.' : 'Raza creada.');
        this.reload();
        afterNextRender({ write: () => this.heading().nativeElement.focus({ preventScroll: true }) }, { injector: this.injector });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (actor !== this.actor()) return;
        const message = breedError(error, 'No se pudo guardar la raza. Volvé a intentar.');
        const uncertain = error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
        this.retryOnly.set(uncertain);
        if (breed && error instanceof HttpErrorResponse && error.status === 409 && /versi[oó]n/i.test(message)) {
          this.conflict.set(true);
          this.saveError.set('La raza cambió. Cerrá el formulario y volvé a abrirlo para ver la versión actual.');
          this.reload();
        } else {
          this.saveError.set(uncertain ? 'No se pudo confirmar el guardado. Reintentá con los mismos datos.' : message);
        }
      },
    });
  }
}

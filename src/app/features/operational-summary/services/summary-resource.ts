import { HttpErrorResponse } from '@angular/common/http';
import { computed, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, Observable, of, startWith, switchMap } from 'rxjs';

type SummaryState<T> =
  | { status: 'loading' | 'error' | 'forbidden' | 'hidden'; data?: never }
  | { status: 'ready'; data: T };

export function summaryResource<Query, Data>(
  query: () => Query | null,
  request: (value: Query) => Observable<Data>,
) {
  const revision = signal(0);
  const selection = computed(() => ({ query: query(), revision: revision() }));
  const result = toSignal(toObservable(selection).pipe(
    switchMap((current) => {
      const response: Observable<SummaryState<Data>> = current.query === null
        ? of({ status: 'hidden' })
        : request(current.query).pipe(
          map((data): SummaryState<Data> => ({ status: 'ready', data })),
          startWith({ status: 'loading' } as const),
          catchError((error: unknown) => of({
            status: error instanceof HttpErrorResponse && error.status === 403 ? 'forbidden' as const : 'error' as const,
          })),
        );
      return response.pipe(map((state) => ({ current, state })));
    }),
  ));
  return {
    state: computed<SummaryState<Data>>(() => {
      const current = selection();
      if (current.query === null) return { status: 'hidden' };
      const loaded = result();
      return loaded?.current === current ? loaded.state : { status: 'loading' };
    }),
    reload: () => revision.update((value) => value + 1),
  };
}

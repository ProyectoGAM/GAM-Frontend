import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { EggPresentation, EggPresentationInput, EggPresentationList } from '../interfaces/egg-presentations';

@Injectable({ providedIn: 'root' })
export class EggPresentationsApi {
  private readonly api = inject(ApiClient);

  list(): Observable<EggPresentationList> {
    return this.api.get<EggPresentationList>('inventario/presentaciones-huevos');
  }

  create(body: EggPresentationInput): Observable<{ data: EggPresentation }> {
    return this.api.post<{ data: EggPresentation }, EggPresentationInput>('inventario/presentaciones-huevos', body);
  }

  update(id: string, body: EggPresentationInput): Observable<{ data: EggPresentation }> {
    return this.api.patch<{ data: EggPresentation }, EggPresentationInput>(`inventario/presentaciones-huevos/${encodeURIComponent(id)}`, body);
  }
}

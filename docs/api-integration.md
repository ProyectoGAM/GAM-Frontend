# API Integration

## 1. Contract-first

Laravel API contracts are authoritative.

The frontend must not guess undocumented fields, states or error semantics.

## 2. Standard dependency flow

```text
Page / Component
      ↓
Feature Service
      ↓
ApiClient
      ↓
HttpClient
      ↓
Laravel API
```

Pages normally inject feature services, not `ApiClient` directly.

Feature services inject `ApiClient`.

## 3. ApiClient

Canonical location:

```text
src/app/core/api/api-client.ts
```

Purpose:

Provide one generic HTTP abstraction over Angular `HttpClient`.

Responsibilities:

- API base URL
- GET
- POST
- PUT
- PATCH
- DELETE
- headers
- query parameters
- HttpContext
- withCredentials
- URL normalization

It must remain feature-agnostic.

## 4. API options

Recommended generic type:

```ts
export type ApiOptions = {
  params?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  context?: HttpContext;
  withCredentials?: boolean;
  baseUrl?: string;
};
```

This keeps feature services independent from manually building `HttpParams`.

## 5. API_CONFIG

Use a configuration InjectionToken.

Recommended location:

```text
src/app/core/config/api.config.ts
```

Concept:

```ts
export interface ApiConfig {
  baseUrl: string;
}

export const API_CONFIG =
  new InjectionToken<ApiConfig>('API_CONFIG');
```

## 6. Environment boundary

The preferred configuration chain is:

```text
environment
    ↓
app.config.ts
    ↓
API_CONFIG
    ↓
ApiClient
```

Feature pages/services should not import:

```text
environment
environment.apiUrl
```

This keeps environment concerns at the composition root.

## 7. Feature service example

```ts
@Injectable({ providedIn: 'root' })
export class ProductionService {
  private readonly api = inject(ApiClient);

  getAll(): Observable<ProductionResponse> {
    return this.api.get<ProductionResponse>('productions');
  }

  getById(id: number): Observable<Production> {
    return this.api.get<Production>(`productions/${id}`);
  }
}
```

Feature services use relative API paths.

## 8. Authentication

ApiClient must remain generic.

Do not:

- store tokens in ApiClient
- add auth business rules to ApiClient
- determine permissions inside ApiClient

Authorization headers belong in an interceptor or auth infrastructure.

## 9. DTOs

DTOs live inside the owning feature's `interfaces/`.

Examples:

```text
interfaces/
  production.ts
  production-request.ts
  production-response.ts
```

Do not create a separate global DTO hierarchy by default.

## 10. Types

Finite aliases and unions belong in the feature's `types/`.

Example:

```text
types/
  production-status.type.ts
  production-filter.type.ts
```

## 11. URLs

Never do this in a page or feature service:

```ts
`${environment.apiUrl}/productions`
```

Instead:

```ts
this.api.get('productions');
```

## 12. Errors

Use interceptors/global mapping for generic transport concerns when useful.

Keep feature-specific error behavior inside the feature service/page.

Preserve backend validation information when needed for forms.

## 13. Pagination

Pagination response shapes are explicitly typed in the feature.

Do not infer pagination only from array size.

## 14. Dates

Use ISO-8601 values from the API.

Avoid locale-dependent parsing.

## 15. Units and money

Contracts must be explicit when unit/currency ambiguity is possible.

Do not derive domain units from visual labels.

# GAM Frontend Architecture

## 1. Purpose

GAM Frontend is the client application for the GAM poultry-management system.

It is a mobile-first application with one shared codebase for:

- Web
- Android
- iOS

The architecture favors simplicity, clear ownership and low coupling.

It intentionally avoids ceremonial Clean Architecture layers unless real complexity requires them.

## 2. Technology baseline

```text
Angular                 22.1.x
Ionic Angular            9.x
Capacitor                8.5.x
TypeScript               6.x
RxJS                     7.8.x
Vitest                   4.x
ESLint                   9.x
Styling                  SCSS
Angular architecture     Standalone
Change detection         Zoneless
Primary state model      Signals
```

Generated Angular builders:

```text
@angular/build:application
@angular/build:dev-server
@angular/build:unit-test
```

Output directory:

```text
www/
```

Native identity:

```text
appId:   dev.huevossanjose.gam
appName: GAM
```

## 3. Top-level structure

```text
src/
  app/
    core/
    shared/
    features/
    app.component.*
    app.routes.ts
  environments/
  theme/
  assets/
```

Responsibilities:

- `core/`: global infrastructure
- `shared/`: business-agnostic reusable UI/helpers
- `features/`: business capabilities

## 4. Feature-oriented architecture

Business code is grouped by feature.

Example:

```text
features/
  auth/
  dashboard/
  production/
  inventory/
  facilities/
  reports/
```

Each feature owns its screens, components, API access and types.

## 5. Canonical feature structure

Default:

```text
features/<feature>/
  pages/
  components/
  services/
  interfaces/
  types/
  <feature>.routes.ts
```

Example:

```text
features/production/
  pages/
    production-list/
    production-detail/
  components/
    production-card/
  services/
    production.service.ts
  interfaces/
    production.ts
    production-response.ts
  types/
    production-status.type.ts
    production-filter.type.ts
  production.routes.ts
```

Not every feature needs every folder.

Do not create empty folders.

## 6. Simplicity rule

Do not introduce these by default:

```text
domain/
application/
data-access/
repositories/
use-cases/
ports/
adapters/
```

These patterns may be introduced later only when a concrete feature becomes complex enough that the simple structure is no longer clear.

The default architecture is pragmatic, not ceremonial.

## 7. Pages

`pages/` contains route-level screens.

Pages may:

- inject feature services
- coordinate UI state
- manage page-local signals
- navigate
- open Ionic modals/sheets
- react to route params

Pages must not:

- inject `HttpClient`
- import environment configuration
- manually build API base URLs
- directly use Capacitor plugins
- contain large business rules

## 8. Components

`components/` contains reusable visual pieces owned by the feature.

Examples:

```text
production-card/
production-summary/
production-filter-sheet/
```

Feature components stay inside their feature.

Move a component to `shared/` only if it is:

1. reused by multiple features
2. business-agnostic

## 9. Services

`services/` contains feature-level API access, state and orchestration.

Example:

```text
features/production/services/production.service.ts
```

Typical flow:

```text
ProductionPage
 -> ProductionService
 -> ApiClient
 -> HttpClient
 -> Laravel API
```

A feature service may:

- call relative API endpoints
- expose Observables/signals
- coordinate feature state
- centralize feature operations

It must not import `environment.apiUrl`.

## 10. Interfaces and types

### `interfaces/`

Use for object-shaped contracts.

Examples:

```ts
export interface Production {
  id: number;
  date: string;
  quantity: number;
  status: ProductionStatus;
}
```

Use for:

- entities
- DTOs
- request/response shapes
- object contracts

### `types/`

Use for aliases and finite types.

Example:

```ts
export type ProductionStatus =
  | 'pending'
  | 'completed'
  | 'cancelled';
```

Use for:

- union types
- aliases
- statuses
- filters
- compact utility types

Do not create extra `models/`, `contracts/` and `dtos/` folders unless volume genuinely justifies it.

## 11. `core/`

Recommended structure:

```text
core/
  api/
  auth/
  config/
  guards/
  interceptors/
  native/
```

Typical responsibilities:

- `api/`: ApiClient and generic HTTP types
- `auth/`: session/auth infrastructure
- `config/`: injection tokens and app config
- `guards/`: route guards
- `interceptors/`: HTTP interceptors
- `native/`: Capacitor wrappers

`core/` contains app-wide infrastructure, not business modules.

## 12. `shared/`

Recommended structure:

```text
shared/
  components/
  directives/
  pipes/
  utils/
```

Only business-agnostic reusable code belongs here.

`shared/` must never import from `features/`.

## 13. ApiClient architecture

The project uses one centralized HTTP client abstraction.

Dependency chain:

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

Configuration chain:

```text
environment
    ↓
API_CONFIG
    ↓
ApiClient
```

Only application configuration should translate environment values into `API_CONFIG`.

Feature code consumes relative paths.

## 14. ApiClient responsibilities

Location:

```text
core/api/api-client.ts
```

It provides generic methods:

```text
get
post
put
patch
delete
```

And generic request handling:

```text
base URL
headers
params
HttpContext
withCredentials
URL normalization
```

It must remain generic.

Forbidden inside `ApiClient`:

- feature endpoint knowledge
- auth business rules
- token persistence
- authorization decisions
- feature DTO mapping

## 15. API configuration

Recommended configuration:

```text
core/config/api.config.ts
```

`API_CONFIG` is an Angular InjectionToken containing generic API configuration, especially:

```text
baseUrl
```

`app.config.ts` is the preferred composition root for binding environment values into `API_CONFIG`.

This prevents `environment` imports from spreading through features.

## 16. Authentication

Authentication transport concerns remain separate from ApiClient.

Preferred:

```text
ApiClient
 -> generic HTTP

Auth interceptor
 -> Authorization header / auth transport
```

ApiClient must not know how tokens are stored.

## 17. Standalone Angular

The project is standalone.

Do not introduce NgModules.

Use lazy feature routes.

## 18. Zoneless Angular

The project intentionally remains zoneless.

Do not:

```text
install zone.js
add provideZoneChangeDetection()
```

Use signals and Angular-aware APIs for reactive updates.

## 19. Signals-first state

Default:

```text
local UI state       -> signals
feature state        -> feature service + signals
derived state        -> computed()
stream composition   -> RxJS
```

Do not add a global state library unless actual complexity justifies it.

## 20. Native capabilities

Capacitor access is centralized under:

```text
core/native/
```

Example:

```text
Page
 -> CameraService
 -> Capacitor Camera
```

Do not import Capacitor directly in pages/components.

Keep native wrappers simple.

Do not add ports/adapters/use-cases solely for architectural purity.

## 21. Mobile-first UX

Design order:

1. narrow phone
2. larger phone
3. tablet
4. desktop

Primary pages must account for:

- touch
- safe areas
- software keyboard
- narrow viewport
- unstable connectivity
- portrait-first use

## 22. Scrolling

Normal Ionic pages use:

```text
ion-header
ion-content
ion-footer
```

`ion-content` owns primary page scrolling.

Avoid nested scroll regions unless explicitly required.

## 23. Routing

Rules:

- lazy-load business features
- keep feature routes inside the feature
- guards enforce navigation/auth policy
- avoid eager loading the whole application

## 24. Error states

API-backed screens should distinguish:

- loading
- success
- empty
- validation failure
- forbidden/unauthenticated
- offline/unreachable
- unexpected error

Do not expose raw exceptions to users.

## 25. Architecture changes

Create an ADR when introducing:

- a global state library
- a major framework
- a new native architecture
- offline synchronization
- a major auth/session redesign
- a major API-client strategy change
- architectural layers beyond the default simple feature model

## 26. Guiding principle

Start simple.

Prefer:

```text
pages
components
services
interfaces
types
```

Add complexity only after the current structure demonstrates a real limitation.

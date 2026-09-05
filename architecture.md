# GAM Frontend Architecture

## 1. Objective

GAM Frontend is a mobile-first application for web, Android and iOS built from one Angular codebase.

The architecture must support:

- business growth by feature
- native device capabilities without coupling UI to Capacitor
- strict API contracts
- testability
- progressive offline/resilient behavior
- maintainable AI-assisted development
- browser, Android and iOS delivery

## 2. Technology baseline

- Angular 22
- Ionic 9
- Capacitor 8
- TypeScript strict
- Standalone APIs
- Zoneless change detection
- SCSS
- Vitest
- Angular Router
- Angular HttpClient

Dependencies are added only when a concrete requirement justifies them.

## 3. Architectural style

Use a feature-oriented architecture with lightweight internal layering.

Top-level structure:

```text
src/
  app/
    core/
    shared/
    features/
    app.config.ts
    app.routes.ts
    app.ts
  environments/
  theme/
```

### `core/`

Application-wide infrastructure and policies with a single conceptual instance.

Examples:

- authentication session infrastructure
- HTTP interceptors
- global error handling
- environment/config access
- route-level authorization
- platform detection
- native adapter registration

`core/` is not a dumping ground for reusable code.

### `shared/`

Business-agnostic reusable primitives.

Examples:

- generic UI components
- directives
- pipes
- formatting helpers
- design-system primitives

`shared/` must never import a feature.

### `features/`

Business capabilities.

Examples:

```text
features/
  auth/
  dashboard/
  flocks/
  production/
  inventory/
  health/
  reports/
```

Exact feature names are driven by the GAM domain, not by technical types.

## 4. Feature structure

A feature starts small.

Minimal feature:

```text
features/example/
  example.routes.ts
  pages/
```

As complexity grows, introduce only the layers that are actually needed:

```text
features/example/
  domain/
  application/
  data-access/
  ui/
  example.routes.ts
```

### Domain

Pure TypeScript concepts and rules.

Contains:

- entities/value-like types
- business invariants
- domain-specific calculations
- contracts that belong to the feature

Must not import Angular, Ionic, Capacitor or HTTP types.

### Application

Coordinates use cases and state.

Contains:

- facades/application services
- feature state
- use-case orchestration
- ports required by the use case

Prefer signals for state.

### Data access

External data translation.

Contains:

- typed HTTP clients/repositories
- request/response DTOs
- mappers
- persistence adapters

Pages must not call HttpClient directly.

### UI

Ionic/Angular presentation.

Contains:

- pages
- feature-specific components
- forms
- view models when useful

UI should not contain business rules that belong in domain/application layers.

## 5. Dependency rules

Primary dependency direction:

```text
UI -> Application -> Domain
Data Access -> Domain
Infrastructure -> Application/Domain contracts
```

Forbidden:

```text
Domain -> Angular
Domain -> Ionic
Domain -> Capacitor
Domain -> HTTP DTO
Shared -> Feature
```

Feature internals are private by default.

If feature A needs functionality owned by feature B, expose a deliberate public contract instead of importing arbitrary internal files.

## 6. State management

Default:

- component-local state: signals
- feature state: signal-based application service/facade
- derived state: `computed()`
- asynchronous streams: RxJS where it naturally fits

Do not add a global state library by default.

A state library requires an ADR with a demonstrated problem that signals plus feature services cannot solve cleanly.

## 7. API integration

The backend contract is authoritative.

Rules:

- all endpoints are typed
- API URLs come from environment/configuration
- pages never concatenate endpoint URLs
- map transport DTOs when domain semantics differ
- normalize API errors centrally where possible
- authorization is handled by infrastructure, not repeated in features

## 8. Authentication

Authentication is an application-wide concern.

Recommended flow:

```text
Login Page
  -> Auth Application Service
  -> Auth Repository
  -> API
  -> Session Store
  -> Router
```

Token persistence must be abstracted so browser and native secure-storage strategies can evolve independently.

Never expose raw credential/token management to page components.

## 9. Native capabilities

Capacitor is an infrastructure implementation detail.

Example:

```text
Production Page
  -> PhotoCaptureService
  -> CameraPort
  -> CapacitorCameraAdapter
```

This allows:

- browser fallback
- unit testing
- future plugin replacement
- permission logic outside UI

## 10. Routing

- Lazy-load features.
- Keep route definitions close to their feature.
- Use guards for authentication/authorization navigation policy.
- Do not load the complete app eagerly.
- Do not encode business workflows only in URL guards.

## 11. Error handling

Separate:

- validation errors
- business rule errors
- expected API errors
- connectivity errors
- unexpected application errors

User-facing messages must be actionable and understandable.

Technical details belong in logs, not toasts.

## 12. Mobile-first design

Every page is designed for a phone viewport first.

Then enhance for:

1. phone
2. large phone / small tablet
3. tablet
4. desktop

Desktop is not a stretched mobile layout.

Use responsive composition while keeping one business flow.

## 13. Native project folders

`android/` and `ios/` are generated native projects, but they are part of the application delivery surface.

Rules:

- minimize manual native edits
- document any required native edit
- prefer Capacitor configuration/plugins over ad-hoc native patches
- run `cap sync` after relevant web/plugin changes

## 14. Architecture evolution

Architecture changes require an ADR when they:

- introduce a new state management strategy
- add a major dependency/framework
- change feature boundaries
- change API integration strategy
- change authentication/session strategy
- introduce offline synchronization
- alter native platform strategy

Small implementation details do not require ADRs.

## 15. Guiding principle

Prefer explicit, local, testable code over clever abstractions.

The architecture exists to control coupling and support product evolution, not to maximize the number of layers.

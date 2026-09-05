# GAM Frontend - Agent Instructions

This repository is the mobile-first frontend for GAM.

AI coding agents MUST read this file before changing code.

## 1. Mandatory context

Before implementing a feature, read:

1. `docs/architecture.md`
2. `docs/coding-standards.md`
3. `docs/mobile-native-guidelines.md`
4. `docs/api-integration.md`
5. `docs/testing.md`
6. `docs/development-workflow.md`
7. Relevant ADRs in `docs/adr/`

Architectural rules are constraints, not suggestions.

## 2. Current baseline

- Angular 22.1.x
- Ionic Angular 9.x
- Capacitor 8.5.x
- TypeScript 6.x
- RxJS 7.8.x
- Vitest 4.x
- ESLint 9
- SCSS
- Standalone Angular APIs
- Zoneless Angular
- Signals-first state
- Mobile-first
- Web + Android + iOS

Native application identity:

- appId: `dev.huevossanjose.gam`
- appName: `GAM`
- webDir: `www`

## 3. Architecture

Top-level application folders:

```text
src/app/
  core/
  shared/
  features/
```

Business code is organized by feature.

Canonical feature structure:

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
  production.routes.ts
```

Do NOT create these layers by default:

```text
domain/
application/
data-access/
repositories/
use-cases/
ports/
adapters/
```

Only introduce an additional architectural layer if a concrete feature has enough complexity to justify it.

## 4. Folder responsibilities

### `pages/`

Route-level screens and page orchestration.

Pages may:

- inject feature services
- manage page-specific signals
- handle navigation and presentation state
- coordinate Ionic UI

Pages must not:

- inject `HttpClient`
- import `environment`
- construct API base URLs
- directly call Capacitor plugins
- contain heavy business logic

### `components/`

Reusable visual pieces owned by the feature.

Components should remain presentation-focused.

Feature-specific components stay inside the feature.

Only business-agnostic reusable components belong in `shared/components`.

### `services/`

Feature API access, application state and feature-level orchestration.

Typical dependency:

```text
Page/Component
 -> Feature Service
 -> ApiClient
 -> HttpClient
```

Feature services use relative API paths and must not import `environment`.

### `interfaces/`

Object-shaped contracts.

Use for:

- frontend entities
- request DTOs
- response DTOs
- API response shapes
- form/data structures where interface semantics are appropriate

### `types/`

Type aliases and compact type definitions.

Use for:

- unions
- statuses
- filters
- aliases
- finite string states
- utility types owned by the feature

## 5. Core HTTP rule

The project uses a centralized `ApiClient`.

Preferred dependency chain:

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

Only the composition/configuration layer may import the Angular environment to configure the API base URL.

Feature pages/services must never import `environment.apiUrl`.

## 6. ApiClient responsibilities

`ApiClient` is generic HTTP infrastructure.

It may handle:

- base URL
- GET
- POST
- PUT
- PATCH
- DELETE
- headers
- query params
- `HttpContext`
- `withCredentials`
- URL normalization

It must NOT:

- contain feature-specific endpoints
- know feature DTO semantics
- implement authorization business logic
- store tokens
- decide user permissions
- become a global business service

Authentication headers belong in an interceptor or dedicated auth infrastructure.

## 7. Angular rules

- Standalone components/directives/pipes only.
- Do not introduce NgModules.
- Signals are the default for UI and feature state.
- Use `computed()` for derived state.
- Use RxJS where the problem is naturally stream-based.
- Avoid manual subscriptions when Angular lifecycle interop can manage them.
- Do not introduce Zone.js.
- Do not add `provideZoneChangeDetection()`.
- Lazy-load business feature routes.
- Keep templates declarative.
- Do not put business rules in templates.
- Avoid expensive method calls from templates.
- Do not use `any` except at isolated third-party boundaries with justification.

## 8. Ionic rules

- Design phone-first.
- Prefer Ionic primitives for mobile interaction.
- `ion-content` owns normal page scrolling.
- Respect safe areas and the software keyboard.
- Avoid fixed heights for page layouts.
- Do not build desktop first and shrink it.
- Tablet/desktop layouts may enhance composition without duplicating business flows.

## 9. Native rules

Pages and presentational components MUST NOT import Capacitor plugins directly.

Bad:

```text
page -> Camera.getPhoto()
```

Preferred:

```text
page -> core/native/camera.service -> Capacitor Camera
```

Do not create ports/adapters/use-cases for trivial native access unless complexity actually requires them.

Native wrappers belong under `core/native/`.

## 10. State management

Default hierarchy:

1. local component state -> signals
2. feature state -> feature service + signals
3. derived state -> `computed()`
4. async/stream composition -> RxJS

Do not add NgRx or another global state library without an ADR proving it is necessary.

## 11. Shared and core

`shared/` contains business-agnostic reusable primitives only.

`core/` contains application-wide infrastructure/policy only.

Neither folder is a dumping ground.

Before moving something to `shared/`, verify it is both reused and domain-independent.

## 12. Testing

Required before completing a task:

```bash
npm run lint
npm run test:ci
npm run build
```

When Capacitor plugins/configuration/native integration changes:

```bash
npx cap sync
```

Tests should focus on behavior and business rules, not implementation trivia.

## 13. Security

Never:

- commit secrets
- hardcode production credentials
- expose tokens in logs
- use `npm audit fix --force` blindly
- downgrade core tooling only to make `npm audit` visually reach zero
- store sensitive native credentials in plain localStorage without an explicit security decision

Current known audit exception:

- development tooling may report `uuid <11.1.1` through `@capacitor/cli -> xcode`
- `npm audit --omit=dev` must remain clean
- do not override the transitive major version without an upstream-compatible fix

## 14. Scope discipline

When implementing a request:

- inspect existing code first
- make the smallest coherent change
- do not refactor unrelated areas
- do not rename public APIs without need
- do not reformat unrelated files
- do not create speculative abstractions
- preserve established feature boundaries

## 15. Definition of done

A task is complete only when:

- behavior is implemented
- types are correct
- edge cases are considered
- tests are added/updated where valuable
- lint passes
- tests pass
- production build passes
- mobile behavior was considered
- native impact was considered
- documentation/ADR is updated if architecture changed

If a required validation command cannot run, report it explicitly.

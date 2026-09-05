# Coding Standards

## TypeScript

- Strict typing is mandatory.
- Avoid `any`.
- Use `unknown` at untrusted boundaries.
- Prefer interfaces for object contracts.
- Prefer type aliases for unions/statuses/aliases.
- Keep side effects explicit.
- Prefer clear code over clever code.

## Angular

- Standalone APIs only.
- Prefer `inject()` for dependency injection.
- Signals are the default for state.
- Use `computed()` for derived state.
- Use RxJS for actual streams/asynchronous composition.
- Do not introduce Zone.js.
- Lazy-load business features.
- Keep templates declarative.

## Feature structure

Default:

```text
pages/
components/
services/
interfaces/
types/
<feature>.routes.ts
```

Do not add architectural layers unless a real problem requires them.

## Pages

Pages should:

- render feature state
- collect user input
- coordinate navigation
- invoke feature services
- manage page-local UI state

Pages should not:

- inject `HttpClient`
- import environments
- build API URLs
- call Capacitor directly
- contain heavy domain logic

## Components

Components should be visual and reusable within their feature.

Prefer inputs/outputs or signal inputs where appropriate.

Do not turn components into mini-services.

## Services

Feature services may handle:

- API calls through ApiClient
- feature state
- orchestration
- mapping small API/application differences

Keep services cohesive.

Do not create one service per trivial function.

## Interfaces

Use for structured object contracts.

Examples:

```text
Production
ProductionResponse
CreateProductionRequest
```

## Types

Use for:

```text
union types
statuses
filters
aliases
compact utility types
```

Example:

```ts
export type ProductionStatus = 'pending' | 'completed';
```

## HTTP

Feature code uses `ApiClient`.

Do not inject `HttpClient` outside core HTTP infrastructure unless there is an explicit documented exception.

Do not import `environment.apiUrl` in features.

## Forms

Use a consistent Angular form strategy within the feature.

Keep presentation validation close to the form.

Backend/business invariants remain authoritative.

## Styling

- SCSS
- Ionic theme variables for global theming
- feature styles close to feature components
- avoid `!important`
- avoid fixed page heights
- account for safe areas
- design phone-first

## Accessibility

- labels for inputs
- accessible names for icon-only controls
- visible focus on web
- do not rely only on color
- sensible touch targets

## Naming

Files:

```text
kebab-case.ts
kebab-case.html
kebab-case.scss
kebab-case.spec.ts
```

Types/classes:

```text
PascalCase
```

Variables/functions:

```text
camelCase
```

Booleans:

```text
isLoading
hasPermission
canEdit
```

Observable variables may use `$`.

Signals do not use `$`.

## Imports

Avoid circular dependencies.

Do not import private internals of another feature.

Avoid barrel files that hide ownership/dependency direction.

## Comments

Comments explain intent or constraints.

Delete commented-out code.

TODOs must be concrete.

## Dependencies

Do not add packages for trivial helpers.

Prefer Angular/Ionic/Capacitor capabilities already in the stack.

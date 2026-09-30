# Testing Strategy

## Current runner

Angular unit tests run through:

```text
@angular/build:unit-test
Vitest 4.x
```

## Required commands

```bash
npm run lint
npm run test:ci
npm run build
```

When native integration changes:

```bash
npx cap sync
```

The same frontend checks can run in the pinned Docker toolchain:

```bash
docker build --target verification -t gam-frontend:verification .
```

Validate both Compose definitions without starting services:

```bash
docker compose -f compose.dev.yaml config --quiet
docker compose config --quiet
```

## Test priorities

1. feature service behavior
2. data transformations/business rules
3. component/page behavior
4. API integration behavior
5. selected native/end-to-end flows

## Services

Feature services should be tested for:

- expected ApiClient calls
- state transitions
- loading/error behavior
- response handling

## Components/pages

Test user-visible behavior:

- rendered state
- actions
- navigation
- loading/empty/error states

Avoid tightly coupling tests to implementation details.

## HTTP

ApiClient itself should have focused tests for:

- URL normalization
- params
- headers
- methods
- baseUrl override

Feature tests should not repeatedly test generic ApiClient behavior.

## Native

Native wrappers are tested separately from feature UI when practical.

Real device checks complement unit tests.

## Coverage

Coverage is diagnostic.

Do not create meaningless tests solely to increase percentages.

## Authentication matrix

Unit tests cover signal bootstrap, leading-zero PIN input and interceptor leakage boundaries. Backend PHPUnit covers personal cookie login, native/shared PIN login, five-attempt blocking and web shared sessions.

Vitest/jsdom does not prove browser cookie persistence, CSRF across origins, multiple-tab races, real inactivity timing or device revocation after reload. Those require an integration browser run against the Docker Compose gateway. Android and iOS builds require their platform SDKs.

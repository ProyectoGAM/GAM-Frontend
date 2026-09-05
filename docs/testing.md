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

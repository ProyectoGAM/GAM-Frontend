# Development Workflow

## Baseline validation

Before feature work begins:

```bash
npm run lint
npm run test:ci
npm run build
npm audit --omit=dev
```

Expected production audit result:

```text
found 0 vulnerabilities
```

## Before coding

1. Read `AGENTS.md`.
2. Read relevant architecture docs.
3. Inspect the existing feature.
4. Keep the change inside the owning feature when possible.
5. Reuse existing services/components/types before creating new abstractions.

## During coding

Default feature structure:

```text
pages/
components/
services/
interfaces/
types/
```

Do not introduce extra architectural layers unless the feature clearly needs them.

## HTTP work

Use:

```text
Feature Service -> ApiClient
```

Do not:

- inject HttpClient in feature UI
- import environment.apiUrl in features
- duplicate API base URL handling

## Before finishing

Run:

```bash
npm run lint
npm run test:ci
npm run build
```

If Capacitor/native code changed:

```bash
npx cap sync
```

If dependencies changed:

```bash
npm audit
npm audit --omit=dev
```

## Dependency upgrades

Prefer framework-supported upgrade tools.

Angular:

```bash
npx ng update
```

Do not run `npm audit fix --force` blindly.

## Commit scope

Examples:

```text
chore: bootstrap Angular Ionic Capacitor frontend
docs: define frontend architecture and agent rules
feat(auth): implement mobile login flow
feat(production): add production list
refactor(api): centralize request options
```

Avoid mixing unrelated concerns in one commit.

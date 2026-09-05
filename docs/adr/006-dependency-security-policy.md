# ADR 006 - Dependency Security Policy

## Status

Accepted.

## Decision

1. Keep production audit clean.
2. Prefer framework-supported upgrades.
3. Do not run `npm audit fix --force` blindly.
4. Do not downgrade current framework tooling only to silence audit.
5. Do not force incompatible transitive major overrides.
6. Document temporary dev-only advisories and monitor upstream fixes.

Current known dev-only advisory:

```text
@capacitor/cli -> xcode -> uuid <11.1.1
```

`npm audit --omit=dev` currently reports zero vulnerabilities.

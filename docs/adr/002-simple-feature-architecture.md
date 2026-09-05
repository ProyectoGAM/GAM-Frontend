# ADR 002 - Simple Feature-Oriented Architecture

## Status

Accepted.

## Context

A previous proposal used internal layers such as:

```text
domain/
application/
data-access/
ui/
```

for every feature.

For GAM this was considered unnecessarily complex for the current product size and team workflow.

## Decision

Use a simple feature-oriented structure:

```text
features/<feature>/
  pages/
  components/
  services/
  interfaces/
  types/
  <feature>.routes.ts
```

Do not create Clean Architecture layers by default.

Additional layers may be introduced only when a real feature becomes sufficiently complex.

## Consequences

Benefits:

- lower ceremony
- faster navigation
- easier onboarding
- easier Codex reasoning
- clear ownership
- enough separation for current needs

Trade-off:

- some services may combine API access and application orchestration until complexity justifies splitting them

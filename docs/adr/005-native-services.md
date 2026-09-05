# ADR 005 - Simple Native Service Wrappers

## Status

Accepted.

## Context

Capacitor plugins should not be imported directly throughout feature UI.

A full ports/adapters/use-case architecture was considered unnecessarily complex for simple native capabilities.

## Decision

Wrap Capacitor access in focused services under:

```text
core/native/
```

Examples:

```text
camera.service.ts
geolocation.service.ts
network.service.ts
```

Feature UI depends on these wrappers rather than raw Capacitor plugins.

Introduce more elaborate abstractions only if real complexity appears.

## Consequences

Benefits:

- native access stays centralized
- feature UI remains cleaner
- browser fallback can be contained
- avoids unnecessary architectural ceremony

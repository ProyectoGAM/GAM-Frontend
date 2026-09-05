# ADR 003 - Central ApiClient

## Status

Accepted.

## Context

Importing `environment.apiUrl` and `HttpClient` throughout features creates repeated infrastructure code and spreads configuration concerns.

## Decision

Use one central `ApiClient` under `core/api`.

Dependency flow:

```text
Page / Component
 -> Feature Service
 -> ApiClient
 -> HttpClient
```

Configuration flow:

```text
environment
 -> API_CONFIG
 -> ApiClient
```

Feature services use relative API paths.

## Rules

Pages/features must not:

- import `environment.apiUrl`
- manually prepend the API base URL
- inject `HttpClient` for normal backend calls

ApiClient remains generic and must not contain feature or auth business logic.

## Consequences

Benefits:

- one API base URL policy
- consistent headers/params
- easier testing
- less duplicated HTTP plumbing
- simpler environment management

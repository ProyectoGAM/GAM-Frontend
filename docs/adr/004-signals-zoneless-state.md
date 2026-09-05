# ADR 004 - Signals-First Zoneless Angular

## Status

Accepted.

## Decision

Keep the application zoneless.

Use:

- signals for local/feature state
- computed signals for derived state
- RxJS for streams and asynchronous composition

Do not add a global state library unless concrete complexity justifies it through a new ADR.

## Consequences

The app stays aligned with modern Angular while keeping state simple and explicit.

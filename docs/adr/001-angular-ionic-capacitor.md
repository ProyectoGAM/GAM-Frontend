# ADR 001 - Angular + Ionic + Capacitor

## Status

Accepted.

## Decision

Use:

- Angular 22
- Ionic Angular 9
- Capacitor 8
- one shared frontend codebase for web, Android and iOS
- standalone Angular
- zoneless Angular
- mobile-first design

## Consequences

Benefits:

- shared business logic
- Angular expertise preserved
- native device access
- web remains first-class
- Ionic mobile UX primitives

Trade-offs:

- Android/iOS still require platform testing
- some native behavior differs by platform

# Fix Production Unit List Route

## Objective
Make the “Listado” link under Unidades productivas activate the same list route as `develop`, while preserving detail, edit, creation, section-based navigation, Installations, Inventory, and Suppliers/Products routes.

## Problem and root cause
After the conflict-resolution commit `903a09a`, `AdminSidebarComponent.itemRouteCommands()` expands an empty item slug with `''.split('/')`, adding a final empty router command. For the “Listado” item, Angular serializes that as `/administracion/unidades-productivas/`. Its URL parser retains an empty final segment; the `:id` route matches that segment as `id: ''` before the list route. `ProductionUnitDetailPage` converts it to `0` and shows “No se pudo cargar la unidad”. `develop` uses `adminItemPath()` to generate `/administracion/unidades-productivas` without the empty segment, so the `path: ''` list route loads.

## Authorized scope and constraints
- Work only in GAM-Frontend; do not commit or push.
- Fix only the empty-slug sidebar URL regression and add route/navigation tests that protect the list, detail, edit, and create destinations.
- Preserve `section: unit | global`, the unit management route set, Installations routes, Inventory routes, and Suppliers/Products navigation.
- Do not change backend, Inventory functionality, service/API logic, or other features.
- Preserve all pre-existing working-tree state.

## Acceptance criteria
- Clicking/generating the “Listado” link produces `/administracion/unidades-productivas` without a trailing empty segment.
- That URL's route snapshot resolves to `ProductionUnitsListPage`, with no `id` param and no detail API request.
- `/administracion/unidades-productivas/:id` still resolves to detail; `/:id/editar` still resolves to edit; `/nueva` still resolves to creation.
- Inventory and Suppliers/Products routes remain configured.

## Tasks
- [x] PU-1 Correct the empty-slug link command and add focused tests for the generated URL and route snapshots/destinations.
- [x] PU-2 Run required tests, lint, build, and diff checks; inspect final scope. Evidence: `npm run test:ci` passed (41 files, 219 tests), `npm run lint` passed, `npm run build` passed with SCSS budget warnings, and `git diff --check` passed. Only the sidebar command and its navigation tests changed.

## Route and verification configuration
- Route: delegated direct. Mapping trigger evidence: audit spans admin route generation, navigation, sidebar commands, unit route definitions, list/detail pages, unit context, and services (4+ files). Writer trigger evidence: implementation and regression coverage touch multiple non-trivial files.
- TDD: off (standard functional verification), as explicitly selected in the existing `develop:odd/tasks/inventory-usability-and-production-units.md`; runner: `npm run test:ci`.
- Forecast: under 400 authored changed lines; delivery strategy: ask-on-risk. The user explicitly prohibits commits and pushes.
- Engram mirror: pending; no Engram memory tools are available in this session.

## Progress and verification evidence
- Audit compared `develop` (`efd1c0b`) with `feature/inventory` (`679f4e3`) without switching branches or editing source.
- Confirmed the changed source is `src/app/features/admin/components/admin-sidebar.component.ts`, changed in `903a09a fix merge conflicts`; UP `admin.routes.ts` branch and `production-units.routes.ts` are semantically unchanged for this URL.
- Reproduced with Angular's `DefaultUrlSerializer` and `defaultUrlMatcher`: the current trailing-slash URL yields remaining segment `''` and `:id` matches with `id: ''`; the develop URL leaves no segment and cannot match `:id`.
- `itemRouteCommands()` now omits path segments only when the slug is empty; nested slugs still split into their existing segments.
- The sidebar test asserts `Listado` generates `/administracion/unidades-productivas` without a trailing slash.
- A `RouterTestingHarness` test using the current `adminRoutes` group children confirms that URL activates `ProductionUnitsListPage`, the active snapshot has path `''` and no `id`, `listAll()` runs once, and `getById()` is not called. It also navigates the same real route tree to `/:id`, `/:id/editar`, and `/nueva` and confirms detail, edit, and create pages load.
- Existing navigation assertions for section order, Instalaciones, Inventory stock locations, and Suppliers/Products remain in place. The sidebar fixture now provides the unit-context service its child component requires.
- Focused verification passed: `npm run test:ci -- --include=src/app/features/admin/admin-navigation.spec.ts` (8 tests).
- Full browser verification was unavailable; the RouterTestingHarness navigated the actual admin route tree and confirmed the list snapshot and child destinations.
- Final checks: `npm run test:ci` passed (41 files, 219 tests); `npm run lint` passed; `npm run build` passed with SCSS budget warnings; `git diff --check` passed. No commit/push or backend/Inventory changes.

## Next step
No further work in scope. No commit or push was made, per user instruction.

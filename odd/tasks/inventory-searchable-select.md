# Inventory Searchable Select

## Objective
Add a reusable accessible searchable select under `src/app/shared/ui` and use it only for Product and Stock Location fields in Inventory movement registration and Product/Location movement filters.

## Problem and rationale
The specified Inventory controls use native `<select>` elements with long option lists and no label search. There is no existing shared combobox/autocomplete/listbox suitable for reuse, so a small `ControlValueAccessor` is needed. Existing controls already store values as string IDs (or empty string for filters) and display option labels such as `SKU — product name`.

## Authorized scope and constraints
- Work only in GAM-Frontend. No commit/push, backend, external dependencies, or Inventory business-rule changes.
- Audit found no `src/app/shared/` directory and no reusable searchable select or `ControlValueAccessor` component.
- Add a shared UI control that filters the full visible label case-insensitively, supports keyboard/ARIA, Reactive Forms, focus, disabled/loading/empty states, and responsive bounded scrolling.
- Replace only Product and Stock Location controls in Registrar movimiento (including transfer source/destination) and Movimientos filters. Keep Supplier, movement type, operation, status, and all other selects unchanged.
- Preserve option fetching, status filters, API/services, pagination, empty ID values, payload conversion, validation, and error behavior.
- Preserve existing local work outside these exact controls.

## Acceptance criteria
- Typing product SKU, product name, or case variants filters by the visible label.
- The control's form value remains the selected option value/ID, never its label; empty filter values remain `''` and show Todos/Todas.
- Current selections survive reopening and option updates; query clears on close.
- Enter, arrows, Escape, normal Tab behavior, focus-on-open, combobox/listbox/option semantics, and >=44px targets are covered.
- Dropdown scrolls within a bounded height without horizontal viewport overflow at mobile/tablet/desktop widths.
- Registrar movimiento and Movimientos submit/filter the same IDs and values as before.

## Tasks
- [x] SS-1 Implement the shared accessible searchable select and its unit tests.
- [x] SS-2 Integrate only the approved Product/Location controls and add page tests for IDs, filters, and existing payloads.
- [x] SS-3 Run the required full test, lint, build, and diff checks; inspect final scope.

## Route and verification configuration
- Route: delegated direct. Mapping trigger evidence: shared controls and targeted fields cross the shared UI and movement form/list templates, Reactive Forms, payload handling, and specs in 4+ files. Writer trigger evidence: the control plus tests and two non-trivial page integrations affect multiple files.
- TDD: off (standard functional verification), as explicitly selected in the existing `develop:odd/tasks/inventory-usability-and-production-units.md`; runner: `npm run test:ci`.
- Forecast: over 400 authored lines due to the standalone accessible control and keyboard/form tests; this is a planning estimate, not a reason to reduce required accessibility or coverage. Delivery strategy: ask-on-risk; the user explicitly prohibits commits and pushes.
- Engram mirror: pending; no Engram memory tools are available in this session.

## Progress and verification evidence
- Audit completed: no suitable shared searchable control exists; `src/app/shared/` is absent. Target controls are native selects in `movement-form.page.html` and `movements.page.html`.
- Registrar movimiento uses required string ID controls and `"Selecciona…"` empty options; filters use string IDs and `""` options labeled Todos/Todas. Existing payload/filter conversion and option loading remain in page logic.
- Added `src/app/shared/ui/searchable-select/` with a standalone ControlValueAccessor, full-label case-insensitive filtering, an optional empty filter choice, combobox/listbox semantics, keyboard selection/dismissal, disabled/loading and empty/no-result states, and a bounded dropdown with 44px options.
- The dropdown recalculates flip and available height on open, viewport resize, and scroll; horizontal placement is clamped to the viewport.
- The component spec covers CVA string IDs, labels/errors, selected state, complete-label/case-insensitive search, keyboard/Tab/Escape/click reopen, empty sentinel plus empty state, disabled/loading, touch target, and viewport placement at 390px/768px/desktop.
- Replaced only Product and Stock Location controls in movement registration (including Transferencia source/destination) and Product/Location movement filters. Supplier/type/operation/status selects, reference loading, API calls, business logic, and pagination are unchanged.
- Updated movement-form coverage for active Product/Location options, both transfer location selectors, string ID values, and the existing transfer payload. Added `movements.page.spec.ts` for Todos/Todas empty values, numeric IDs in the existing query, and reset behavior.
- Focused verification passed: searchable-select spec (15 tests), movement-form spec (15 tests), Movements page spec (3 tests).
- Final full verification passed: `npm run test:ci` (43 files, 238 tests), `npm run lint`, `npm run build`, and `git diff --check`.
- Build emitted existing component SCSS size-budget warnings (including the existing Movement form/list page styles); build exited successfully.
- Final scope contains only the shared select, the specified movement registration/list controls and their tests, and this task record. No backend, other Inventory screen, data-loading/API, business logic, or pagination changes.
- Engram mirror remains pending because no Engram memory tools are available in this session.

## Next step
No further work in this task; no commit or push was made, per user instruction.

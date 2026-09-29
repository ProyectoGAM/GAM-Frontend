# Egg Stock active unit and history refresh

## Objective

Correct the existing Egg Stock screen to use GAM's global active production unit, make movement history readable and complete, and ensure a corrected movement is visible with its updated data when returning from detail.

## Problem and rationale

Egg Stock currently loads its own production-unit list and silently selects the first unit. That can show a different account from the globally selected unit. Movement row details lack explicit layout rules, so long reasons can collide with status/detail controls. The current list resource already includes actor, version, and revisions, but the screen does not mark corrected rows. Angular navigation remounts this page on return from detail, so it should load from the global selection without an Ionic-only lifecycle hook.

## Authorized scope and constraints

- Modify only the Egg Stock page, its focused tests, and the existing inventory shared stylesheet for rules scoped to `.stock-page.egg-page`; do not change the shell/global selector, detail workflow, backend, API, routes, permissions, other inventory modules, or data contracts.
- Use `AdminUnitContextService` as the production-unit source. A null global selection must remain unselected and must not trigger a unit-specific request.
- Preserve current count, receipt, issue, filter, pagination, detail, correction, cancellation, permission, validation, loading, and error behavior.
- Movement rows must use returned data. A correction indicator must be based on a `correct` revision, not version alone, since cancellation also changes version.
- No commit or push, per explicit user instruction.

## Acceptance criteria

- No local production-unit selector/list or automatic first-unit selection remains. The global selection name is shown when available; no selected unit produces a clear instruction and no EggStock request.
- Changing the global selected unit reloads its balance and history and does not leave another unit's data visible.
- History rows clearly separate type, date/time, actor, signed quantity, full wrapping reason, status, correction indicator, and detail link at desktop, tablet, and mobile widths.
- On returning from movement detail, the selected unit's current balance/history load again. Corrected movements show their current values and a “Corregido” indicator without a duplicate frontend row.
- Pending or failed physical counts do not enter history or change displayed balance; successful counts refresh balance/history.
- Focused coverage includes global selection/no local selector, complete rows and long reasons, correction/re-entry without duplicate rows, count pending/failure, filters/clear, and pagination.

## Task, route, and verification

| ID | Work | Route and trigger evidence | Status |
|---|---|---|---|
| EAUH-1 | Replace local UP selection with the global context, improve movement row layout/correction indicator, and add focused behavior/layout coverage. | Delegated direct. Mapping trigger: resolution spans the page, context provider, router strategy, movement resource/contract, detail flow, tests, and inventory docs (4+ files). Writer trigger: the page component/template/styles/tests are multiple non-trivial files. | Complete |

- TDD: off, ordinary functional verification; source is the prior Egg Stock physical-count task's resolved project setting.
- Test runner: `npm run test:ci` (focused screen command during iteration: `npm exec -- ng test --configuration=ci --include src/app/features/inventory/pages/egg-stock/egg-stock.page.spec.ts`).
- Closure checks: focused Egg Stock and movement-detail tests, `npm run test:ci`, `npm run lint`, `npm run build`, `git diff --check`.
- Forecast: approximately 250 authored changed lines, excluding this task file; delivery strategy `ask-on-risk`. The explicit no-commit instruction takes precedence over the general work-unit commit rule.
- Engram mirror: pending; no memory/Engram tool is available in this session.

## Findings and progress

- Baseline status was recorded before edits. Existing local changes in both subrepositories and the root workspace are preserved.
- `AdminShellPage` provides and loads `AdminUnitContextService`; the sidebar selector reads/writes that shared context. Egg Stock is the outlier that requests all units and selects `units[0]`.
- The page is rendered under the shell's Angular `router-outlet`; `IonicRouteStrategy` never detaches routes. Returning from detail recreates Egg Stock, and its initial load should use the globally selected ID. No `ionViewWillEnter` change is warranted.
- Backend `ListEggStockTransactionsQuery` loads creator and revisions; `EggStockTransactionResource` serializes actor, version, and revisions. The frontend interface already models these. A `correct` revision identifies corrections; version alone also changes for cancellation.
- Existing page tests cover count preview/success and some row content but use the obsolete local selector mocks. They do not cover global selection, complete row layout, correction indicator/re-entry, count failure preserving displayed state, filters, clear, or pagination.
- Root cause for a corrected row seeming absent can include Egg Stock querying a different first unit than the global selection; correction changing the date/order can also move a row under filtering/pagination. After re-entry, start at the current list's default page with the unchanged global unit and current list resource; do not synthesize a row or alter the ledger.
- Removed the page-owned production-unit list and selector. Egg Stock now reads `AdminUnitContextService.selectedId()`/`selectedUnit()` from the AdminShell, clears stale data on selection changes, ignores stale responses, and makes no stock request while the global context is unselected.
- Reworked movement history into explicit responsive fields for date/time, type, actor, signed amount, full wrapping reason, status, correction badge, and detail link. The correction badge is derived from a returned revision with `action === 'correct'`; cancellation remains distinct.
- Preserved the existing physical-count and manual movement flows. Pending and failed counts do not add rows or replace balance/history; successful commands still reload the server list. The Angular/Ionic route strategy remounts Egg Stock after returning from detail, and the added remount test confirms the updated row appears once with its current balance and correction badge.
- Updated focused tests for empty and changing global context, complete long-reason rows, correction re-entry, failed counts, filters, clear, and pagination. The final frontend suite passed: `npm run test:ci` (43 files, 247 tests), exit 0. Focused Egg Stock + movement-detail tests passed: 2 files, 16 tests, exit 0.
- `npm run lint` passed, exit 0. `npm run build` passed, exit 0; it retains the repository's existing SCSS budget warnings on other screens. `git diff --check` passed, exit 0, with only Git's LF-to-CRLF normalization notices.
- A first build attempt exceeded the Egg Stock component-style error budget after the history layout was expanded. The final rules live under the existing inventory shared stylesheet scoped to `.stock-page.egg-page`, leaving the page stylesheet minimal and allowing the build to pass without changing the budget configuration.

## Next step

EAUH-1 is verified and complete. No backend change was indicated by current evidence. No commit or push was made. Engram synchronization remains pending because no memory tool is available in this session.

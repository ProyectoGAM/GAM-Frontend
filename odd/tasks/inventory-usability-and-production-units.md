# Inventory usability and production-unit integration

## Objective

Integrate Inventory's egg-stock and stock-location screens with the real Production Units feature, make Inventory's screens and workflows clearer and more accessible, and preserve exact backend quantity contracts. Follow-up work adds unit-aware quantity inputs and replaces Inventory's native confirmation popups with an accessible feature-scoped dialog.

## Problem and motivation

EggStock and StockLocations read production units from the generic `InventoryReferenceApi.options()` response even though `ProductionUnitsService.listAll()` is the real, paginated source. Inventory also exposes backend terminology, raw identifiers, dense forms, small controls, and incomplete loading/error feedback across several screens. The user requested the integration and usability work; they explicitly prohibited commits/pushes and changes outside Inventory except a strictly necessary route fix.

## Authorized scope and constraints

- Repository: `GAM-Frontend`, branch `feature/inventory`.
- Main scope: `src/app/features/inventory/`.
- New follow-up scope: quantity formatting/inputs and destructive confirmation dialogs within Inventory only. Do not edit global shell/navigation, backend, or other features for this follow-up.
- Read-only integration reference: `src/app/features/production-units/services/production-units.service.ts` and `src/app/features/production-units/interfaces/production-unit.interface.ts`.
- `src/app/features/admin/admin.routes.ts` already contains a user change; preserve it and do not edit it unless a strictly necessary Inventory route defect is demonstrated.
- Do not modify GAM-Backend, Lotes, Producción, Manejo, Pesajes, Dashboard, global shell/navigation, backend APIs, permissions, or business rules. Do not add a state library or dependencies. Do not use mocks as production data.
- Keep `InventoryReferenceApi` for product, supplier, location, and other applicable reference options. Reuse real `ProductionUnit` for list selectors; retain a minimal, separately named summary type for the nested stock-location relation if its API shape lacks required `locality`.
- Do not infer that every `kind === 'egg'` balance is a protected technical account; current Inventory models do not expose a proven discriminator.
- **No commit or push**; this is an explicit user constraint. Do not create a PR without a committed, authorized work unit.
- Route: **delegated direct** for multi-file source tasks. Trigger evidence: each UI task spans multiple non-trivial page, style, API/type, and/or test files; the initial audit required mapping 4+ files.
- Forecast at task creation: approximately **1,200 authored changed lines** (additions plus deletions, generated files excluded; rough forecast only). Re-estimate against the observed diff; do not artificially shrink, omit tests, or commit.
- Follow-up forecast: approximately **450 additional authored changed lines** across INV-07 and INV-08 (rough estimate only).
- Delivery strategy: **ask-on-risk** (default). The user explicitly prohibits commits and pushes, so no work-unit commits or PRs are authorized.

## TDD and checks

- Effective ODD TDD mode recorded in the pre-existing task document: **off (standard functional verification)**. The document records this as an explicit user selection; retain that source unless a new user instruction changes it.
- Test runner: Angular `@angular/build:unit-test` with Vitest 4.x; CI command is `npm run test:ci` (`ng test --configuration=ci`).
- Required final checks: `npm run test:ci`, `npm run lint`, `npm run build`, `git diff --check`.
- Manual checks, subject to a usable local app and real service data: verify the same newly created Production Unit appears in EggStock and StockLocations; create a stock location; verify it in Existencias; record and inspect a movement; check desktop, tablet, and mobile layouts.
- Record actual results; do not claim unavailable API/manual checks as passed. Compare SCSS budget warnings with baseline; do not raise budgets to hide warnings.
- Engram mirror topic `odd/inventory-usability-and-production-units/tasks`: pending because the memory tools are not available in this session. This local document is the recovery source until the mirror can be synchronized.

## Acceptance criteria

1. EggStock and StockLocations load production units using `ProductionUnitsService.listAll()`; selected IDs sent to Inventory APIs remain numbers. Neither screen reads `options.production_units`.
2. `InventoryReferenceApi` continues to serve reference data still needed by other Inventory screens. The production-unit selector type is the actual `ProductionUnit`; a summary relation remains accurately typed.
3. Production-unit loading failures have visible, recoverable states and do not break unrelated Inventory screens.
4. Inventory UI uses clear Spanish, visible labels, readable text, adequate touch targets, meaningful loading/empty/error/success feedback, and clear action hierarchy. Remove unnecessary backend terms, enum names, opaque IDs, and decimal noise from user-facing copy.
5. Generic and egg-stock movement contracts, permissions, validations, idempotency, confirmation requirements, and backend authority remain intact. Donaciones remain unavailable/not implemented.
6. Forms and lists remain keyboard accessible and usable on mobile/tablet/desktop; dense mobile tables are not required.
7. Relevant regression tests cover production-unit sourcing/IDs/failures and preserve generic movement payloads plus EggStock receipt/issue/loss/correction/cancellation behavior.
8. No changes are made outside the authorized scope; no commit or push is made.
9. Quantity display removes insignificant zeroes without rounding; discrete units use integer-oriented inputs, continuous units allow fractions, and requests retain their existing decimal/string payloads.
10. Inventory uses an accessible integrated dialog for destructive confirmations; no native `window.confirm`, `alert`, or `prompt` remains in Inventory.

## Tasks

- [x] **INV-01 — Integrate the real Production Units source** (delegated direct)
  - Replace the two `options.production_units` consumers (EggStock and StockLocations) with `ProductionUnitsService.listAll()`.
  - Separate the selector model from the summarized `StockLocation.production_unit` relation; keep `InventoryReferenceApi` responsibilities that remain valid.
  - Add focused tests for source, numeric IDs, load failures, and retry; preserve working list content after UP failure.
  - Evidence: `npm run test:ci` passed all 23 files / 75 tests on 2026-09-26.
- [x] **INV-02 — Clarify Existencias and StockLocations** (delegated direct)
  - Improve human-readable stock/location information, visible labels, loading/empty/error/success feedback, and primary actions.
  - Make minimum-stock editing and location activation/deactivation explanations clearer; keep responsive cards/tables and existing permissions.
  - Evidence: added behavior tests for movement permission visibility, reference retry while balances remain available, and minimum quantity validation/API decimal format. `npm run test:ci` passed all 23 files / 75 tests on 2026-09-26.
- [x] **INV-06 — Bring Inventory component styles back under budget** (delegated direct; added after build verification)
  - Build reported errors for `stock.page.scss` (5.77 KB) and `stock-locations.page.scss` (5.26 KB), above the existing 4 KB error threshold. Do not increase Angular budgets.
  - Share genuinely common Inventory styles inside the feature using a small, root-scoped stylesheet if needed; keep global selectors confined to Inventory page roots and move page-specific layout only as far as needed to pass the component budgets.
  - Use `--gam-color-*` semantic tokens, preserve readable controls/mobile layouts, and verify both themes. Keep unrelated component styles and global UI untouched.
  - Required evidence: production build passes; report before/after SCSS warnings and component style sizes. Do not claim this task complete from source size alone.
  - Evidence: `npm run build` passed after the change. The final warning set is the same 15 component styles as the clean `HEAD` baseline (built with only the current, pre-existing `admin.routes.ts` copied into the temporary worktree so the baseline route export compiles); no warning component was added. Stock decreased from 5.77 KB pre-mitigation to 2.69 KB; StockLocations from 5.26 KB to 2.25 KB. Clean `HEAD` measured 3.82 KB and 3.43 KB for those files. EggStock moved from 3.84 KB at baseline to 2.85 KB; egg movement detail from 2.65 KB to 2.86 KB. All are below the unchanged 4 KB error limit; the same styles remain above the 2 KB warning limit. The final 15 warnings are Auth, Admin sidebar, six existing Production Units styles, and seven Inventory styles: Stock, StockLocations, Movements, movement form, movement detail, EggStock, and egg movement detail. Shared rules are scoped under Inventory page roots, use existing semantic tokens, and the global stylesheet only imports this small Inventory-scoped file.
- [x] **INV-03 — Simplify generic movement screens** (delegated direct)
  - Redesign movement list, detail, and form copy/layout; show only operation-relevant inputs and clarify receipt, issue, loss, transfer, and adjustment.
  - Preserve all existing payload, validation, permission, confirmation, and idempotency contracts; add payload coverage where missing.
  - Evidence: API contract test, adjustment comparison tests (including stale responses and exact decimals), and reference-name lookup tests. `npm run test:ci` passed 25 files / 84 tests on 2026-09-26; the focused form check passed after the final unit-label copy update.
- [x] **INV-04 — Simplify EggStock and egg movement detail** (delegated direct)
  - Make unit selection/loading failures recoverable; present one clear operation at a time and make correction/cancellation understandable.
  - Keep production-generated receipts read-only and preserve versioning, cancellation, correction, and idempotency contracts; do not invent an egg technical-account heuristic.
  - Evidence: EggStock now uses one manual operation at a time, keeps production receipts read-only, and explains negative balances. Movement detail shows the current quantity, leaves the new quantity blank, requires a correction reason, confirms cancellation, and hides internal IDs/version values. Inventory network and conflict errors use human messages without invented conflict codes. API tests cover EggStock receipt, issue, loss, correction, and cancellation contracts. Focused tests passed 4 files / 18 tests on 2026-09-26; final full verification is recorded in INV-05.
- [x] **INV-05 — Verify and report the completed change** (delegated verification where applicable)
  - Run the four required automated commands, perform feasible manual viewport/flow checks, inspect changed files and SCSS budget output, and report all skipped/failed/unavailable checks.
  - Confirm no commit/push, no backend changes, and no unrelated feature changes.
  - Evidence (2026-09-26): `npm run test:ci` passed 27 files / 92 tests; `npm run lint` passed; `npm run build` passed with the unchanged budget thresholds; `git diff --check` exited 0. The build warning set is the same 15 component SCSS files as the clean `HEAD` baseline, with no new warning component. Manual authenticated data flows and viewport inspection were unavailable: the configured API is local at `127.0.0.1:8080`, but no authorized test session/account was available to access or mutate it, so no API writes were made. Light and dark semantic tokens are defined, but their visual rendering was not screenshot-verified. No backend or unrelated feature files were changed; the existing `admin.routes.ts` user edit was preserved. No commit or push was made.
- [x] **INV-07 — Show human quantities and unit-aware inputs** (delegated direct)
  - Reuse `inventory-format.ts`; add the exact requested positive/negative, discrete, and continuous formatting cases without rounding.
  - Audit all Inventory quantity displays and form inputs. Treat canonical `unit`/`dose` as discrete and `kg`/`g`/`l`/`ml` as continuous; do not guess for unknown values.
  - Make movement and minimum-quantity inputs reflect the selected product unit while preserving existing validation authority and exact API decimal/string serialization.
  - Route: delegated direct. Mapping trigger evidence: formatter consumers span Stock, generic movement form/detail, EggStock, egg detail, API models, and tests (4+ files). Writer trigger evidence: formatter, tests, and multiple non-trivial forms are affected. TDD off; runner `npm run test:ci`.
    - Evidence (2026-09-26): `inventory-format.ts` formats quantities without insignificant zeroes or rounding, and `formatQuantityInput()` gives editable localized values without grouping. `unit`/`dose` use integer-oriented validation and input mode; known continuous and unknown units accept decimals. Stock minimums display `12.500000` as `12,5` while an untouched value still sends the exact original `12.500000` string; edited `5,250000` sends `5.250000`. Exact requested display and input cases are covered.
- [x] **INV-08 — Replace Inventory native confirmations with an accessible dialog** (delegated direct)
  - Replace reversal, EggStock cancellation, and stock-location activation/deactivation native confirmations with one small Inventory-scoped dialog; retain their endpoints, payloads, idempotency, reasons, permissions, and semantics.
  - The reversal dialog shows available movement summary, retains the entered reason, supports Escape/cancel/focus return, disables repeat submission while busy, uses the danger token/style, and shows human API errors and current success feedback.
  - Route: delegated direct. Mapping trigger evidence: searched project patterns and all Inventory confirmation callsites before implementation; writer trigger evidence: shared component plus three non-trivial page integrations/specs. No project dialog pattern exists; use the platform dialog, no dependency.
    - Evidence (2026-09-26): Added a shared Inventory component backed by native `<dialog>`; replaced all three native confirms (movement reversal, EggStock cancellation, and location activation/deactivation). The dialog shows each action's summary and retains entered reasons, uses the danger token, handles Escape/cancel/focus return, blocks duplicate submissions, and stays open with human API errors. The Inventory source audit found no remaining `window.confirm`, `alert`, or `prompt`. Focused dialog/page tests passed 4 files / 13 tests; coverage includes cancel without API, one submit, busy, success/error, Escape, and focus return. In StockLocations, successful refresh restores focus to its stable heading after its table row is recreated.
    - Final follow-up checks (2026-09-26): `npm run test:ci` passed 28 files / 103 tests; `npm run lint` passed; `npm run build` passed with the unchanged Angular budgets and the same 15 component-style warnings as baseline; `git diff --check` exited 0 (Git emitted only line-ending notices). Browser-native modal focus trapping and viewport rendering were not manually inspected; jsdom specs stub `showModal()`/`close()`.

## Progress and next step

- Exploration complete for the Inventory feature, real Production Units service/model, route mounting, current consumers, and existing tests.
- A pre-existing change in `src/app/features/admin/admin.routes.ts` is protected and has not been edited.
- The inventory Product model contains no proven discriminator for protected EggStock technical accounts; do not add a `kind === 'egg'` heuristic. Rely on backend protection and document this gap in the final report.
- `InventoryReferenceApi.options()` remains used for products, stock locations, suppliers, and reference types by stock/movement screens; no UI selector reads `options.production_units` after INV-01.
- INV-01 through INV-04 implementation and regression coverage are present. Final automated checks passed: 27 files / 92 tests, lint, production build, and `git diff --check`. Stock (2.69 KB), StockLocations (2.25 KB), EggStock (2.85 KB), and egg movement detail (2.86 KB) are below the 4 KB error limit; the same 15 component-style warnings remain as in the clean `HEAD` baseline. Manual authenticated API flows and visual viewport inspection were not performed because there was no authorized test session; no API writes were made.
- User's explicit no-commit rule overrides the normal ODD work-unit commit instruction; no commit or push will be created. No native review candidate exists without a commit.
  - The user added two authorized follow-up tasks after the previous feature verification: INV-07 (unit-aware quantities) and INV-08 (Inventory confirmation dialog). Both are implemented and verified. Canonical product units are `unit`, `dose`, `kg`, `g`, `l`, and `ml`; no metadata identifies future custom discrete units, so unknown units are treated as continuous. Unmodified Stock minimums retain their original decimal string while edits serialize exactly as entered after locale normalization.
- Next: user review of the Inventory changes. No commit or push was made. Engram tools and mirror are unavailable in this session; this local feature document remains the recovery source. Authenticated API flows and real-browser viewport/modal behavior remain manually unverified, and no API writes were made.

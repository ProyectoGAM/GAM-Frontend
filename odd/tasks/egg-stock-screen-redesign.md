# Egg Stock screen redesign

## Objective

Redesign the existing Egg Stock page to match GAM's dark administrative visual system and the requested compact desktop composition, while preserving the in-progress physical-count work and all existing Egg Stock behavior.

## Problem and rationale

The current page stacks the physical count form, receipt/issue forms, filters, and full movement table vertically. This makes the balance and primary actions harder to scan and does not provide the requested balanced count/history layout. Reuse the existing global Inventory styles and semantic GAM tokens; keep the shell and API flows intact.

## Authorized scope and constraints

- Modify only `src/app/features/inventory/pages/egg-stock/egg-stock.page.html`, `.scss`, `.ts`, and `.spec.ts` as needed for this screen and focused tests.
- Preserve the existing local physical-count, API, interface, docs, movement-detail, navigation, and other worktree changes. Do not overwrite or revert them.
- Keep the administrative shell/navigation, services, endpoints, routes, payloads, permissions, validation, loading/errors, filters, pagination, detail, correction, and historical cancellation behavior unchanged.
- Use returned application data only. The current `EggStockTransaction` interface provides optional `actor` data; show its name, its ID when the name is absent, or “Actor no informado”. Do not infer fields absent from the interface or change the contract.
- No backend/API/contract changes, other inventory modules, dependencies, commit, or push.

## Acceptance criteria

- Page header keeps the Inventory breadcrumb, Stock de huevos title, description, and existing production-unit selector.
- Current balance appears in a compact horizontal card beside count, receipt, and issue actions.
- The selected action shows its existing form; desktop places that form beside recent movements, while tablet/mobile stack panels and actions with touch-friendly controls and no horizontal overflow.
- Physical count still previews expected balance and signed difference before submit; only a successful API response refreshes balance/history, and an unconfirmed count never appears as a movement.
- History remains filterable and paginated, keeps movement detail links and status/reason information, and shows dates, types, available actor identity, and signed quantities.
- Existing permission gates, validations, reasons, operation types, loading states, and errors remain intact.

## Tasks

- [x] ES-1 Redesign the Egg Stock page layout, action selection, and responsive presentation; update focused page coverage and run the requested frontend checks.

## Route and verification configuration

- Route: delegated direct. Mapping trigger evidence: understanding the request spans the page template, page state, styles, API/interface, tests, inventory docs, shared styles, and design tokens across 4+ files. Writer trigger evidence: the cohesive redesign affects the template, styles, page action presentation, and tests.
- TDD: off (ordinary functional verification), based on the existing Egg Stock physical-count task and inventory usability task. Runner: `npm run test:ci`.
- Required checks: focused Egg Stock page tests, `npm run lint`, `npm run build`; run `npm run test:ci` if focused test selection is unavailable or as practical for full module confidence; `git diff --check`.
- Forecast: around 400 authored changed lines (template and responsive styles dominate); planning estimate only. Delivery strategy: `ask-on-risk` default. User explicitly forbids commits and pushes; no work-unit commit or PR is authorized.
- Engram mirror: pending because no memory tools are available in this session.

## Progress and verification evidence

- Baseline reviewed before edits: Frontend branch `feature/inventory`; pre-existing modifications include this page and related physical-count/API/interface/docs work, as well as unrelated inventory navigation and movement-detail changes. All are to be preserved.
- Read `docs/inventory-frontend.md`, the required frontend architecture/coding/mobile/API/testing/workflow/design-color docs, and the existing Egg Stock component, service/interface, shared inventory styles, and tests.
- The existing page loads balance and paginated movements from `EggStockApi`; its count submission refreshes both only after success. `egg-stock.adjust` gates physical count and `egg-stock.move` gates manual receipts/issues.
- `EggStockTransaction` exposes optional `actor` data but no `created_by`; the inventory docs identify the lack of actor names in the list resource as a backend gap. UI fallback will use the returned actor ID if present, otherwise “Actor no informado”.
- Reorganized the page into a breadcrumb/title/unit header, compact balance/actions row, one permission-gated active command form, and a recent-movements panel. The shell, selector source, services, routes and contracts remain unchanged.
- Added responsive action stacking and balanced desktop panels. Existing shared Inventory cards, controls, buttons, focus rules and semantic color tokens provide the GAM appearance; no local color palette was introduced.
- Preserved the full movement filters, status/reason, detail link, pagination, and load/error states. Movement rows show dates, types, signed quantities, and returned actor name/ID when available; absent actor data is labeled “Actor no informado”.
- The count preview still uses the loaded theoretical balance and shows signed difference plus explanation. Cancel clears only the unsubmitted form; tests confirm no history row is created. A successful count still reloads balance and history.
- Focused page run: `npm exec -- ng test --configuration=ci --include src/app/features/inventory/pages/egg-stock/egg-stock.page.spec.ts` passed (1 file, 9 tests) before the final cancel assertion was added. The final full suite below includes that assertion.
- Final `npm run test:ci` passed: 43 files, 245 tests. An iteration first failed because one assertion expected the previous preview wording; another exposed that the post-cancel test fixture needed to repopulate date and reason. Both test issues were corrected; final suite passes.
- Final `npm run lint` passed: all files pass linting.
- Final `npm run build` passed. The Egg Stock stylesheet reports a 3.92 kB budget warning (the 2 kB warning threshold) but stays below the 4 kB error threshold; the build also reports the project's existing SCSS budget warnings on other screens. Earlier build iterations failed only while this stylesheet exceeded the 4 kB error threshold; styles were reduced and the final build passes.
- Final `git diff --check` passed with exit code 0. Git emitted only its existing LF-to-CRLF working-copy notices.
- Worktree status confirms the other previously modified documentation, navigation, interface, API, and movement-detail files remain present and untouched by ES-1. No commit or push was made, per the request.

## Next step

ES-1 is verified and complete. No commit or push was made. Engram synchronization remains pending because no memory tool is available in this session.

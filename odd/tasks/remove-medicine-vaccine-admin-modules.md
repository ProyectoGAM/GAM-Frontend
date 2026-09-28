# Remove Medicine and Vaccine Admin Modules

## Objective
Remove the new frontend Medicine and Vaccine maintenance modules, their navigation and routes, and the Vaccine-specific `management-plans.manage` access exception. Keep medicine/vaccine as normal Product kinds and preserve all unrelated Products, Suppliers, Inventory, and local work.

## Problem and rationale
Medicine and Vaccine maintenance was added as separate administrative modules, while the requested maintenance belongs in Products. Leaving their navigation, routes, or Vaccine-specific permissions would expose frontend destinations that should no longer exist.

## Authorized scope and constraints
- Work only in GAM-Frontend.
- Remove only `src/app/features/suppliers-catalogs/medicines/` and `src/app/features/suppliers-catalogs/vaccines/` and references that become dead because those modules are removed.
- Under Proveedores retain only Proveedores, Productos, and Nuevo producto.
- Preserve ProductKind values/labels, Product ownership metadata, current Products capabilities and guards for remaining routes.
- Remove only the frontend exception connecting `management-plans.manage` to Vaccine catalog access.
- Do not touch backend, Inventory, Suppliers, general Products permissions/logic, commits, or pushes.
- Preserve pre-existing dirty and untracked work outside this exact scope.

## Acceptance criteria
- No Medicines/Vaccines admin navigation items, frontend routes, or broken links remain.
- The two new feature directories are removed.
- Vaccine-owned products remain in Products and do not navigate to a removed route; backend capabilities continue to govern available actions.
- `medicine` and `vaccine` ProductKind labels remain Medicamento and Vacuna.
- Existing guards for remaining routes and all other Products behavior remain intact.

## Tasks
- [x] RMV-1 Remove the modules, their navigation/routes and Vaccine-only access exceptions; update affected navigation, guard, and Products tests. Evidence: deleted the 32 feature files/directories, removed their lazy routes and `management-plans.manage` exception, and updated navigation, guard, and Vaccine-owned Products coverage.
- [x] RMV-2 Audit remaining references and run the required test, lint, build, and diff checks. Evidence: no removed route/import references remain in application code; `npm run test:ci` passed (39 files, 195 tests), `npm run lint` passed, `npm run build` passed with SCSS budget warnings, and `git diff --check` passed.

## Route and verification configuration
- Route: delegated direct. Mapping trigger evidence: understanding spans navigation, route table, access policy, two guards, Products rendering and tests across more than four files. Writer trigger evidence: implementation changes multiple non-trivial files.
- TDD: disabled, from existing `odd/tasks/products-ownership-capabilities.md`; runner: `npm run test:ci`.
- Forecast: under 400 authored changed lines, excluding deleted feature implementation bulk; delivery strategy: ask-on-risk (no commit authorized by user).
- Engram mirror: pending; no Engram memory tools are available in this session.

## Progress and verification evidence
- Audit completed: module directories are separate; route/nav/guard references are isolated; ProductKind and ownership metadata are part of the remaining Products contract.
- RMV-1 source implementation completed. Remaining medicine/vaccine references are ProductKind labels/types/ownership, Inventory operational type labels/fixtures, and negative assertions that deleted links/routes stay absent. No backend files were touched.
- Verification: `npm run test:ci` passed (39 files, 195 tests); `npm run lint` passed; `npm run build` passed with SCSS budget warnings; `git diff --check` passed.

## Next step
No further work in scope. No commit or push was made, per user instruction.

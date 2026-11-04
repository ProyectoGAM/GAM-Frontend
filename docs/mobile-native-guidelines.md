# Mobile and Native Guidelines

## Mobile-first

Phone is the primary UX target.

Every new screen must work at narrow mobile widths before desktop enhancements are added.

## Ionic page layout

Prefer:

```text
ion-header
ion-toolbar
ion-content
```

`ion-content` normally owns scrolling.

Place form confirmation actions after the fields, inside the normal scrolling
content, on both phone and desktop. Do not use sticky/fixed action bars or an
`ion-footer` outside `ion-content` for Save, Create, Apply or Review buttons.
Actions must remain reachable by scrolling when the keyboard opens; do not move
them over fields using visual-viewport offsets or reserve space for floating bars.

Avoid nested scroll containers.

## Safe areas

Respect:

- status bar
- notches
- Dynamic Island
- Android system bars
- home indicator

Use Ionic/CSS safe-area mechanisms instead of hardcoded padding.

## Keyboard

Forms must remain usable when the software keyboard opens.

Verify:

- focused input remains visible
- submit actions remain reachable
- modals/sheets behave correctly
- content can scroll as needed

## Touch

Avoid dense desktop action bars on mobile.

Prefer touch-friendly Ionic patterns.

## Native access

Capacitor plugins are wrapped under:

```text
src/app/core/native/
```

Example:

```text
core/native/camera.service.ts
```

Pages/components should depend on that wrapper.

Do not import Capacitor plugins directly into feature UI.

## Keep native architecture simple

Do not create:

```text
ports/
adapters/
use-cases/
```

for every native plugin by default.

A small `CameraService`, `GeolocationService` or `NetworkService` is sufficient unless real complexity appears.

## Permissions

Native wrapper services should normalize plugin permission states into application-friendly values where necessary.

Do not spread raw plugin-specific permission enums through features.

## Browser fallback

Every native capability should define its web behavior.

Possible strategies:

- equivalent web API
- file-input fallback
- graceful disabled state
- alternate workflow

## Connectivity

Mobile networks are unreliable.

API-backed screens must represent unreachable/offline states.

## Native configuration

Current identity:

```text
appId: dev.huevossanjose.gam
appName: GAM
webDir: www
```

## Android

After web/native changes:

```bash
npm run build
npx cap sync android
npx cap open android
```

## iOS

Compilation/signing requires macOS/Xcode.

## Native folders

Keep manual Android/iOS modifications minimal, documented and reproducible.

## Authentication storage

The app uses Preferences for the non-secret deviceMode marker and the secure-storage plugin for native personal PAT/device credentials. Keychain synchronization is disabled by the wrapper. Employee PATs are memory-only, and shared startup returns to PIN after process restart or resume. iOS compilation still requires macOS/Xcode; Android signing/build tooling must be verified separately.

## Filter dialogs

`shared/ui/filter-dialog` supplies the presentation shell used by installations,
flocks, stock by location, stock locations, donations, recipes and the product catalogue. Its native dialog is centered
in the viewport on phone and desktop, with safe-area margins and a bounded height
based on `100dvh`. Only the body scrolls; the heading, close action and footer stay
available when more filters are added or the viewport height decreases.

Opening resets body scroll and focuses the heading without scrolling the page.
Closing with the X or Escape restores focus to the trigger. Feature pages own the
filter fields, draft selection, applied values and queries; **Limpiar** updates the
draft and **Ver resultados** applies it. The shell projects content without
knowing business types, permissions or endpoints.

## Form confirmation actions

Nuevo producto, Registrar movimiento, Nueva receta, medication/vaccine creation,
Crear lote and Roles y permisos place their confirmation section after the
content. The feeding editor places its submit button inside its form in
`ion-content`. These actions scroll with their forms in every viewport.

The admin shell supplies the normal bottom spacing and safe area. Forms do not
add a second reserve for an action bar. Buttons retain their touch target sizes,
disabled/loading states, submit handling and confirmation steps. No native
plugin or API contract changes are required. Physical Android/iOS keyboard and
system-bar checks remain device validation.

Validation after removing floating confirmation bars: Docker lint, all 1365 tests
in 165 files, production build and Capacitor sync for Android/iOS passed. Browser
checks at 320/360 px confirmed that the actions scroll with their forms, remain
reachable at the end and do not cause horizontal overflow, in light/dark themes.
Submitting an empty product form still focuses its first invalid field. In the
feeding editor, submitting without a change still shows its validation message.
The obsolete test for the removed floating-bar keyboard offsets was deleted.

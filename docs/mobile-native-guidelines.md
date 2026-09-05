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
ion-footer
```

`ion-content` normally owns scrolling.

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

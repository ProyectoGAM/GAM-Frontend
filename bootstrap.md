# GAM Frontend Bootstrap

## Recommended creation command

```bash
npm install -g @ionic/cli
ionic start GAM-Frontend blank --type=angular-standalone --capacitor
cd GAM-Frontend
```

Use the blank starter.

Do not start from tabs/menu unless the product navigation has already been designed around that pattern.

## Verify the generated project

```bash
ionic info
npm test -- --run
npm run build
ionic serve
```

## Capacitor application ID

Before adding native platforms, set a stable `appId` in `capacitor.config.ts`.

Example only:

```ts
const config: CapacitorConfig = {
  appId: 'dev.gyabisito.gam',
  appName: 'GAM',
  webDir: 'www',
};
```

Confirm the final production identifier before store publication.

## Android

After the web project builds correctly:

```bash
ionic cap add android
npx cap sync android
ionic cap open android
```

Android Studio and the required Android SDK/JDK tooling must be installed.

## iOS

Create/build the iOS target from macOS with Xcode:

```bash
ionic cap add ios
npx cap sync ios
ionic cap open ios
```

Do not block Windows development on iOS setup.

## Initial repository structure

```text
GAM-Frontend/
  AGENTS.md
  docs/
    architecture.md
    coding-standards.md
    mobile-native-guidelines.md
    testing.md
    api-integration.md
    adr/
      001-ionic-angular-capacitor.md
      002-feature-oriented-architecture.md
      003-native-capability-boundary.md
  src/
    app/
      core/
      shared/
      features/
      app.config.ts
      app.routes.ts
      app.ts
    environments/
    theme/
```

Do not create empty domain/application/data-access directories for every future feature.

Create them as real requirements appear.

## First technical milestone

Before implementing business modules:

1. clean starter page
2. configure environments
3. establish HTTP base configuration
4. establish global error policy
5. establish auth/session boundary
6. create app shell/navigation skeleton
7. confirm responsive phone layout
8. confirm Android build opens
9. lint/test/build green
10. commit baseline

Only then begin business features.

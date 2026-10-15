# Development Workflow

## Baseline validation

### Dependencias: exclusivamente dentro de Docker

Toda instalación, actualización, eliminación, resolución y auditoría de dependencias
debe ejecutarse dentro de Docker. No ejecutar `npm install`, `npm ci`, `npm update`,
`npm uninstall`, `npm audit` ni `npx` en el host. Usar el servicio `frontend` de
`compose.dev.yaml`; `package.json` y `package-lock.json` se actualizan mediante el
bind mount y `node_modules` permanece en su volumen Docker.

```bash
docker compose -f compose.dev.yaml exec -T frontend npm ci
docker compose -f compose.dev.yaml exec -T frontend npm install <paquete>
docker compose -f compose.dev.yaml exec -T frontend npm audit --omit=dev
docker compose -f compose.dev.yaml exec -T frontend npm run lint
docker compose -f compose.dev.yaml exec -T frontend npm run test:ci
docker compose -f compose.dev.yaml exec -T frontend npm run build
```

Los comandos npm/npx del resto de la documentación se entienden ejecutados dentro
del contenedor, también para Angular y Capacitor. La construcción de las etapas
`dependencies` y `verification` del Dockerfile también cumple esta regla.

Before feature work begins:

```bash
npm run lint
npm run test:ci
npm run build
npm audit --omit=dev
```

Expected production audit result:

```text
found 0 vulnerabilities
```

## Docker development

The backend and frontend remain separate sibling repositories. Start the
backend first so its `gam-dev_gam-dev` network and `gateway` service exist:

```bash
cd ../GAM-Backend
docker compose -f compose.dev.yaml up -d --build

cd ../GAM-Frontend
docker compose -f compose.dev.yaml up --build
```

The Angular development server is available at:

```text
http://localhost:4200
```

The source tree is bind-mounted for live reload. Dependencies and the Angular
cache use named volumes. When `package-lock.json` changes, the container runs
`npm ci` before starting Angular.

The frontend Compose project does not start, stop or modify backend services.
`GAM_BACKEND_NETWORK` may override the external network name when the backend
Compose project uses a non-default project name.

## Production-like web image

Build and run the optimized Angular application behind unprivileged Nginx:

```bash
docker compose up --build -d
```

The web application is available at `http://localhost:8081`. Nginx serves the
SPA and proxies `/api` and `/sanctum` to `http://gateway:8080`, keeping browser
authentication same-origin. `API_UPSTREAM` may override that internal URL for a
different deployment topology.

The web image does not build Android or iOS applications.

## Before coding

1. Read `AGENTS.md`.
2. Read relevant architecture docs.
3. Read `docs/design-colors.md` before UI work and use the central light/dark tokens.
4. Inspect the existing feature.
5. Keep the change inside the owning feature when possible.
6. Reuse existing services/components/types before creating new abstractions.

## During coding

Default feature structure:

```text
pages/
components/
services/
interfaces/
types/
```

Do not introduce extra architectural layers unless the feature clearly needs them.

## HTTP work

Use:

```text
Feature Service -> ApiClient
```

Do not:

- inject HttpClient in feature UI
- import environment.apiUrl in features
- duplicate API base URL handling

## Before finishing

Run:

```bash
npm run lint
npm run test:ci
npm run build
```

If Capacitor/native code changed:

```bash
npx cap sync
```

If dependencies changed:

```bash
npm audit
npm audit --omit=dev
```

## Dependency upgrades

Prefer framework-supported upgrade tools.

Angular:

```bash
npx ng update
```

Do not run `npm audit fix --force` blindly.

## Commit scope

Examples:

```text
chore: bootstrap Angular Ionic Capacitor frontend
docs: define frontend architecture and agent rules
feat(auth): implement mobile login flow
feat(production): add production list
refactor(api): centralize request options
```

Avoid mixing unrelated concerns in one commit.

For multi-login changes, run npm run lint, npm run test:ci, npm run build, npm audit --omit=dev and npx cap sync. Start the backend from `../GAM-Backend` with docker compose -f compose.dev.yaml up -d --build and run API checks through docker compose exec so PostgreSQL/Redis behavior is exercised.

# Frontend Security Baseline

## Dependency audit

Current expected result:

```text
npm audit --omit=dev
found 0 vulnerabilities
```

Development tooling currently reports a transitive advisory:

```text
@capacitor/cli
 -> xcode
 -> uuid < 11.1.1
```

Policy:

- do not downgrade Capacitor solely to silence audit
- do not force an incompatible transitive major override
- track upstream fixes
- keep `npm audit --omit=dev` clean

## Corrección de Zod — 26 de octubre de 2026

El aviso [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
afecta a Zod anterior a 4.6.6. El proyecto resolvía 4.6.5 tanto para
`@angular/forms` como para Angular CLI, que exigía esa versión exacta. Por eso
actualizar únicamente la dependencia transitiva no resolvía el problema.

Se ejecutó dentro de Docker el actualizador oficial:

```bash
docker compose -f compose.dev.yaml exec -T frontend npx ng update @angular/cli@22.2.4
```

La actualización deja CLI, builder y DevKit en 22.2.4, y alinea los paquetes del
framework, compilador y servicio de lenguaje en 22.2.3. El lockfile contiene una
sola versión de Zod, 4.6.6, compartida por Forms, CLI y sus dependencias MCP.
No se agregaron overrides ni dependencias directas de Zod. No cambiaron plugins
ni configuración nativa de Capacitor.

`npm audit --omit=dev` vuelve a dar **0 vulnerabilidades**. La auditoría completa
conserva nueve entradas de herramientas de desarrollo: `@angular/build`, Vite,
`source-map-js`, Vitest, `@vitest/mocker`, `fast-uri` y la cadena de Capacitor
CLI → xcode → uuid. Dos entradas son altas (`vite` y `source-map-js`); no se
declara limpia la auditoría completa ni se aplican downgrades o cambios ajenos
a esta corrección. Zod y las dependencias MCP actualizadas ya no figuran como
vulnerables.

Validación dentro de Docker: lint aprobado, 808 pruebas en 110 archivos aprobadas
y build de producción aprobado. La modificación conserva la arquitectura y los
flujos de la aplicación; no requiere sincronización de plugins nativos.

## Secrets

Never commit:

- API credentials
- private keys
- signing keys
- passwords
- production tokens
- service-account material

## Client trust

Frontend validation is UX, not a security boundary.

Authorization and business invariants must also be enforced by the backend.

## Storage

Do not assume localStorage is appropriate for sensitive native session material.

Session persistence must remain replaceable between web/native strategies.

## Logging

Do not log:

- passwords
- access tokens
- refresh tokens
- sensitive personal data
- authorization headers

## Native permissions

Request only permissions actually required by product functionality.

## Multi-login rules

- Never log passwords, PINs, PATs, device tokens or authorization headers.
- The four-digit PIN is always a string, so 0007 is preserved. Client validation is only UX; Laravel enforces eligibility and rate limits.
- Browser secrets are HttpOnly cookies. The secure-storage plugin is never used as a browser localStorage fallback.
- Shared mode is not trusted: every list, PIN login and operation is checked by the backend with the device credential and session context.
- Pairing codes and generated secrets are held only in memory in the relevant UI and are not persisted.

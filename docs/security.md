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

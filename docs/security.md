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

# Email-Only Authentication Removal Design

Date: 2026-07-07

## Goal

Cashier will support exactly one interactive login method: email verification code login through the existing OTP flow. OAuth/OIDC login and password login will be removed completely from application behavior, user-facing UI, configuration, tests, and persisted schema.

In this document, "email login" means the current two-step OTP flow:

1. User enters an email address.
2. Cashier sends a one-time verification code.
3. User enters the code and signs in through the `otp` Auth.js credentials provider.

## Non-Goals

- No changes to ledger, source document, task queue, AI parsing, currency, export, or API v1 behavior.
- No change to service credentials used by API v1 bearer authentication.
- No replacement login mechanism such as password reset links, magic links, passkeys, or third-party SSO.
- No data migration that attempts to convert OAuth-only users into email users. Existing users must have a usable email address to continue signing in.

## Current State

- `src/auth.ts` registers three possible login providers:
  - optional `oidc` OAuth/OIDC provider, configured by `OIDC_*` env vars;
  - `otp` credentials provider for email verification code login;
  - `password` credentials provider for email plus password login.
- `src/modules/auth/ui/login-page.tsx` renders OTP and password login modes.
- `src/modules/auth/ui/email-step.tsx` can render an SSO section when `NEXT_PUBLIC_OIDC_ENABLED` is true.
- Account settings render a password management section through `PasswordForm`.
- `src/persistence/schema/auth.ts` contains:
  - `accounts`, the Auth.js OAuth/OIDC account-linking table;
  - `users.passwordHash`, the password login hash column;
  - `otpTokens`, the OTP verification table.
- Env validation and docs still expose OIDC-related settings.

## Target Behavior

- Login page always shows only the email verification code flow.
- Auth.js registers only the `otp` credentials provider.
- Calling `signIn("password", ...)` or `signIn("oidc", ...)` is no longer supported because those providers do not exist.
- Account settings continue to show email management, service credentials, export, and danger zone sections.
- Account settings no longer show password status, set password, or change password controls.
- Session user shape no longer includes `hasPassword`.
- Startup env validation no longer recognizes or requires OIDC settings.
- Public browser env no longer includes OIDC feature flags or labels.
- Database schema no longer defines the `accounts` table or `users.passwordHash`.

## Database Design

### Remove `accounts`

The `accounts` table exists for OAuth/OIDC account linking in Auth.js. It maps an external provider account such as `oidc` to a local `users.id` and may store OAuth tokens such as access, refresh, and ID tokens.

Email OTP login does not need this table. Removing OAuth/OIDC removes the only current consumer, so the table will be dropped.

### Remove `users.password_hash`

The `password_hash` column exists only for password login and password management. Email OTP login does not need a stored password verifier, so the column will be removed from the Drizzle schema and from the database.

### Migration

Add a forward migration after the current latest migration:

```sql
DROP TABLE `accounts`;
ALTER TABLE `users` DROP COLUMN `password_hash`;
```

The implementation must verify SQLite compatibility in the project runtime. If the local SQLite version or Drizzle migration flow rejects `DROP COLUMN`, use the standard SQLite table-rebuild migration pattern for `users` while preserving all non-password columns and constraints.

The migration is intentionally destructive. Existing OAuth account links and password hashes are discarded.

## Code Design

### Auth Runtime

Update `src/auth.ts` to:

- remove OAuth imports, `OIDCProfile`, and `OIDCProvider`;
- remove the Drizzle adapter `accountsTable` wiring;
- keep only the `usersTable` adapter wiring if still required by Auth.js events;
- remove `authenticateWithPassword` import and the `password` credentials provider;
- remove `hasPassword` from session construction and NextAuth module augmentation.

Keep the existing OTP provider behavior, registration policy, user-created event, user-signed-in event, JWT/session callbacks, and session max-age settings.

### Login UI

Update the login flow to model only the OTP flow:

- remove `LoginMode`, password state, password errors, password loading, `setMode`, and `handlePasswordLogin` from `useLoginFlow`;
- remove the OTP/password segmented control from `AuthLoginPage`;
- remove `PasswordStep` from rendering and exports;
- remove SSO rendering from `EmailStep`;
- remove `SSOButton`.

The first screen remains the email input. After sending an OTP, the existing OTP entry screen remains unchanged.

### Account Settings

Update `SettingsTab` and auth UI exports to:

- remove `PasswordForm`;
- remove the password settings section and related session `hasPassword` checks;
- keep `ChangeEmailForm`, `ClearDataForm`, and `DeleteAccountForm`, because those actions are OTP-protected and still match email-only authentication.

### Auth Module Cleanup

Remove password-only files and exports:

- password service and password policy;
- authenticate-with-password use case;
- set-password and change-password use cases;
- set-password and change-password server actions;
- password login and password management UI.

Remove password-only error codes and translations when they no longer have consumers. Keep `INVALID_CREDENTIALS` only if an OTP/Auth.js error path still needs it; otherwise remove it too.

### Environment Cleanup

Remove OIDC settings from:

- `RuntimeEnv` and `runtimeEnv`;
- `PublicEnv` and `publicEnv`;
- startup validation fields and cross-field OIDC checks;
- `ENV_DEFAULTS`;
- env catalog;
- `.env.example`;
- architecture docs and README references.

`AUTH_URL` remains because Auth.js still uses it for callback and redirect URL handling.

## Test Design

Use TDD during implementation. The first failing tests should cover the behavior being removed:

- Auth config registers only the OTP provider and never registers OIDC or password providers.
- Login page renders email login only and does not render password or SSO controls.
- Account settings no longer renders password management controls.
- Schema tests or migration checks confirm `accounts` and `password_hash` are absent from the current schema.
- Env validation no longer accepts OIDC-specific configuration as first-class app settings.

Delete or rewrite tests that only verify removed password behavior:

- password login integration tests;
- set password and change password integration tests;
- password service and password policy unit tests;
- OIDC provider label tests.

Keep and run OTP, registration, email change, data clear, delete account, auth helper, and session tests.

## Verification

Minimum verification before completion:

```bash
npm run lint
npm run tsc
npm run test:unit
npm run test:integration
npm run validate:i18n
```

If the migration changes generated Drizzle metadata, also verify the migration path against a local SQLite database.

## Risks

- This is a destructive auth migration. Existing OAuth-only users will lose their provider links, and existing passwords will no longer work.
- If any deployed database relies on the `accounts` table for historical auditing, that data will be removed.
- SQLite `DROP COLUMN` support depends on the runtime version; the implementation may need a table rebuild migration.
- Auth.js adapter behavior must be checked after removing `accountsTable`; if the adapter requires an accounts table even without OAuth providers, the implementation should remove the adapter only if OTP sign-in and user lifecycle behavior still work, or keep a minimal compatible path without exposing OAuth login.

## Acceptance Criteria

- There is no OAuth/OIDC login path in UI, Auth.js provider config, env validation, env examples, or docs.
- There is no password login or password management path in UI, Auth.js provider config, auth module exports, server actions, or use cases.
- `src/persistence/schema/auth.ts` no longer exports `accounts` or `passwordHash`.
- A migration removes `accounts` and `users.password_hash`.
- Tests and translations no longer reference removed OAuth or password auth behavior except in historical docs under `docs/superpowers`.
- Email OTP login, registration policy, change email, clear data, delete account, session loading, and protected routes continue to pass tests.

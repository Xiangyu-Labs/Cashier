# Task 2: Local-Only Development Auth Bypass – Completion Report

## Files Created
- `src/modules/auth/dev-auth.ts` – Guard helper (`isDevAuthBypassEnabled`, `DEV_AUTH_EMAIL`, `DEV_AUTH_NAME`)
- `src/modules/auth/application/use-cases/authenticate-dev-user.ts` – Use case that finds/creates the deterministic dev user and resolves the single ledger
- `tests/unit/auth/application/use-cases/authenticate-dev-user.test.ts` – Tests for dev auth use case (4 tests)

## Files Modified
- `src/auth.ts` – Added conditional "dev" credentials provider (pushed after OTP provider when bypass is enabled)
- `src/lib/env/startup.ts` – Added `DEV_AUTH_BYPASS` and `NEXT_PUBLIC_DEV_AUTH_BYPASS` defaults and validation
- `src/lib/env/runtime.ts` – Added `devAuthBypass` boolean accessor
- `src/lib/env/public.ts` – Added `devAuthBypass` public getter (checks `NODE_ENV !== "production"`)
- `src/modules/auth/hooks/use-login-flow.ts` – Added `isDevAuthAvailable` and `handleDevSignIn` to hook return
- `src/modules/auth/ui/login-page.tsx` – Rendered subdued dev sign-in button when available
- `messages/en.json` – Added `devSignIn`, `devSignInDesc`, `devSignInFailed` keys
- `tests/unit/auth/auth-config.test.ts` – Added test for dev provider registration; updated existing test env vars
- `tests/unit/modules/auth/ui/login-page.test.tsx` – Converted to mutable mock pattern; added dev sign-in rendering test

## Test Results
- **Files:** 5 passed (5 total)
- **Tests:** 16 passed (16 total)
- Output pristine: no warnings

## Key Decisions
- Used `vi.hoisted` mutable mock pattern for login page test to allow per-test return value overrides
- The dev provider is conditionally pushed **after** the OTP provider in the providers array
- `isDevAuthBypassEnabled()` guards on `NODE_ENV !== "production" && DEV_AUTH_BYPASS === "true"`
- `publicEnv.devAuthBypass` uses `process.env.NODE_ENV` (build-time safe) instead of runtime env to avoid leaking secrets to the client

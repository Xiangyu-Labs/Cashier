# Docs And Env Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicated environment-variable documentation and centralize application env access behind typed modules so docs, validation, and runtime behavior stop drifting apart.

**Architecture:** Keep one configuration source of truth in `.env.example`, `src/lib/env/catalog.ts`, and `src/lib/env/startup.ts`. Replace prose env tables with pointers to those sources, then move runtime and client env reads into dedicated accessor modules under `src/lib/env/`.

**Tech Stack:** TypeScript, Zod, Next.js, Vitest governance tests

---

## File Map

- Modify: `README.md` - replace the manual env section with source-of-truth pointers.
- Modify: `CLAUDE.md` - remove the hand-maintained environment variable table.
- Modify: `tests/unit/docs/living-reference-docs.test.ts` - add a governance assertion that prose docs do not maintain parallel env tables.
- Create: `src/lib/env/runtime.ts` - typed runtime env accessor built from startup validation.
- Create: `src/lib/env/public.ts` - centralized access for `NEXT_PUBLIC_*` browser config.
- Modify: `src/auth.ts`
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/db/index.ts`
- Modify: `src/lib/ai/openai-client.ts`
- Modify: `src/lib/logger.ts`
- Modify: `src/lib/ratelimit.ts`
- Modify: `src/lib/storage/image-processing.ts`
- Modify: `src/lib/storage/local.ts`
- Modify: `src/lib/utils/ip.ts`
- Modify: `src/modules/auth/application/use-cases/registration-policy.ts`
- Modify: `src/modules/auth/application/use-cases/send-otp.ts`
- Modify: `src/modules/auth/services/notifications.ts`
- Modify: `src/modules/auth/services/otp.ts`
- Modify: `src/modules/auth/services/otp-rate-limit.ts`
- Modify: `src/modules/auth/ui/email-step.tsx`
- Modify: `src/modules/auth/ui/sso-button.tsx`
- Modify: `src/modules/ledger/application/use-cases/export-ledger-entries.ts`
- Modify: `tests/unit/lib/env/catalog.test.ts`
- Create: `tests/unit/lib/env/runtime.test.ts`

### Task 1: Remove parallel env-variable tables from prose docs

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `tests/unit/docs/living-reference-docs.test.ts`

- [ ] **Step 1: Write the failing governance test**

```ts
import { readFileSync } from "node:fs";

it("does not keep manual environment variable sections in README or CLAUDE", () => {
  const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
  const claude = readFileSync(path.join(process.cwd(), "CLAUDE.md"), "utf8");

  expect(readme).not.toMatch(/^### Environment Variables$/m);
  expect(claude).not.toMatch(/^### Environment Variables$/m);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/docs/living-reference-docs.test.ts`

Expected: FAIL because both files still keep hand-maintained env sections.

- [ ] **Step 3: Replace the manual sections with source-of-truth pointers**

```md
### Configuration

Copy `.env.example` to `.env.local` and fill in the values you need.

- Canonical key list and descriptions: `src/lib/env/catalog.ts`
- Startup validation rules: `src/lib/env/startup.ts`
- Example defaults and comments: `.env.example`
```

Implementation notes:

- Keep one short setup example (`cp .env.example .env.local`).
- Do not duplicate concrete key lists in `README.md` or `CLAUDE.md`.
- Leave `docs/architecture/coding-patterns.md` as the durable rule source.

- [ ] **Step 4: Run the targeted governance test**

Run: `npm run test:unit -- tests/unit/docs/living-reference-docs.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md tests/unit/docs/living-reference-docs.test.ts
git commit -m "docs: remove duplicated env tables"
```

### Task 2: Centralize runtime and public env access

**Files:**
- Create: `src/lib/env/runtime.ts`
- Create: `src/lib/env/public.ts`
- Modify: `src/auth.ts`
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/db/index.ts`
- Modify: `src/lib/ai/openai-client.ts`
- Modify: `src/lib/logger.ts`
- Modify: `src/lib/ratelimit.ts`
- Modify: `src/lib/storage/image-processing.ts`
- Modify: `src/lib/storage/local.ts`
- Modify: `src/lib/utils/ip.ts`
- Modify: `src/modules/auth/application/use-cases/registration-policy.ts`
- Modify: `src/modules/auth/application/use-cases/send-otp.ts`
- Modify: `src/modules/auth/services/notifications.ts`
- Modify: `src/modules/auth/services/otp.ts`
- Modify: `src/modules/auth/services/otp-rate-limit.ts`
- Modify: `src/modules/auth/ui/email-step.tsx`
- Modify: `src/modules/auth/ui/sso-button.tsx`
- Modify: `src/modules/ledger/application/use-cases/export-ledger-entries.ts`
- Modify: `tests/unit/lib/env/catalog.test.ts`
- Create: `tests/unit/lib/env/runtime.test.ts`

- [ ] **Step 1: Write the failing env-governance test**

```ts
it("only reads application env keys through src/lib/env", () => {
  const offenders: string[] = [];

  for (const file of collectSourceFiles(path.resolve("src"))) {
    if (file.includes("/lib/env/")) continue;
    if (file.endsWith("instrumentation.ts")) continue;

    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const key = match[1];
      if (key != null && !FRAMEWORK_ENV_KEYS.has(key)) {
        offenders.push(`${path.relative(process.cwd(), file)}:${key}`);
      }
    }
  }

  expect(offenders).toEqual([]);
});
```

- [ ] **Step 2: Run the env tests to verify they fail**

Run: `npm run test:unit -- tests/unit/lib/env/catalog.test.ts tests/unit/lib/env/runtime.test.ts`

Expected: FAIL because runtime and client code still read `process.env.*` directly in multiple places.

- [ ] **Step 3: Create typed env accessors and refactor the high-drift call sites**

```ts
// src/lib/env/runtime.ts
import { validateStartupEnv } from "./startup";

const env = validateStartupEnv();

export const runtimeEnv = {
  databaseUrl: env.DATABASE_URL,
  authUrl: env.AUTH_URL,
  sessionMaxAgeDays: env.SESSION_MAX_AGE_DAYS,
  otpExpiresSeconds: env.OTP_EXPIRES_SECONDS,
  otpLockoutMinutes: env.OTP_LOCKOUT_MINUTES,
  otpMaxAttempts: env.OTP_MAX_ATTEMPTS,
  otpResendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
  authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
  authRateLimitWindow: env.AUTH_RATE_LIMIT_WINDOW,
} as const;

// src/lib/env/public.ts
export const publicEnv = {
  oidcEnabled: process.env.NEXT_PUBLIC_OIDC_ENABLED === "true",
  oidcButtonName: process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME ?? "SSO",
} as const;
```

Then refactor examples:

```ts
// src/lib/db/index.ts
const sqlitePath = runtimeEnv.databaseUrl.replace(/^file:/, "");

// src/modules/auth/services/otp-rate-limit.ts
const SEND_MAX_ATTEMPTS = runtimeEnv.authRateLimitMax;
const SEND_WINDOW_SECONDS = runtimeEnv.authRateLimitWindow;

// src/modules/auth/ui/email-step.tsx
const isSSOEnabled = publicEnv.oidcEnabled;
```

Implementation notes:

- Keep framework env reads like `NODE_ENV` and `NEXT_RUNTIME` out of this rule.
- Do not add a second validation layer; `runtime.ts` should consume `validateStartupEnv()`.
- Refactor every current application-managed env read that the governance test surfaces, including `AUTH_*`, `OPENAI_*`, `LOCAL_STORAGE_PATH`, `MAX_*`, `API_RATE_LIMIT_PER_MINUTE`, `TRUSTED_PROXY`, `LOG_LEVEL`, `DISABLE_REGISTRATION`, and `EXPORT_MAX_ENTRIES`.

- [ ] **Step 4: Run the targeted env tests**

Run: `npm run test:unit -- tests/unit/lib/env/catalog.test.ts tests/unit/lib/env/runtime.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env/runtime.ts src/lib/env/public.ts src/auth.ts src/lib/constants.ts src/lib/db/index.ts src/lib/ai/openai-client.ts src/lib/logger.ts src/lib/ratelimit.ts src/lib/storage/image-processing.ts src/lib/storage/local.ts src/lib/utils/ip.ts src/modules/auth/application/use-cases/registration-policy.ts src/modules/auth/application/use-cases/send-otp.ts src/modules/auth/services/notifications.ts src/modules/auth/services/otp.ts src/modules/auth/services/otp-rate-limit.ts src/modules/auth/ui/email-step.tsx src/modules/auth/ui/sso-button.tsx src/modules/ledger/application/use-cases/export-ledger-entries.ts tests/unit/lib/env/catalog.test.ts tests/unit/lib/env/runtime.test.ts
git commit -m "refactor: centralize application env access"
```

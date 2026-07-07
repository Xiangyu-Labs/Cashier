# Email-Only Auth Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove OAuth/OIDC login and password login completely so Cashier supports only email verification code login.

**Architecture:** Keep the existing OTP use case as the single authentication entry point. Remove Auth.js database adapter usage because OTP credentials login creates and loads users through Cashier's own auth module. Remove OAuth/password schema objects through a destructive Drizzle migration.

**Tech Stack:** Next.js 16, Auth.js/NextAuth v5 credentials provider, Drizzle ORM, SQLite, Vitest, React Testing Library, next-intl message catalogs.

---

## File Structure

Auth runtime:
- Modify: `src/auth.ts` to register only the `otp` credentials provider and remove Auth.js adapter wiring.
- Modify: `src/modules/auth/application/queries/get-session-user.ts` to return only session fields.
- Modify: `src/modules/auth/use-cases.ts` and `src/modules/auth/actions.ts` to stop exporting password use cases/actions.
- Modify: `src/modules/auth/errors.ts` to keep only OTP, registration, and OTP-protected account action errors.

Login UI:
- Modify: `src/modules/auth/hooks/use-login-flow.ts` to model only email and OTP steps.
- Modify: `src/modules/auth/ui/login-page.tsx` to remove mode switching.
- Modify: `src/modules/auth/ui/email-step.tsx` to remove SSO rendering.
- Modify: `src/modules/auth/ui/index.ts` to stop exporting password UI.
- Delete: `src/modules/auth/ui/password-step.tsx`.
- Delete: `src/modules/auth/ui/sso-button.tsx`.

Password module removal:
- Delete: `src/modules/auth/ui/PasswordForm.tsx`.
- Delete: `src/modules/auth/services/password.ts`.
- Delete: `src/modules/auth/services/password-policy.ts`.
- Delete: `src/modules/auth/application/use-cases/authenticate-with-password.ts`.
- Delete: `src/modules/auth/application/use-cases/set-password.ts`.
- Delete: `src/modules/auth/application/use-cases/change-password.ts`.
- Delete: `src/modules/auth/server-actions/set-password.ts`.
- Delete: `src/modules/auth/server-actions/change-password.ts`.

Account settings:
- Modify: `src/modules/ledger/ui/SettingsTab.tsx` to remove password management.

Schema and migrations:
- Modify: `src/persistence/schema/auth.ts` to remove `accounts` and `passwordHash`.
- Modify: `src/persistence/relations.ts` to remove `accountsRelations` and `users.accounts`.
- Create: `src/persistence/migrations/0033_email_only_auth_removal.sql` using Drizzle generation.
- Create: `src/persistence/migrations/meta/0033_snapshot.json` using Drizzle generation.
- Modify: `src/persistence/migrations/meta/_journal.json` using Drizzle generation.
- Modify: `tests/setup.ts` to stop truncating `accounts`.

Environment and docs:
- Modify: `src/lib/env/runtime.ts`, `src/lib/env/public.ts`, `src/lib/env/startup.ts`, `src/lib/env/defaults.ts`, and `src/lib/env/catalog.ts` to remove OIDC env keys.
- Modify: `.env.example`, `README.md`, and `docs/architecture/PRD.md`.
- Modify: `messages/en.json` and `messages/zh.json`.
- Modify: `package.json` and `package-lock.json` to remove unused `@auth/drizzle-adapter`, `bcryptjs`, and `@types/bcryptjs`.

Tests:
- Modify: `tests/unit/auth/auth-config.test.ts`.
- Modify: `tests/unit/auth/auth-events.test.ts`.
- Modify: `tests/unit/auth/application/queries/get-session-user.test.ts`.
- Modify: `tests/unit/modules/auth/ui/login-page.test.tsx`.
- Create: `tests/unit/modules/auth/ui/email-step.test.tsx`.
- Create: `tests/unit/modules/ledger/ui/settings-tab-auth.test.tsx`.
- Modify: env tests under `tests/unit/lib/env/*.test.ts`.
- Create: `tests/unit/auth/schema-email-only.test.ts`.
- Delete password-only tests:
  - `tests/integration/auth/password-login.test.ts`
  - `tests/integration/auth/set-password.test.ts`
  - `tests/integration/auth/change-password.test.ts`
  - `tests/unit/auth/services/password.test.ts`

---

### Task 1: Auth Runtime Red Tests

**Files:**
- Modify: `tests/unit/auth/auth-config.test.ts`
- Modify: `tests/unit/auth/auth-events.test.ts`
- Modify: `tests/unit/auth/application/queries/get-session-user.test.ts`

- [ ] **Step 1: Replace `tests/unit/auth/auth-config.test.ts` with failing expectations**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { nextAuthMock } = vi.hoisted(() => ({
  nextAuthMock: vi.fn((config: unknown) => ({
    config,
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock("next-auth", () => ({
  default: nextAuthMock,
}));

vi.mock("@/modules/auth/use-cases", () => ({
  authenticateWithOTP: vi.fn(),
  handleAuthUserCreated: vi.fn(),
  handleAuthUserSignedIn: vi.fn(),
  isAuthSignInAllowed: vi.fn(async () => true),
}));

vi.mock("@/modules/auth/queries", () => ({
  getSessionUser: vi.fn(async (id: string) => ({
    id,
    email: "test@example.com",
    name: "Test User",
    image: null,
  })),
}));

describe("auth runtime config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.OIDC_ISSUER = "https://sso.cashier.test";
    process.env.OIDC_CLIENT_ID = "cashier-web";
    process.env.OIDC_CLIENT_SECRET = "top-secret";
    process.env.NEXT_PUBLIC_OIDC_ENABLED = "true";
    process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME = "Cashier SSO";
  });

  it("preserves resolved auth pages", async () => {
    vi.doUnmock("@/auth");

    const authModule = await import("@/auth");

    expect(authModule.authOptions.pages).toEqual({
      signIn: "/login",
      verifyRequest: "/login/verify",
      error: "/login/error",
    });

    expect(nextAuthMock).toHaveBeenCalledTimes(1);
  });

  it("registers only the email OTP credentials provider and no database adapter", async () => {
    vi.doUnmock("@/auth");

    await import("@/auth");

    const config = nextAuthMock.mock.calls[0]?.[0] as
      | {
          adapter?: unknown;
          providers?: Array<{ id?: string; name?: string; type?: string }>;
        }
      | undefined;

    expect(config?.adapter).toBeUndefined();
    expect(config?.providers).toHaveLength(1);
    expect(config?.providers?.[0]).toMatchObject({
      id: "otp",
      name: "OTP",
      type: "credentials",
    });
    expect(config?.providers?.map((provider) => provider.id)).toEqual(["otp"]);
  });
});
```

- [ ] **Step 2: Update `tests/unit/auth/auth-events.test.ts` expected session shape**

Remove the `@auth/drizzle-adapter` mock and remove `accounts` from the auth schema mock:

```ts
vi.mock("@/persistence/schema/auth", () => ({
  users: {},
}));
```

In the session hydration test, replace the expected object with:

```ts
expect(result).toEqual({
  user: {
    id: "db-user",
    email: "db@example.com",
    name: "DB User",
    image: "db-image",
  },
});
```

- [ ] **Step 3: Update `getSessionUser` unit test expectation**

In `tests/unit/auth/application/queries/get-session-user.test.ts`, replace the active-user expectation with:

```ts
expect(result).toEqual({
  id: userId,
  email: "session-active@example.com",
  name: "Session Active",
  image: "https://example.com/avatar.png",
});
```

- [ ] **Step 4: Run auth runtime red tests**

Run:

```bash
npm run test:unit -- tests/unit/auth/auth-config.test.ts tests/unit/auth/auth-events.test.ts tests/unit/auth/application/queries/get-session-user.test.ts
```

Expected: FAIL because `src/auth.ts` still registers password/OIDC providers, still configures an adapter, and session data still includes `hasPassword` or `passwordHash`.

---

### Task 2: Auth Runtime Implementation

**Files:**
- Modify: `src/auth.ts`
- Modify: `src/modules/auth/application/queries/get-session-user.ts`
- Modify: `tests/unit/auth/auth-events.test.ts`

- [ ] **Step 1: Replace `src/auth.ts` with OTP-only runtime**

```ts
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import {
  authenticateWithOTP,
  handleAuthUserCreated,
  handleAuthUserSignedIn,
  isAuthSignInAllowed,
} from "@/modules/auth/use-cases";
import { getSessionUser } from "@/modules/auth/queries";
import { TIME_SECONDS } from "@/lib/constants";
import { runtimeEnv } from "@/lib/env/runtime";

export const authOptions = {
  ...authConfig,
  providers: [
    Credentials({
      id: "otp",
      name: "OTP",
      credentials: {
        email: { type: "email" },
        otp: { type: "text" },
        locale: { type: "text" },
      },
      async authorize(credentials, request) {
        if (
          credentials?.email == null ||
          credentials.email === "" ||
          credentials?.otp == null ||
          credentials.otp === ""
        ) {
          return null;
        }

        if (typeof credentials.email !== "string" || typeof credentials.otp !== "string") {
          return null;
        }

        return authenticateWithOTP({
          email: credentials.email,
          otp: credentials.otp,
          locale: typeof credentials.locale === "string" ? credentials.locale : "zh",
          requestHeaders: request.headers,
        });
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: runtimeEnv.sessionMaxAgeDays * TIME_SECONDS.DAY,
    updateAge: TIME_SECONDS.DAY,
  },
  pages: authConfig.pages,
  events: {
    async createUser({ user }) {
      await handleAuthUserCreated(user.id != null ? { userId: user.id } : {});
    },
    async signIn({ user, isNewUser }) {
      await handleAuthUserSignedIn({
        ...(user.id != null ? { userId: user.id } : {}),
        ...(user.email != null ? { email: user.email } : {}),
        ...(typeof user.locale === "string" ? { locale: user.locale } : {}),
        ...(isNewUser != null ? { isNewUser } : {}),
      });
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      return isAuthSignInAllowed(user.email != null ? { email: user.email } : {});
    },
    async jwt({ token, user }) {
      if (user != null && user.id != null && user.id !== "") {
        token.id = user.id;
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub != null && token.sub !== "" && session.user != null) {
        const dbUser = await getSessionUser(token.sub);

        return {
          ...session,
          user: {
            ...session.user,
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image,
          },
        };
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    locale?: string | null;
  }
}
```

- [ ] **Step 2: Replace `getSessionUser` return shape**

```ts
import { and, eq, isNull } from "drizzle-orm";
import { UnauthorizedError } from "@/lib/errors";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";

export async function getSessionUser(userId: string): Promise<{
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}> {
  const dbUser = await db.query.users.findFirst({
    where: and(eq(users.id, userId), isNull(users.deletedAt)),
    columns: { id: true, email: true, name: true, image: true },
  });

  if (dbUser == null) {
    throw new UnauthorizedError("User not found in database");
  }

  return dbUser;
}
```

- [ ] **Step 3: Run auth runtime tests**

Run:

```bash
npm run test:unit -- tests/unit/auth/auth-config.test.ts tests/unit/auth/auth-events.test.ts tests/unit/auth/application/queries/get-session-user.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit auth runtime cleanup**

```bash
git add src/auth.ts src/modules/auth/application/queries/get-session-user.ts tests/unit/auth/auth-config.test.ts tests/unit/auth/auth-events.test.ts tests/unit/auth/application/queries/get-session-user.test.ts
git commit -m "refactor: keep only otp auth runtime"
```

---

### Task 3: Login UI Red Tests

**Files:**
- Modify: `tests/unit/modules/auth/ui/login-page.test.tsx`
- Create: `tests/unit/modules/auth/ui/email-step.test.tsx`

- [ ] **Step 1: Replace login page tests**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthLoginPage } from "@/modules/auth/ui/login-page";

vi.mock("@/modules/auth/hooks/use-login-flow", () => ({
  useLoginFlow: () => ({
    callbackUrl: "/",
    step: "email",
    email: "",
    otp: "",
    isLoading: false,
    error: null,
    expiresAt: null,
    canResendAt: null,
    setEmail: vi.fn(),
    setOtp: vi.fn(),
    handleSendOTP: vi.fn(),
    handleVerifyOTP: vi.fn(),
    handleResendOTP: vi.fn(),
    handleChangeEmail: vi.fn(),
    handleOTPExpired: vi.fn(),
  }),
}));

describe("AuthLoginPage", () => {
  it("renders email login only", () => {
    render(<AuthLoginPage />);

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送验证码" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "密码" })).not.toBeInTheDocument();
    expect(screen.queryByText("邮箱登录")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Add email step SSO removal test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmailStep } from "@/modules/auth/ui/email-step";

vi.mock("@/lib/env/public", () => ({
  publicEnv: {
    appUrl: "http://localhost:3000",
    oidcEnabled: true,
    oidcButtonName: "Cashier SSO",
  },
}));

describe("EmailStep", () => {
  it("does not render SSO controls even when old OIDC env is present", () => {
    render(
      <EmailStep
        callbackUrl="/"
        email=""
        isLoading={false}
        error={null}
        onEmailChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.queryByText("或使用以下方式")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cashier SSO" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SSO 登录" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run login UI red tests**

Run:

```bash
npm run test:unit -- tests/unit/modules/auth/ui/login-page.test.tsx tests/unit/modules/auth/ui/email-step.test.tsx
```

Expected: FAIL because the password tab and SSO section still render.

---

### Task 4: Login UI Implementation

**Files:**
- Modify: `src/modules/auth/hooks/use-login-flow.ts`
- Modify: `src/modules/auth/ui/login-page.tsx`
- Modify: `src/modules/auth/ui/email-step.tsx`
- Modify: `src/modules/auth/ui/index.ts`
- Delete: `src/modules/auth/ui/password-step.tsx`
- Delete: `src/modules/auth/ui/sso-button.tsx`

- [ ] **Step 1: Replace `use-login-flow.ts` with OTP-only hook**

Use this shape: remove `LoginMode`, `password`, `passwordError`, `isPasswordLoading`, `setPassword`, `setMode`, and `handlePasswordLogin`. Keep `sanitizeCallbackUrl`, `getSignInErrorMessage`, OTP send, OTP verify, resend, change email, and expiry handling.

```ts
type LoginStep = "email" | "otp";

interface UseLoginFlowReturn {
  callbackUrl: string;
  step: LoginStep;
  email: string;
  otp: string;
  isLoading: boolean;
  error: string | null;
  expiresAt: number | null;
  canResendAt: number | null;
  setEmail: (email: string) => void;
  setOtp: (otp: string) => void;
  handleSendOTP: (e: React.FormEvent) => Promise<void>;
  handleVerifyOTP: () => Promise<void>;
  handleResendOTP: () => Promise<void>;
  handleChangeEmail: () => void;
  handleOTPExpired: () => void;
}
```

Keep the `signIn("otp", ...)` call exactly as the current OTP path uses it.

- [ ] **Step 2: Replace `AuthLoginPage` rendering**

```tsx
"use client";
import { useTranslations } from "next-intl";
import { Mail, KeyRound } from "lucide-react";
import { useLoginFlow } from "../hooks/use-login-flow";
import { EmailStep } from "./email-step";
import { OtpStep } from "./otp-step";

export function AuthLoginPage() {
  const t = useTranslations("Auth");
  const {
    callbackUrl,
    step,
    email,
    otp,
    isLoading,
    error,
    expiresAt,
    canResendAt,
    setEmail,
    setOtp,
    handleSendOTP,
    handleVerifyOTP,
    handleResendOTP,
    handleChangeEmail,
    handleOTPExpired,
  } = useLoginFlow(t);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            {step === "email" ? (
              <Mail className="w-8 h-8 text-primary" />
            ) : (
              <KeyRound className="w-8 h-8 text-primary" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-text">
            {step === "email" ? t("welcomeBack") : t("verifyCode")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {step === "email" ? t("welcomeBackDesc") : t("verifyCodeDesc", { email })}
          </p>
        </div>

        <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
          {step === "email" ? (
            <EmailStep
              callbackUrl={callbackUrl}
              email={email}
              isLoading={isLoading}
              error={error}
              onEmailChange={setEmail}
              onSubmit={handleSendOTP}
            />
          ) : (
            <OtpStep
              otp={otp}
              isLoading={isLoading}
              error={error}
              expiresAt={expiresAt}
              canResendAt={canResendAt}
              onOtpChange={setOtp}
              onVerify={handleVerifyOTP}
              onResend={handleResendOTP}
              onChangeEmail={handleChangeEmail}
              onExpired={handleOTPExpired}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Remove SSO from `email-step.tsx`**

Remove these imports:

```ts
import { publicEnv } from "@/lib/env/public";
import { SSOButton } from "./sso-button";
```

Remove `<SSOSection callbackUrl={callbackUrl} />` from the component body. Keep `callbackUrl` in props for now because `AuthLoginPage` passes it and this preserves the current component API during the task.

Delete the `SSOSection` function from the bottom of the file.

- [ ] **Step 4: Update UI exports and delete removed UI files**

In `src/modules/auth/ui/index.ts`, remove:

```ts
export { PasswordForm } from "./PasswordForm";
```

Delete:

```bash
rm src/modules/auth/ui/password-step.tsx src/modules/auth/ui/sso-button.tsx
```

- [ ] **Step 5: Run login UI tests**

Run:

```bash
npm run test:unit -- tests/unit/modules/auth/ui/login-page.test.tsx tests/unit/modules/auth/ui/email-step.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit login UI cleanup**

```bash
git add src/modules/auth/hooks/use-login-flow.ts src/modules/auth/ui/login-page.tsx src/modules/auth/ui/email-step.tsx src/modules/auth/ui/index.ts tests/unit/modules/auth/ui/login-page.test.tsx tests/unit/modules/auth/ui/email-step.test.tsx
git add -u src/modules/auth/ui/password-step.tsx src/modules/auth/ui/sso-button.tsx
git commit -m "refactor: remove password and sso login ui"
```

---

### Task 5: Account Settings Red Test

**Files:**
- Create: `tests/unit/modules/ledger/ui/settings-tab-auth.test.tsx`

- [ ] **Step 1: Add settings test showing password controls must disappear**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Ledger } from "@/modules/ledger/contracts";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({
    data: {
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        image: null,
        hasPassword: true,
      },
    },
  }),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ledger/ledger-1/settings",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

vi.mock("@/components/ui/pull-to-refresh", () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/modules/ledger/hooks", () => ({
  useLedgerSettings: () => ({
    ledger: null,
    categories: [],
    uncategorizedCount: 0,
    credentials: [],
    updateLedgerMutation: { mutate: vi.fn() },
    isPending: false,
  }),
  useAutoCategorizeMutation: () => ({ mutateAsync: vi.fn() }),
  useCategoryMutations: () => ({
    createCategory: { mutate: vi.fn() },
    updateCategory: { mutate: vi.fn() },
    deleteCategory: { mutate: vi.fn() },
    reorderCategories: { mutate: vi.fn() },
    categoryCreatedTrigger: 0,
  }),
  useCredentialMutations: () => ({
    createCredential: { mutateAsync: vi.fn() },
    deleteCredential: { mutate: vi.fn() },
  }),
}));

vi.mock("@/modules/auth/ui", () => ({
  ChangeEmailForm: () => <button type="button">Change email</button>,
  PasswordForm: () => <button type="button">Change Password</button>,
  ClearDataForm: () => <button type="button">Clear data</button>,
  DeleteAccountForm: () => <button type="button">Delete account</button>,
}));

vi.mock("@/modules/ledger/ui/CurrencySection", () => ({
  CurrencySection: () => <div>Currency section</div>,
}));

vi.mock("@/modules/ledger/ui/CategorySection", () => ({
  CategorySection: () => <div>Category section</div>,
}));

vi.mock("@/modules/ledger/ui/ServiceCredentialSection", () => ({
  ServiceCredentialSection: () => <div>Service credentials</div>,
}));

vi.mock("@/modules/ledger/ui/ExportSection", () => ({
  ExportSection: () => <div>Export data</div>,
}));

vi.mock("@/modules/ledger/ui/CollapsibleSection", () => ({
  CollapsibleSection: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

import { SettingsTab } from "@/modules/ledger/ui/SettingsTab";

describe("SettingsTab account authentication controls", () => {
  it("does not render password management in email-only auth", () => {
    const ledger = {
      id: "ledger-1",
      userId: "user-1",
      metadata: { settings: {} },
    } as unknown as Ledger;

    render(<SettingsTab ledger={ledger} initialCategories={[]} ledgerId="ledger-1" />);

    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change email" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change Password" })).not.toBeInTheDocument();
    expect(screen.queryByText("密码")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run settings red test**

Run:

```bash
npm run test:unit -- tests/unit/modules/ledger/ui/settings-tab-auth.test.tsx
```

Expected: FAIL because `SettingsTab` still renders password management.

---

### Task 6: Account Settings and Password Module Implementation

**Files:**
- Modify: `src/modules/ledger/ui/SettingsTab.tsx`
- Modify: `src/modules/auth/actions.ts`
- Modify: `src/modules/auth/use-cases.ts`
- Modify: `src/modules/auth/errors.ts`
- Delete password files and password tests listed in File Structure.
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Remove password settings UI**

In `src/modules/ledger/ui/SettingsTab.tsx`, replace:

```ts
import {
  PasswordForm,
  ChangeEmailForm,
  ClearDataForm,
  DeleteAccountForm,
} from "@/modules/auth/ui";
```

with:

```ts
import { ChangeEmailForm, ClearDataForm, DeleteAccountForm } from "@/modules/auth/ui";
```

Delete the whole password section between the email section and service credentials:

```tsx
<div className="h-px bg-[var(--border)]" />

{/* Password Section */}
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h3 className="text-base font-medium">{ta("passwordSection")}</h3>
    <p className="text-sm text-[var(--muted)]">
      {session?.user?.hasPassword
        ? ta("passwordSetDesc")
        : ta("passwordNotSetDesc")}
    </p>
  </div>
  <PasswordForm hasPassword={session?.user?.hasPassword ?? false} />
</div>
```

Leave one divider between email and service credentials.

- [ ] **Step 2: Remove password exports**

In `src/modules/auth/actions.ts`, keep exactly:

```ts
export { sendOTPAction } from "./server-actions/send-otp";
export { deleteAccount } from "./server-actions/delete-account";
export { changeEmail } from "./server-actions/change-email";
export { clearUserData } from "./server-actions/clear-user-data";
```

In `src/modules/auth/use-cases.ts`, remove password exports and keep OTP/account exports:

```ts
export {
  authenticateWithOTP,
  OTPExpiredSignInError,
  OTPInvalidSignInError,
  OTPLockedSignInError,
  OTPRateLimitedSignInError,
} from "./application/use-cases/authenticate-with-otp";
export { deleteAccount } from "./application/use-cases/delete-account";
export { handleAuthUserCreated } from "./application/use-cases/handle-auth-user-created";
export { handleAuthUserSignedIn } from "./application/use-cases/handle-auth-user-signed-in";
export { isAuthSignInAllowed } from "./application/use-cases/is-auth-sign-in-allowed";
export { RegistrationDisabledError } from "./application/use-cases/registration-policy";
export { sendOTP } from "./application/use-cases/send-otp";
export { changeEmail } from "./application/use-cases/change-email";
export { clearUserData } from "./application/use-cases/clear-user-data";
```

In `src/modules/auth/errors.ts`, keep exactly the codes still used by OTP and OTP-protected account actions:

```ts
export const AUTH_ERROR_CODES = {
  REGISTRATION_DISABLED: "registration_disabled",
  OTP_INVALID: "otp_invalid",
  OTP_EXPIRED: "otp_expired",
  OTP_LOCKED: "otp_locked",
  OTP_RATE_LIMITED: "otp_rate_limited",
  EMAIL_ALREADY_EXISTS: "email_already_exists",
  OTP_REQUIRED: "otp_required",
  OTP_INVALID_FOR_ACTION: "otp_invalid_for_action",
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
```

- [ ] **Step 3: Delete password files and password-only tests**

```bash
rm src/modules/auth/ui/PasswordForm.tsx
rm src/modules/auth/services/password.ts src/modules/auth/services/password-policy.ts
rm src/modules/auth/application/use-cases/authenticate-with-password.ts
rm src/modules/auth/application/use-cases/set-password.ts src/modules/auth/application/use-cases/change-password.ts
rm src/modules/auth/server-actions/set-password.ts src/modules/auth/server-actions/change-password.ts
rm tests/integration/auth/password-login.test.ts tests/integration/auth/set-password.test.ts tests/integration/auth/change-password.test.ts
rm tests/unit/auth/services/password.test.ts
```

- [ ] **Step 4: Remove unused dependencies**

Run:

```bash
npm uninstall @auth/drizzle-adapter bcryptjs @types/bcryptjs
```

Expected: `package.json` and `package-lock.json` remove those packages. `@auth/core` stays because OTP and registration errors import `CredentialsSignin` from `@auth/core/errors`.

- [ ] **Step 5: Run settings and auth unit tests**

Run:

```bash
npm run test:unit -- tests/unit/modules/ledger/ui/settings-tab-auth.test.tsx tests/unit/auth/auth-events.test.ts tests/unit/auth/auth-config.test.ts
```

Expected: PASS.

- [ ] **Step 6: Check no password code references remain in `src`**

Run:

```bash
rg -n "password|Password|passwordHash|password_hash|bcrypt|INVALID_CREDENTIALS|CURRENT_PASSWORD|PASSWORD_" src package.json
```

Expected: no output.

- [ ] **Step 7: Commit account/password cleanup**

```bash
git add src/modules/ledger/ui/SettingsTab.tsx src/modules/auth/actions.ts src/modules/auth/use-cases.ts src/modules/auth/errors.ts tests/unit/modules/ledger/ui/settings-tab-auth.test.tsx package.json package-lock.json
git add -u src/modules/auth tests/integration/auth tests/unit/auth/services
git commit -m "refactor: remove password auth module"
```

---

### Task 7: Environment and OIDC Red Tests

**Files:**
- Modify: `tests/unit/lib/env/runtime.test.ts`
- Modify: `tests/unit/lib/env/startup.test.ts`
- Modify: `tests/unit/lib/env/public-source.test.ts`
- Modify: `tests/unit/lib/env/catalog.test.ts`

- [ ] **Step 1: Update runtime env tests to assert no OIDC fields**

In `tests/unit/lib/env/runtime.test.ts`, remove OIDC values from base env setup and replace OIDC/public assertions with:

```ts
expect("oidcIssuer" in runtimeEnv).toBe(false);
expect("oidcClientId" in runtimeEnv).toBe(false);
expect("oidcClientSecret" in runtimeEnv).toBe(false);
expect("oidcEnabled" in publicEnv).toBe(false);
expect("oidcButtonName" in publicEnv).toBe(false);
```

- [ ] **Step 2: Update startup env tests to assert OIDC keys are outside the app schema**

In `tests/unit/lib/env/startup.test.ts`, replace expectations for `NEXT_PUBLIC_OIDC_BUTTON_NAME`, partial OIDC config rejection, and `NEXT_PUBLIC_OIDC_ENABLED` defaults with:

```ts
expect("NEXT_PUBLIC_OIDC_BUTTON_NAME" in ENV_DEFAULTS).toBe(false);
expect("NEXT_PUBLIC_OIDC_ENABLED" in ENV_DEFAULTS).toBe(false);

const result = validateStartupEnv({
  ...baseEnv,
  OIDC_ISSUER: "https://sso.cashier.test",
  OIDC_CLIENT_ID: "cashier-web",
  OIDC_CLIENT_SECRET: "top-secret",
  NEXT_PUBLIC_OIDC_ENABLED: "true",
  NEXT_PUBLIC_OIDC_BUTTON_NAME: "Cashier SSO",
});

expect("OIDC_ISSUER" in result).toBe(false);
expect("NEXT_PUBLIC_OIDC_ENABLED" in result).toBe(false);
```

- [ ] **Step 3: Update public source and catalog tests**

In `tests/unit/lib/env/public-source.test.ts`, assert the source does not contain OIDC env reads:

```ts
expect(source).not.toContain("NEXT_PUBLIC_OIDC_ENABLED");
expect(source).not.toContain("NEXT_PUBLIC_OIDC_BUTTON_NAME");
```

In `tests/unit/lib/env/catalog.test.ts`, add:

```ts
expect(documentedKeys.has("OIDC_ISSUER")).toBe(false);
expect(documentedKeys.has("OIDC_CLIENT_ID")).toBe(false);
expect(documentedKeys.has("OIDC_CLIENT_SECRET")).toBe(false);
expect(documentedKeys.has("NEXT_PUBLIC_OIDC_ENABLED")).toBe(false);
expect(documentedKeys.has("NEXT_PUBLIC_OIDC_BUTTON_NAME")).toBe(false);
```

- [ ] **Step 4: Run env red tests**

Run:

```bash
npm run test:unit -- tests/unit/lib/env/runtime.test.ts tests/unit/lib/env/startup.test.ts tests/unit/lib/env/public-source.test.ts tests/unit/lib/env/catalog.test.ts
```

Expected: FAIL because env modules still expose OIDC settings.

---

### Task 8: Environment and OIDC Implementation

**Files:**
- Modify: `src/lib/env/runtime.ts`
- Modify: `src/lib/env/public.ts`
- Modify: `src/lib/env/startup.ts`
- Modify: `src/lib/env/defaults.ts`
- Modify: `src/lib/env/catalog.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/architecture/PRD.md`

- [ ] **Step 1: Remove OIDC from env runtime and public env**

In `src/lib/env/runtime.ts`, remove `oidcIssuer`, `oidcClientId`, and `oidcClientSecret` from `RuntimeEnv` and from `runtimeEnv`.

In `src/lib/env/public.ts`, replace the interface and object with:

```ts
import { ENV_DEFAULTS } from "./defaults";

export interface PublicEnv {
  readonly appUrl: string;
}

function resolvePublicValue(value: string | undefined, fallback: string): string {
  return value != null && value.trim() !== "" ? value : fallback;
}

export const publicEnv: PublicEnv = {
  get appUrl() {
    return resolvePublicValue(process.env.NEXT_PUBLIC_APP_URL, ENV_DEFAULTS.NEXT_PUBLIC_APP_URL);
  },
};
```

- [ ] **Step 2: Remove OIDC from startup schema and defaults**

In `src/lib/env/startup.ts`, remove:

```ts
OIDC_ISSUER: optionalUrl("OIDC_ISSUER"),
OIDC_CLIENT_ID: z.preprocess(blankToUndefined, z.string().trim().optional()),
OIDC_CLIENT_SECRET: z.preprocess(blankToUndefined, z.string().trim().optional()),
NEXT_PUBLIC_OIDC_ENABLED: booleanStringWithDefault("NEXT_PUBLIC_OIDC_ENABLED"),
NEXT_PUBLIC_OIDC_BUTTON_NAME: stringWithDefault("NEXT_PUBLIC_OIDC_BUTTON_NAME"),
```

Replace the `startupEnvSchema` definition with:

```ts
const startupEnvSchema = z.object(startupEnvFields);
```

Remove `optionalUrl` and `booleanStringWithDefault` helpers if they become unused.

In `src/lib/env/defaults.ts`, remove:

```ts
NEXT_PUBLIC_OIDC_ENABLED: "false",
NEXT_PUBLIC_OIDC_BUTTON_NAME: "SSO",
```

- [ ] **Step 3: Remove OIDC from env catalog**

In `src/lib/env/catalog.ts`, delete entries for:

```ts
OIDC_ISSUER
OIDC_CLIENT_ID
OIDC_CLIENT_SECRET
NEXT_PUBLIC_OIDC_ENABLED
NEXT_PUBLIC_OIDC_BUTTON_NAME
```

- [ ] **Step 4: Remove OIDC from examples and architecture docs**

In `.env.example`, delete the whole "Authentication - OIDC/SSO" block and the frontend OIDC keys.

In `docs/architecture/PRD.md`, replace:

```md
- 认证：支持 OTP 邮箱验证码登录，以及可选的 OIDC/SSO 登录
```

with:

```md
- 认证：仅支持 OTP 邮箱验证码登录
```

In `README.md`, keep "Secure email-based authentication" and remove any "Magic Links" wording if present, because the current flow uses verification codes.

- [ ] **Step 5: Run env tests**

Run:

```bash
npm run test:unit -- tests/unit/lib/env/runtime.test.ts tests/unit/lib/env/startup.test.ts tests/unit/lib/env/public-source.test.ts tests/unit/lib/env/catalog.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit OIDC env cleanup**

```bash
git add src/lib/env/runtime.ts src/lib/env/public.ts src/lib/env/startup.ts src/lib/env/defaults.ts src/lib/env/catalog.ts .env.example README.md docs/architecture/PRD.md tests/unit/lib/env/runtime.test.ts tests/unit/lib/env/startup.test.ts tests/unit/lib/env/public-source.test.ts tests/unit/lib/env/catalog.test.ts
git commit -m "refactor: remove oidc environment support"
```

---

### Task 9: Schema and Migration Red Tests

**Files:**
- Create: `tests/unit/auth/schema-email-only.test.ts`

- [ ] **Step 1: Add schema absence test**

```ts
import { describe, expect, it } from "vitest";
import * as authSchema from "@/persistence/schema/auth";
import { users } from "@/persistence/schema/auth";

describe("email-only auth schema", () => {
  it("does not expose OAuth accounts or password hash schema", () => {
    expect("accounts" in authSchema).toBe(false);
    expect("passwordHash" in users).toBe(false);
  });
});
```

- [ ] **Step 2: Run schema red test**

Run:

```bash
npm run test:unit -- tests/unit/auth/schema-email-only.test.ts
```

Expected: FAIL because `accounts` and `users.passwordHash` still exist.

---

### Task 10: Schema and Migration Implementation

**Files:**
- Modify: `src/persistence/schema/auth.ts`
- Modify: `src/persistence/relations.ts`
- Modify: `tests/setup.ts`
- Create: `src/persistence/migrations/0033_email_only_auth_removal.sql`
- Create: `src/persistence/migrations/meta/0033_snapshot.json`
- Modify: `src/persistence/migrations/meta/_journal.json`

- [ ] **Step 1: Remove accounts and password hash from schema**

In `src/persistence/schema/auth.ts`, remove `primaryKey` from the import list if unused, remove the `passwordHash` field from `users`, and delete the entire `accounts` table and `Account` type export.

The top import should become:

```ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
```

- [ ] **Step 2: Remove account relations**

In `src/persistence/relations.ts`, replace:

```ts
import { users, accounts } from "./schema/auth";
```

with:

```ts
import { users } from "./schema/auth";
```

Replace `usersRelations` with:

```ts
export const usersRelations = relations(users, ({ many }) => ({
  ledgers: many(ledgers),
}));
```

Delete the entire `accountsRelations` export.

- [ ] **Step 3: Remove accounts from test cleanup**

In `tests/setup.ts`, remove `"accounts",` from the `tables` array.

- [ ] **Step 4: Generate migration and metadata**

Run:

```bash
npx drizzle-kit generate --name=email_only_auth_removal
```

Expected:
- `src/persistence/migrations/0033_email_only_auth_removal.sql` is created.
- `src/persistence/migrations/meta/0033_snapshot.json` is created.
- `src/persistence/migrations/meta/_journal.json` gets an idx `33` entry with tag `0033_email_only_auth_removal`.

Open `src/persistence/migrations/0033_email_only_auth_removal.sql` and confirm it removes the OAuth table and password column. Accept either direct SQL:

```sql
DROP TABLE `accounts`;
ALTER TABLE `users` DROP COLUMN `password_hash`;
```

or Drizzle's SQLite table-rebuild sequence that creates a replacement `users` table without `password_hash`, copies non-password columns, drops the old table, and renames the replacement table.

- [ ] **Step 5: Run schema and DB tests**

Run:

```bash
npm run test:unit -- tests/unit/auth/schema-email-only.test.ts tests/unit/auth/application/queries/get-session-user.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify migration on a local SQLite database**

Run:

```bash
rm -f /tmp/cashier-email-only-auth.sqlite
DATABASE_URL=file:/tmp/cashier-email-only-auth.sqlite npx drizzle-kit migrate
sqlite3 /tmp/cashier-email-only-auth.sqlite ".schema users" | rg "password_hash"
sqlite3 /tmp/cashier-email-only-auth.sqlite ".tables" | rg "accounts"
```

Expected:
- `drizzle-kit migrate` exits 0.
- Both `rg` commands exit 1 with no output.

- [ ] **Step 7: Commit schema and migration cleanup**

```bash
git add src/persistence/schema/auth.ts src/persistence/relations.ts tests/setup.ts tests/unit/auth/schema-email-only.test.ts src/persistence/migrations/0033_email_only_auth_removal.sql src/persistence/migrations/meta/0033_snapshot.json src/persistence/migrations/meta/_journal.json
git commit -m "refactor: remove oauth and password auth schema"
```

---

### Task 11: I18n and Login Error Cleanup

**Files:**
- Modify: `src/app/[locale]/login/error/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Remove OAuth error mappings**

In `src/app/[locale]/login/error/page.tsx`, replace `ERROR_MESSAGES` with:

```ts
const ERROR_MESSAGES = {
  AccessDenied: { title: "errorAccessDenied", desc: "errorAccessDeniedDesc" },
  Configuration: { title: "errorConfiguration", desc: "errorConfigurationDesc" },
  Default: { title: "error", desc: "errorDesc" },
} satisfies Record<string, ErrorMessage>;
```

- [ ] **Step 2: Remove deleted auth strings**

From `messages/en.json` and `messages/zh.json`, remove auth keys that no longer have consumers:

```json
"orContinueWith"
"signInWithSSO"
"redirecting"
"errorOAuthCallback"
"errorOAuthCallbackDesc"
"errorOAuthAccountNotLinked"
"errorOAuthAccountNotLinkedDesc"
"password"
"passwordPlaceholder"
"signingIn"
"invalidCredentials"
"passwordLoginDesc"
"otp"
```

From `messages/en.json` and `messages/zh.json`, remove `Settings.Account` password keys:

```json
"passwordSection"
"passwordSectionDesc"
"passwordSet"
"passwordNotSet"
"passwordSetDesc"
"passwordNotSetDesc"
"changePasswordButton"
"setPasswordButton"
"changePasswordTitle"
"setPasswordTitle"
"changePasswordDesc"
"setPasswordDesc"
"currentPassword"
"currentPasswordPlaceholder"
"newPassword"
"newPasswordPlaceholder"
"confirmPassword"
"confirmPasswordPlaceholder"
"passwordsDoNotMatch"
"passwordError"
```

- [ ] **Step 3: Validate i18n catalogs**

Run:

```bash
npm run validate:i18n
```

Expected: PASS.

- [ ] **Step 4: Search removed words outside historical superpowers docs**

Run:

```bash
rg -n "OIDC|oidc|OAuth|oauth|SSO|password|Password|passwordHash|password_hash|accounts" src tests messages .env.example README.md docs/architecture package.json
```

Expected: no output except service credential text that uses the generic word `credentials` without `password`, and no output for the exact removed auth terms.

- [ ] **Step 5: Commit i18n cleanup**

```bash
git add 'src/app/[locale]/login/error/page.tsx' messages/en.json messages/zh.json
git commit -m "refactor: remove obsolete auth messages"
```

---

### Task 12: Final Verification

**Files:**
- Check only; no intended source edits.

- [ ] **Step 1: Run static checks**

Run:

```bash
npm run lint
npm run tsc
```

Expected: both commands PASS.

- [ ] **Step 2: Run test suites**

Run:

```bash
npm run test:unit
npm run test:integration
```

Expected: both commands PASS.

- [ ] **Step 3: Run i18n validation**

Run:

```bash
npm run validate:i18n
```

Expected: PASS.

- [ ] **Step 4: Run final removed-auth search**

Run:

```bash
rg -n "OIDC|oidc|OAuth|oauth|SSO|password|Password|passwordHash|password_hash|accounts|bcrypt|@auth/drizzle-adapter" src tests messages .env.example README.md docs/architecture package.json package-lock.json
```

Expected: no output.

- [ ] **Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected: clean working tree if all task commits were made.

---

## Self-Review

Spec coverage:
- OAuth/OIDC provider removal is covered by Tasks 1, 2, 7, 8, 11, and 12.
- Password login and password management removal is covered by Tasks 1 through 6 and Tasks 11 and 12.
- Database schema and destructive migration are covered by Tasks 9 and 10.
- Env cleanup is covered by Tasks 7 and 8.
- Tests and verification are covered by each task and the final verification task.

Empty-marker scan:
- No deferred implementation wording is present.
- Every code-changing task has exact file paths, concrete snippets, commands, and expected results.

Type consistency:
- `Session.user.hasPassword` is removed in Task 2 and all later UI/tests avoid it.
- `users.passwordHash` is removed from queries before schema deletion, then removed from schema in Task 10.
- `accounts` is removed from Auth.js adapter usage before schema deletion, then removed from schema and relations in Task 10.

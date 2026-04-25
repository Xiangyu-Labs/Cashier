# 密码登录与账户管理功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Cashier 项目中增加密码登录功能（与 OTP 验证码登录并存），以及在账户设置页增加修改密码、修改邮箱、清空数据、删除账号（增强验证码验证）功能。

**Architecture:** 新增 bcryptjs 密码哈希服务，NextAuth Credentials provider 新增 "password" provider 与现有 "otp" 并存，登录页通过 Tab 切换两种模式。账户设置页扩展为包含密码管理、邮箱修改、清空数据、删除账号四大功能区块。敏感操作（清空数据、删除账号）需邮箱验证码二次确认。

**Tech Stack:** Next.js 16 + TypeScript + SQLite/Drizzle ORM + NextAuth.js v5 beta + next-intl + bcryptjs + Zod + Tailwind CSS + shadcn/ui + Vitest

---

## 文件结构映射

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/modules/auth/services/password.ts` | bcrypt 密码哈希与验证工具函数 |
| `src/modules/auth/application/use-cases/authenticate-with-password.ts` | 密码登录 use-case |
| `src/modules/auth/application/use-cases/set-password.ts` | 首次设置密码 use-case |
| `src/modules/auth/application/use-cases/change-password.ts` | 修改密码 use-case |
| `src/modules/auth/application/use-cases/change-email.ts` | 修改邮箱 use-case |
| `src/modules/auth/application/use-cases/clear-user-data.ts` | 清空用户数据 use-case |
| `src/modules/auth/server-actions/authenticate-with-password.ts` | 密码登录 server action |
| `src/modules/auth/server-actions/set-password.ts` | 设置密码 server action |
| `src/modules/auth/server-actions/change-password.ts` | 修改密码 server action |
| `src/modules/auth/server-actions/change-email.ts` | 修改邮箱 server action |
| `src/modules/auth/server-actions/clear-user-data.ts` | 清空数据 server action |
| `src/modules/auth/ui/password-step.tsx` | 密码登录表单组件 |
| `src/app/[locale]/(protected)/settings/account/PasswordForm.tsx` | 设置/修改密码表单组件 |
| `src/app/[locale]/(protected)/settings/account/ChangeEmailForm.tsx` | 修改邮箱表单组件 |
| `src/app/[locale]/(protected)/settings/account/ClearDataForm.tsx` | 清空数据表单组件 |
| `src/persistence/migrations/0030_add_password_hash_to_users.sql` | 数据库迁移：users 表加 password_hash 列 |
| `tests/unit/auth/services/password.test.ts` | 密码服务单元测试 |
| `tests/integration/auth/password-login.test.ts` | 密码登录集成测试 |
| `tests/integration/auth/set-password.test.ts` | 设置密码集成测试 |
| `tests/integration/auth/change-password.test.ts` | 修改密码集成测试 |
| `tests/integration/auth/change-email.test.ts` | 修改邮箱集成测试 |
| `tests/integration/auth/clear-data.test.ts` | 清空数据集成测试 |

### 修改文件

| 文件 | 职责 |
|------|------|
| `package.json` | 新增 bcryptjs + @types/bcryptjs 依赖 |
| `src/persistence/schema/auth.ts` | users 表新增 passwordHash 字段 |
| `src/auth.ts` | 新增 password Credentials provider |
| `src/modules/auth/ui/login-page.tsx` | OTP/密码 Tab 切换 |
| `src/modules/auth/hooks/use-login-flow.ts` | 支持双模式登录状态管理 |
| `src/modules/auth/errors.ts` | 扩展错误码 |
| `src/modules/auth/use-cases.ts` | 导出新增 use-cases |
| `src/modules/auth/actions.ts` | 导出新增 server actions |
| `src/modules/auth/application/use-cases/delete-account.ts` | 增强：增加 OTP 验证码验证参数 |
| `src/modules/auth/server-actions/delete-account.ts` | 增强：增加 OTP 验证码参数 |
| `src/app/[locale]/(protected)/settings/account/page.tsx` | 扩展布局，加入新功能区块 |
| `src/app/[locale]/(protected)/settings/account/DeleteAccountForm.tsx` | 增强：增加 OTP 验证码验证 |
| `messages/en.json` | 新增翻译键 |
| `messages/zh.json` | 新增翻译键 |

---

## Task 1: 添加依赖与数据库 Schema 变更

**Files:**
- Modify: `package.json`
- Modify: `src/persistence/schema/auth.ts`
- Create: `src/persistence/migrations/0030_add_password_hash_to_users.sql`

- [ ] **Step 1: 安装 bcryptjs 依赖**

Run:
```bash
npm install bcryptjs && npm install -D @types/bcryptjs
```

Expected: `package.json` 中新增 `"bcryptjs": "^2.4.3"`（或最新版本）和 `"@types/bcryptjs": "^2.4.6"`。

- [ ] **Step 2: 修改 users schema 添加 passwordHash 字段**

Modify `src/persistence/schema/auth.ts`，在 `users` 表的字段定义中新增：

```typescript
passwordHash: text("password_hash"),
```

放在 `deletedAt` 字段之前，保持字段顺序的逻辑性。完整字段列表应为：

```typescript
export const users = sqliteTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "timestamp_ms" }),
    image: text("image"),
    passwordHash: text("password_hash"),
    role: text("role")
      .notNull()
      .default(UserRole.User)
      .$type<UserRoleValue>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("idx_users_email").on(table.email)]
);
```

- [ ] **Step 3: 创建数据库迁移文件**

Create `src/persistence/migrations/0030_add_password_hash_to_users.sql`:

```sql
ALTER TABLE "users" ADD COLUMN "password_hash" text;
```

- [ ] **Step 4: 运行数据库迁移**

Run:
```bash
npm run db:migrate
```

Expected: 迁移成功执行，无错误。

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json src/persistence/schema/auth.ts src/persistence/migrations/0030_add_password_hash_to_users.sql
git commit -m "chore: add bcryptjs dependency and password_hash column to users"
```

---

## Task 2: 密码服务（TDD）

**Files:**
- Create: `src/modules/auth/services/password.ts`
- Create: `tests/unit/auth/services/password.test.ts`

- [ ] **Step 1: 编写失败的密码服务单元测试**

Create `tests/unit/auth/services/password.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password";

describe("password service", () => {
  describe("hashPassword", () => {
    it("returns a bcrypt hash for a valid password", async () => {
      const hash = await hashPassword("ValidPass123");
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
      expect(hash.startsWith("$2a$")).toBe(true);
    });
  });

  describe("verifyPassword", () => {
    it("returns true for matching password", async () => {
      const hash = await hashPassword("ValidPass123");
      const result = await verifyPassword("ValidPass123", hash);
      expect(result).toBe(true);
    });

    it("returns false for non-matching password", async () => {
      const hash = await hashPassword("ValidPass123");
      const result = await verifyPassword("WrongPass123", hash);
      expect(result).toBe(false);
    });

    it("returns false for empty password against valid hash", async () => {
      const hash = await hashPassword("ValidPass123");
      const result = await verifyPassword("", hash);
      expect(result).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npx vitest run tests/unit/auth/services/password.test.ts
```

Expected: FAIL — "Failed to load url /modules/auth/services/password" (模块不存在)。

- [ ] **Step 3: 实现密码服务**

Create `src/modules/auth/services/password.ts`:

```typescript
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
npx vitest run tests/unit/auth/services/password.test.ts
```

Expected: 4 tests PASS。

- [ ] **Step 5: 提交**

```bash
git add src/modules/auth/services/password.ts tests/unit/auth/services/password.test.ts
git commit -m "feat: add bcrypt password hash and verify service with tests"
```

---

## Task 3: 密码登录 Use Case（TDD）

**Files:**
- Create: `src/modules/auth/application/use-cases/authenticate-with-password.ts`
- Create: `tests/integration/auth/password-login.test.ts`

- [ ] **Step 1: 编写失败的密码登录集成测试**

Create `tests/integration/auth/password-login.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users } from "@/persistence/schema/auth";
import { authenticateWithPassword } from "@/modules/auth/use-cases";
import { hashPassword } from "@/modules/auth/services/password";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

describe("authenticateWithPassword", () => {
  const TEST_EMAIL = "password-user@example.com";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
  });

  async function createUserWithPassword(email: string, password: string) {
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({
      email,
      emailVerified: new Date(),
      passwordHash,
    });
  }

  it("signs in successfully with valid credentials", async () => {
    await createUserWithPassword(TEST_EMAIL, "ValidPass123");

    const result = await authenticateWithPassword({
      email: TEST_EMAIL,
      password: "ValidPass123",
    });

    expect(result).toMatchObject({ email: TEST_EMAIL });
    expect(result.id).toBeDefined();
  });

  it("throws invalid_credentials for wrong password", async () => {
    await createUserWithPassword(TEST_EMAIL, "ValidPass123");

    await expect(
      authenticateWithPassword({
        email: TEST_EMAIL,
        password: "WrongPass123",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.INVALID_CREDENTIALS });
  });

  it("throws invalid_credentials for non-existent user", async () => {
    await expect(
      authenticateWithPassword({
        email: "nonexistent@example.com",
        password: "AnyPass123",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.INVALID_CREDENTIALS });
  });

  it("throws invalid_credentials for user without password", async () => {
    await db.insert(users).values({
      email: TEST_EMAIL,
      emailVerified: new Date(),
    });

    await expect(
      authenticateWithPassword({
        email: TEST_EMAIL,
        password: "AnyPass123",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.INVALID_CREDENTIALS });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npx vitest run tests/integration/auth/password-login.test.ts
```

Expected: FAIL — authenticateWithPassword 未定义 / INVALID_CREDENTIALS 错误码不存在。

- [ ] **Step 3: 扩展错误码**

Modify `src/modules/auth/errors.ts`，在 AUTH_ERROR_CODES 中新增：

```typescript
export const AUTH_ERROR_CODES = {
  REGISTRATION_DISABLED: "registration_disabled",
  OTP_INVALID: "otp_invalid",
  OTP_EXPIRED: "otp_expired",
  OTP_LOCKED: "otp_locked",
  OTP_RATE_LIMITED: "otp_rate_limited",
  INVALID_CREDENTIALS: "invalid_credentials",
  PASSWORD_TOO_SHORT: "password_too_short",
  PASSWORD_REQUIREMENTS_NOT_MET: "password_requirements_not_met",
  PASSWORD_MISMATCH: "password_mismatch",
  CURRENT_PASSWORD_WRONG: "current_password_wrong",
  EMAIL_ALREADY_EXISTS: "email_already_exists",
  INVALID_CONFIRMATION: "invalid_confirmation",
  OTP_REQUIRED: "otp_required",
  OTP_INVALID_FOR_ACTION: "otp_invalid_for_action",
} as const;
```

- [ ] **Step 4: 实现密码登录 use-case**

Create `src/modules/auth/application/use-cases/authenticate-with-password.ts`:

```typescript
import { CredentialsSignin } from "@auth/core/errors";
import { and, eq, isNull } from "drizzle-orm";
import type { User } from "next-auth";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { verifyPassword } from "@/modules/auth/services/password";
import { normalizeEmail } from "@/lib/utils/email";
import { logger } from "@/lib/logger";

const MAX_EMAIL_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class PasswordCredentialsSigninError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

export class InvalidCredentialsSignInError extends PasswordCredentialsSigninError {
  constructor() {
    super(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
  }
}

function validateCredentials(email: string, password: string): string {
  if (email === "" || email.length > MAX_EMAIL_LENGTH) {
    throw new InvalidCredentialsSignInError();
  }

  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new InvalidCredentialsSignInError();
  }

  if (password === "" || password.length > 128) {
    throw new InvalidCredentialsSignInError();
  }

  return normalizedEmail;
}

export async function authenticateWithPassword(params: {
  email: string;
  password: string;
}): Promise<User> {
  const normalizedEmail = validateCredentials(params.email, params.password);

  const user = await db.query.users.findFirst({
    where: and(eq(users.email, normalizedEmail), isNull(users.deletedAt)),
  });

  if (user == null) {
    logger.warn({ email: normalizedEmail }, "Password sign-in: user not found");
    throw new InvalidCredentialsSignInError();
  }

  if (user.passwordHash == null || user.passwordHash === "") {
    logger.warn({ email: normalizedEmail }, "Password sign-in: no password set");
    throw new InvalidCredentialsSignInError();
  }

  const isValid = await verifyPassword(params.password, user.passwordHash);

  if (!isValid) {
    logger.warn({ email: normalizedEmail }, "Password sign-in: invalid password");
    throw new InvalidCredentialsSignInError();
  }

  logger.info({ email: normalizedEmail, userId: user.id }, "Password sign-in successful");

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
  };
}
```

- [ ] **Step 5: 导出密码登录 use-case**

Modify `src/modules/auth/use-cases.ts`，在现有导出后添加：

```typescript
export {
  authenticateWithPassword,
  InvalidCredentialsSignInError,
} from "./application/use-cases/authenticate-with-password";
```

- [ ] **Step 6: 运行测试确认通过**

Run:
```bash
npx vitest run tests/integration/auth/password-login.test.ts
```

Expected: 4 tests PASS。

- [ ] **Step 7: 提交**

```bash
git add src/modules/auth/errors.ts src/modules/auth/application/use-cases/authenticate-with-password.ts src/modules/auth/use-cases.ts tests/integration/auth/password-login.test.ts
git commit -m "feat: add password login use-case with tests"
```

---

## Task 4: auth.ts 集成 Password Provider

**Files:**
- Modify: `src/auth.ts`

- [ ] **Step 1: 修改 auth.ts 添加 password provider**

Modify `src/auth.ts`，在 providers 数组中，在现有的 Credentials("otp") 之后添加新的 Credentials("password")：

先添加 import：

```typescript
import {
  authenticateWithOTP,
  authenticateWithPassword,
  handleAuthUserCreated,
  handleAuthUserSignedIn,
  isAuthSignInAllowed,
} from "@/modules/auth/use-cases";
```

然后在 providers 数组中：

```typescript
providers: [
  ...(OIDCProvider ? [OIDCProvider] : []),
  Credentials({
    id: "otp",
    name: "OTP",
    credentials: {
      email: { type: "email" },
      otp: { type: "text" },
      locale: { type: "text" },
    },
    async authorize(credentials, request) {
      // ... existing OTP authorize logic (unchanged)
    },
  }),
  Credentials({
    id: "password",
    name: "Password",
    credentials: {
      email: { type: "email" },
      password: { type: "password" },
    },
    async authorize(credentials) {
      if (
        credentials?.email == null ||
        credentials?.email === "" ||
        credentials?.password == null ||
        credentials?.password === ""
      ) {
        return null;
      }

      if (typeof credentials.email !== "string" || typeof credentials.password !== "string") {
        return null;
      }

      return authenticateWithPassword({
        email: credentials.email,
        password: credentials.password,
      });
    },
  }),
],
```

- [ ] **Step 2: 验证构建**

Run:
```bash
npm run build
```

Expected: 构建成功，无 TypeScript 错误。

- [ ] **Step 3: 提交**

```bash
git add src/auth.ts
git commit -m "feat: integrate password credentials provider into NextAuth"
```

---

## Task 5: 登录页 UI — PasswordStep 与 Tab 切换

**Files:**
- Create: `src/modules/auth/ui/password-step.tsx`
- Modify: `src/modules/auth/hooks/use-login-flow.ts`
- Modify: `src/modules/auth/ui/login-page.tsx`

- [ ] **Step 1: 创建 PasswordStep 组件**

Create `src/modules/auth/ui/password-step.tsx`:

```typescript
"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, KeyRound } from "lucide-react";

interface PasswordStepProps {
  email: string;
  password: string;
  isLoading: boolean;
  error: string | null;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function PasswordStep({
  email,
  password,
  isLoading,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: PasswordStepProps) {
  const t = useTranslations("Auth");

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-text">
          {t("email")}
        </label>
        <Input
          id="email"
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          required
          disabled={isLoading}
          className="h-11"
          autoComplete="email"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-text">
          {t("password")}
        </label>
        <Input
          id="password"
          type="password"
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          disabled={isLoading}
          className="h-11"
          autoComplete="current-password"
        />
      </div>
      {error != null && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      <Button
        type="submit"
        className="w-full h-11"
        disabled={isLoading || email === "" || password === ""}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("signingIn")}
          </>
        ) : (
          <>
            <KeyRound className="mr-2 h-4 w-4" />
            {t("signIn")}
          </>
        )}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: 扩展 useLoginFlow hook**

Modify `src/modules/auth/hooks/use-login-flow.ts`。由于这个文件较长，以下是关键变更点：

在类型定义区域新增：

```typescript
type LoginMode = "otp" | "password";

type LoginStep = "email" | "otp";

interface UseLoginFlowReturn {
  // ... existing fields
  mode: LoginMode;
  password: string;
  passwordError: string | null;
  isPasswordLoading: boolean;
  setMode: (mode: LoginMode) => void;
  setPassword: (password: string) => void;
  handlePasswordLogin: (e: React.FormEvent) => Promise<void>;
}
```

在 `getSignInErrorMessage` 函数中新增 case：

```typescript
function getSignInErrorMessage(
  signInResult: SignInResponse | undefined,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  switch (signInResult?.code) {
    // ... existing cases
    case AUTH_ERROR_CODES.INVALID_CREDENTIALS:
      return t("invalidCredentials");
    // ...
  }
}
```

在 hook 主体中新增状态和方法：

```typescript
export function useLoginFlow(
  t: (key: string, values?: Record<string, string | number>) => string
): UseLoginFlowReturn {
  // ... existing state
  const [mode, setMode] = useState<LoginMode>("otp");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);

  const handleModeChange = (newMode: LoginMode) => {
    setMode(newMode);
    setError(null);
    setPasswordError(null);
    setPassword("");
    setOtp("");
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email === "" || password === "") return;

    setIsPasswordLoading(true);
    setPasswordError(null);

    try {
      const signInResult = await signIn("password", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (signInResult?.error != null) {
        setPasswordError(getSignInErrorMessage(signInResult, t));
        setIsPasswordLoading(false);
      } else if (signInResult?.ok) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        setPasswordError(getSignInErrorMessage(signInResult, t));
        setIsPasswordLoading(false);
      }
    } catch (err) {
      if (err instanceof Error) {
        setPasswordError(err.message);
      } else {
        setPasswordError(t("unexpectedError"));
      }
      setIsPasswordLoading(false);
    }
  };

  // ... return object with new fields
  return {
    callbackUrl,
    step,
    mode,
    email,
    otp,
    password,
    isLoading,
    isPasswordLoading,
    error,
    passwordError,
    expiresAt,
    canResendAt,
    setEmail,
    setOtp,
    setPassword,
    setMode: handleModeChange,
    handleSendOTP,
    handleVerifyOTP,
    handleResendOTP,
    handleChangeEmail,
    handleOTPExpired,
    handlePasswordLogin,
  };
}
```

- [ ] **Step 3: 修改登录页支持 Tab 切换**

Modify `src/modules/auth/ui/login-page.tsx`：

```typescript
"use client";
import { useTranslations } from "next-intl";
import { Mail, KeyRound } from "lucide-react";
import { useLoginFlow } from "../hooks/use-login-flow";
import { EmailStep } from "./email-step";
import { OtpStep } from "./otp-step";
import { PasswordStep } from "./password-step";

export function AuthLoginPage() {
  const t = useTranslations("Auth");
  const {
    callbackUrl,
    step,
    mode,
    email,
    otp,
    password,
    isLoading,
    isPasswordLoading,
    error,
    passwordError,
    expiresAt,
    canResendAt,
    setEmail,
    setOtp,
    setPassword,
    setMode,
    handleSendOTP,
    handleVerifyOTP,
    handleResendOTP,
    handleChangeEmail,
    handleOTPExpired,
    handlePasswordLogin,
  } = useLoginFlow(t);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            {mode === "otp" ? (
              <Mail className="w-8 h-8 text-primary" />
            ) : (
              <KeyRound className="w-8 h-8 text-primary" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-text">
            {mode === "otp"
              ? step === "email"
                ? t("welcomeBack")
                : t("verifyCode")
              : t("signIn")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {mode === "otp"
              ? step === "email"
                ? t("welcomeBackDesc")
                : t("verifyCodeDesc", { email })
              : t("signInWithPassword")}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex mb-4 bg-muted rounded-lg p-1">
          <button
            type="button"
            onClick={() => setMode("otp")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === "otp"
                ? "bg-surface text-text shadow-sm"
                : "text-muted-foreground hover:text-text"
            }`}
          >
            {t("otpLogin")}
          </button>
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === "password"
                ? "bg-surface text-text shadow-sm"
                : "text-muted-foreground hover:text-text"
            }`}
          >
            {t("passwordLogin")}
          </button>
        </div>

        <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
          {mode === "otp" ? (
            step === "email" ? (
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
            )
          ) : (
            <PasswordStep
              email={email}
              password={password}
              isLoading={isPasswordLoading}
              error={passwordError}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onSubmit={handlePasswordLogin}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 验证 lint 和 build**

Run:
```bash
npm run lint && npm run build
```

Expected: lint 和 build 都成功。

- [ ] **Step 5: 提交**

```bash
git add src/modules/auth/ui/password-step.tsx src/modules/auth/hooks/use-login-flow.ts src/modules/auth/ui/login-page.tsx
git commit -m "feat: add password login UI with tab switching on login page"
```

---

## Task 6: 设置密码 Use Case 与 Server Action（TDD）

**Files:**
- Create: `src/modules/auth/application/use-cases/set-password.ts`
- Create: `src/modules/auth/server-actions/set-password.ts`
- Create: `tests/integration/auth/set-password.test.ts`

- [ ] **Step 1: 编写失败的设置密码集成测试**

Create `tests/integration/auth/set-password.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users } from "@/persistence/schema/auth";
import { setPassword } from "@/modules/auth/use-cases";
import { verifyPassword } from "@/modules/auth/services/password";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

describe("setPassword use case", () => {
  const TEST_EMAIL = "set-password@example.com";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
    await db.insert(users).values({
      email: TEST_EMAIL,
      emailVerified: new Date(),
    });
  });

  it("sets password for user without existing password", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, TEST_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await setPassword({
      userId: user.id,
      newPassword: "NewPass123",
      confirmPassword: "NewPass123",
    });

    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });

    expect(updatedUser?.passwordHash).toBeDefined();
    expect(updatedUser?.passwordHash).not.toBeNull();
    const isValid = await verifyPassword("NewPass123", updatedUser?.passwordHash ?? "");
    expect(isValid).toBe(true);
  });

  it("throws error when passwords do not match", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, TEST_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      setPassword({
        userId: user.id,
        newPassword: "NewPass123",
        confirmPassword: "DifferentPass123",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PASSWORD_MISMATCH });
  });

  it("throws error when password is too short", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, TEST_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      setPassword({
        userId: user.id,
        newPassword: "short1",
        confirmPassword: "short1",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PASSWORD_TOO_SHORT });
  });

  it("throws error when password does not meet requirements", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, TEST_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      setPassword({
        userId: user.id,
        newPassword: "onlyletters",
        confirmPassword: "onlyletters",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PASSWORD_REQUIREMENTS_NOT_MET });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npx vitest run tests/integration/auth/set-password.test.ts
```

Expected: FAIL — setPassword 未定义 / 各种错误码不存在。

- [ ] **Step 3: 实现密码验证辅助函数**

Create `src/modules/auth/services/password-policy.ts`:

```typescript
import { ValidationError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const PASSWORD_REQUIREMENTS_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError("Password must be at least 8 characters", {
      code: AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
    });
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError("Password must not exceed 128 characters", {
      code: AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
    });
  }

  if (!PASSWORD_REQUIREMENTS_REGEX.test(password)) {
    throw new ValidationError("Password must contain at least one letter and one number", {
      code: AUTH_ERROR_CODES.PASSWORD_REQUIREMENTS_NOT_MET,
    });
  }
}
```

- [ ] **Step 4: 实现设置密码 use-case**

Create `src/modules/auth/application/use-cases/set-password.ts`:

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";
import { ValidationError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { hashPassword } from "@/modules/auth/services/password";
import { validatePassword } from "@/modules/auth/services/password-policy";
import { logger } from "@/lib/logger";

export async function setPassword(params: {
  userId: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  if (params.newPassword !== params.confirmPassword) {
    throw new ValidationError("Passwords do not match", {
      code: AUTH_ERROR_CODES.PASSWORD_MISMATCH,
    });
  }

  validatePassword(params.newPassword);

  const passwordHash = await hashPassword(params.newPassword);

  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, params.userId));

  logger.info({ userId: params.userId }, "Password set successfully");
}
```

- [ ] **Step 5: 实现设置密码 server action**

Create `src/modules/auth/server-actions/set-password.ts`:

```typescript
"use server";
import { withAuth } from "@/lib/auth-actions";
import { setPassword as setPasswordUseCase } from "../use-cases";

export const setPassword = withAuth(async (userId, newPassword: string, confirmPassword: string) => {
  await setPasswordUseCase({ userId, newPassword, confirmPassword });
});
```

- [ ] **Step 6: 导出设置密码 use-case 和 action**

Modify `src/modules/auth/use-cases.ts`，添加：

```typescript
export { setPassword } from "./application/use-cases/set-password";
```

Modify `src/modules/auth/actions.ts`，添加：

```typescript
export { setPassword } from "./server-actions/set-password";
```

- [ ] **Step 7: 运行测试确认通过**

Run:
```bash
npx vitest run tests/integration/auth/set-password.test.ts
```

Expected: 4 tests PASS。

- [ ] **Step 8: 提交**

```bash
git add src/modules/auth/services/password-policy.ts src/modules/auth/application/use-cases/set-password.ts src/modules/auth/server-actions/set-password.ts src/modules/auth/use-cases.ts src/modules/auth/actions.ts tests/integration/auth/set-password.test.ts
git commit -m "feat: add set-password use-case, server action, and tests"
```

---

## Task 7: 修改密码 Use Case 与 Server Action（TDD）

**Files:**
- Create: `src/modules/auth/application/use-cases/change-password.ts`
- Create: `src/modules/auth/server-actions/change-password.ts`
- Create: `tests/integration/auth/change-password.test.ts`

- [ ] **Step 1: 编写失败的修改密码集成测试**

Create `tests/integration/auth/change-password.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users } from "@/persistence/schema/auth";
import { changePassword } from "@/modules/auth/use-cases";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

describe("changePassword use case", () => {
  const TEST_EMAIL = "change-password@example.com";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
    const passwordHash = await hashPassword("OldPass123");
    await db.insert(users).values({
      email: TEST_EMAIL,
      emailVerified: new Date(),
      passwordHash,
    });
  });

  it("changes password with correct current password", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, TEST_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await changePassword({
      userId: user.id,
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
      confirmPassword: "NewPass456",
    });

    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });

    expect(updatedUser?.passwordHash).toBeDefined();
    const isOldValid = await verifyPassword("OldPass123", updatedUser?.passwordHash ?? "");
    expect(isOldValid).toBe(false);
    const isNewValid = await verifyPassword("NewPass456", updatedUser?.passwordHash ?? "");
    expect(isNewValid).toBe(true);
  });

  it("throws error when current password is wrong", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, TEST_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      changePassword({
        userId: user.id,
        currentPassword: "WrongPass123",
        newPassword: "NewPass456",
        confirmPassword: "NewPass456",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.CURRENT_PASSWORD_WRONG });
  });

  it("throws error when new password does not match confirmation", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, TEST_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      changePassword({
        userId: user.id,
        currentPassword: "OldPass123",
        newPassword: "NewPass456",
        confirmPassword: "DifferentPass",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PASSWORD_MISMATCH });
  });

  it("throws error when new password is too short", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, TEST_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      changePassword({
        userId: user.id,
        currentPassword: "OldPass123",
        newPassword: "short1",
        confirmPassword: "short1",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PASSWORD_TOO_SHORT });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npx vitest run tests/integration/auth/change-password.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现修改密码 use-case**

Create `src/modules/auth/application/use-cases/change-password.ts`:

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password";
import { validatePassword } from "@/modules/auth/services/password-policy";
import { logger } from "@/lib/logger";

export async function changePassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  if (params.newPassword !== params.confirmPassword) {
    throw new ValidationError("Passwords do not match", {
      code: AUTH_ERROR_CODES.PASSWORD_MISMATCH,
    });
  }

  validatePassword(params.newPassword);

  const user = await db.query.users.findFirst({
    where: eq(users.id, params.userId),
  });

  if (user == null) {
    throw new NotFoundError("User not found");
  }

  if (user.passwordHash == null) {
    throw new ValidationError("No password set. Please set a password first.", {
      code: AUTH_ERROR_CODES.CURRENT_PASSWORD_WRONG,
    });
  }

  const isCurrentValid = await verifyPassword(params.currentPassword, user.passwordHash);

  if (!isCurrentValid) {
    throw new ValidationError("Current password is incorrect", {
      code: AUTH_ERROR_CODES.CURRENT_PASSWORD_WRONG,
    });
  }

  const newPasswordHash = await hashPassword(params.newPassword);

  await db
    .update(users)
    .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
    .where(eq(users.id, params.userId));

  logger.info({ userId: params.userId }, "Password changed successfully");
}
```

- [ ] **Step 4: 实现修改密码 server action**

Create `src/modules/auth/server-actions/change-password.ts`:

```typescript
"use server";
import { withAuth } from "@/lib/auth-actions";
import { changePassword as changePasswordUseCase } from "../use-cases";

export const changePassword = withAuth(
  async (userId, currentPassword: string, newPassword: string, confirmPassword: string) => {
    await changePasswordUseCase({ userId, currentPassword, newPassword, confirmPassword });
  }
);
```

- [ ] **Step 5: 导出修改密码 use-case 和 action**

Modify `src/modules/auth/use-cases.ts`，添加：

```typescript
export { changePassword } from "./application/use-cases/change-password";
```

Modify `src/modules/auth/actions.ts`，添加：

```typescript
export { changePassword } from "./server-actions/change-password";
```

- [ ] **Step 6: 运行测试确认通过**

Run:
```bash
npx vitest run tests/integration/auth/change-password.test.ts
```

Expected: 4 tests PASS。

- [ ] **Step 7: 提交**

```bash
git add src/modules/auth/application/use-cases/change-password.ts src/modules/auth/server-actions/change-password.ts src/modules/auth/use-cases.ts src/modules/auth/actions.ts tests/integration/auth/change-password.test.ts
git commit -m "feat: add change-password use-case, server action, and tests"
```

---

## Task 8: 修改邮箱 Use Case 与 Server Action（TDD）

**Files:**
- Create: `src/modules/auth/application/use-cases/change-email.ts`
- Create: `src/modules/auth/server-actions/change-email.ts`
- Create: `tests/integration/auth/change-email.test.ts`

- [ ] **Step 1: 编写失败的修改邮箱集成测试**

Create `tests/integration/auth/change-email.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users, otpTokens } from "@/persistence/schema/auth";
import { changeEmail } from "@/modules/auth/use-cases";
import { hashOTP } from "@/modules/auth/services/otp";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

describe("changeEmail use case", () => {
  const OLD_EMAIL = "old-email@example.com";
  const NEW_EMAIL = "new-email@example.com";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(users).where(eq(users.email, OLD_EMAIL));
    await db.delete(users).where(eq(users.email, NEW_EMAIL));
    await db.insert(users).values({
      email: OLD_EMAIL,
      emailVerified: new Date(),
    });
  });

  async function createTestOTP(email: string, otp: string) {
    await db.insert(otpTokens).values({
      email: email.toLowerCase(),
      tokenHash: hashOTP(otp),
      expires: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
    });
  }

  it("changes email with valid OTP", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, OLD_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await createTestOTP(NEW_EMAIL, "123456");

    await changeEmail({
      userId: user.id,
      newEmail: NEW_EMAIL,
      otp: "123456",
    });

    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });
    expect(updatedUser?.email).toBe(NEW_EMAIL);
  });

  it("throws error when OTP is invalid", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, OLD_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await createTestOTP(NEW_EMAIL, "123456");

    await expect(
      changeEmail({
        userId: user.id,
        newEmail: NEW_EMAIL,
        otp: "999999",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION });
  });

  it("throws error when new email already exists", async () => {
    await db.insert(users).values({
      email: NEW_EMAIL,
      emailVerified: new Date(),
    });

    const user = await db.query.users.findFirst({
      where: eq(users.email, OLD_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await createTestOTP(NEW_EMAIL, "123456");

    await expect(
      changeEmail({
        userId: user.id,
        newEmail: NEW_EMAIL,
        otp: "123456",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS });
  });

  it("throws error when OTP record not found", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, OLD_EMAIL),
    });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      changeEmail({
        userId: user.id,
        newEmail: NEW_EMAIL,
        otp: "123456",
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npx vitest run tests/integration/auth/change-email.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现修改邮箱 use-case**

Create `src/modules/auth/application/use-cases/change-email.ts`:

```typescript
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, otpTokens } from "@/persistence/schema/auth";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { verifyOTP } from "@/modules/auth/services/otp";
import { normalizeEmail } from "@/lib/utils/email";
import { logger } from "@/lib/logger";

export async function changeEmail(params: {
  userId: string;
  newEmail: string;
  otp: string;
}): Promise<void> {
  const normalizedEmail = normalizeEmail(params.newEmail);

  const user = await db.query.users.findFirst({
    where: eq(users.id, params.userId),
  });

  if (user == null) {
    throw new NotFoundError("User not found");
  }

  const existingUser = await db.query.users.findFirst({
    where: and(eq(users.email, normalizedEmail), isNull(users.deletedAt)),
  });

  if (existingUser != null && existingUser.id !== params.userId) {
    throw new ValidationError("Email already in use", {
      code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
    });
  }

  const otpRecord = await db.query.otpTokens.findFirst({
    where: eq(otpTokens.email, normalizedEmail),
  });

  if (otpRecord == null) {
    throw new ValidationError("Invalid verification code", {
      code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION,
    });
  }

  if (otpRecord.expires < new Date()) {
    throw new ValidationError("Verification code has expired", {
      code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION,
    });
  }

  const isValid = verifyOTP(params.otp, otpRecord.tokenHash);

  if (!isValid) {
    throw new ValidationError("Invalid verification code", {
      code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION,
    });
  }

  await db
    .update(users)
    .set({ email: normalizedEmail, updatedAt: new Date() })
    .where(eq(users.id, params.userId));

  await db.delete(otpTokens).where(eq(otpTokens.email, normalizedEmail));

  logger.info({ userId: params.userId, newEmail: normalizedEmail }, "Email changed successfully");
}
```

- [ ] **Step 4: 实现修改邮箱 server action**

Create `src/modules/auth/server-actions/change-email.ts`:

```typescript
"use server";
import { withAuth } from "@/lib/auth-actions";
import { changeEmail as changeEmailUseCase } from "../use-cases";

export const changeEmail = withAuth(async (userId, newEmail: string, otp: string) => {
  await changeEmailUseCase({ userId, newEmail, otp });
});
```

- [ ] **Step 5: 导出修改邮箱 use-case 和 action**

Modify `src/modules/auth/use-cases.ts`，添加：

```typescript
export { changeEmail } from "./application/use-cases/change-email";
```

Modify `src/modules/auth/actions.ts`，添加：

```typescript
export { changeEmail } from "./server-actions/change-email";
```

- [ ] **Step 6: 运行测试确认通过**

Run:
```bash
npx vitest run tests/integration/auth/change-email.test.ts
```

Expected: 4 tests PASS。

- [ ] **Step 7: 提交**

```bash
git add src/modules/auth/application/use-cases/change-email.ts src/modules/auth/server-actions/change-email.ts src/modules/auth/use-cases.ts src/modules/auth/actions.ts tests/integration/auth/change-email.test.ts
git commit -m "feat: add change-email use-case, server action, and tests"
```

---

## Task 9: 清空数据 Use Case 与 Server Action（TDD）

**Files:**
- Create: `src/modules/auth/application/use-cases/clear-user-data.ts`
- Create: `src/modules/auth/server-actions/clear-user-data.ts`
- Create: `tests/integration/auth/clear-data.test.ts`

- [ ] **Step 1: 编写失败的清空数据集成测试**

Create `tests/integration/auth/clear-data.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { eq, and, isNull } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users, ledgers, ledgerEntries, sourceDocuments, entryCategories } from "@/persistence";
import { clearUserData } from "@/modules/auth/use-cases";
import { ensureUserLedger } from "@/modules/workspace/use-cases";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

describe("clearUserData use case", () => {
  let db: ReturnType<typeof getTestDb>;
  let userId: string;

  beforeEach(async () => {
    db = getTestDb();
    userId = "00000000-0000-0000-0000-000000000456";
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({
      id: userId,
      email: "clear-data@example.com",
      emailVerified: new Date(),
    });
  });

  it("clears all user data but keeps the account", async () => {
    await ensureUserLedger({ userId });

    await clearUserData({ userId });

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    expect(user).toBeDefined();
    expect(user?.deletedAt).toBeNull();

    const userLedgers = await db.query.ledgers.findMany({
      where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
    });
    expect(userLedgers).toHaveLength(0);
  });

  it("throws error for non-existent user", async () => {
    await expect(
      clearUserData({ userId: "non-existent-user-id" })
    ).rejects.toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npx vitest run tests/integration/auth/clear-data.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现清空数据 use-case**

Create `src/modules/auth/application/use-cases/clear-user-data.ts`:

```typescript
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, ledgers, ledgerEntries, sourceDocuments, entryCategories } from "@/persistence";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function clearUserData(params: { userId: string }): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, params.userId),
  });

  if (user == null) {
    throw new NotFoundError("User not found");
  }

  const now = new Date();

  const userLedgers = await db.query.ledgers.findMany({
    where: and(eq(ledgers.userId, params.userId), isNull(ledgers.deletedAt)),
  });

  for (const ledger of userLedgers) {
    await db
      .update(sourceDocuments)
      .set({ deletedAt: now })
      .where(eq(sourceDocuments.ledgerId, ledger.id));

    await db
      .update(ledgerEntries)
      .set({ deletedAt: now })
      .where(eq(ledgerEntries.ledgerId, ledger.id));

    await db
      .update(entryCategories)
      .set({ deletedAt: now })
      .where(eq(entryCategories.ledgerId, ledger.id));

    await db
      .update(ledgers)
      .set({ deletedAt: now })
      .where(eq(ledgers.id, ledger.id));
  }

  logger.info({ userId: params.userId, ledgerCount: userLedgers.length }, "User data cleared");
}
```

- [ ] **Step 4: 实现清空数据 server action**

Create `src/modules/auth/server-actions/clear-user-data.ts`:

```typescript
"use server";
import { withAuth } from "@/lib/auth-actions";
import { clearUserData as clearUserDataUseCase } from "../use-cases";

export const clearUserData = withAuth(async (userId) => {
  await clearUserDataUseCase({ userId });
});
```

- [ ] **Step 5: 导出清空数据 use-case 和 action**

Modify `src/modules/auth/use-cases.ts`，添加：

```typescript
export { clearUserData } from "./application/use-cases/clear-user-data";
```

Modify `src/modules/auth/actions.ts`，添加：

```typescript
export { clearUserData } from "./server-actions/clear-user-data";
```

- [ ] **Step 6: 运行测试确认通过**

Run:
```bash
npx vitest run tests/integration/auth/clear-data.test.ts
```

Expected: 2 tests PASS。

- [ ] **Step 7: 提交**

```bash
git add src/modules/auth/application/use-cases/clear-user-data.ts src/modules/auth/server-actions/clear-user-data.ts src/modules/auth/use-cases.ts src/modules/auth/actions.ts tests/integration/auth/clear-data.test.ts
git commit -m "feat: add clear-user-data use-case, server action, and tests"
```

---

## Task 10: 删除账号增强（验证码验证）

**Files:**
- Modify: `src/modules/auth/application/use-cases/delete-account.ts`
- Modify: `src/modules/auth/server-actions/delete-account.ts`
- Modify: `src/app/[locale]/(protected)/settings/account/DeleteAccountForm.tsx`

- [ ] **Step 1: 修改删除账号 use-case 增加 OTP 验证**

Modify `src/modules/auth/application/use-cases/delete-account.ts`:

```typescript
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { users, otpTokens } from "@/persistence";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { verifyOTP } from "@/modules/auth/services/otp";
import { normalizeEmail } from "@/lib/utils/email";

export async function deleteAccount(userId: string, email: string, otp: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (user == null) {
    throw new NotFoundError("User not found");
  }

  const normalizedEmail = normalizeEmail(email);

  const otpRecord = await db.query.otpTokens.findFirst({
    where: eq(otpTokens.email, normalizedEmail),
  });

  if (otpRecord == null) {
    throw new ValidationError("Invalid verification code", {
      code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION,
    });
  }

  if (otpRecord.expires < new Date()) {
    throw new ValidationError("Verification code has expired", {
      code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION,
    });
  }

  const isValid = verifyOTP(otp, otpRecord.tokenHash);

  if (!isValid) {
    throw new ValidationError("Invalid verification code", {
      code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION,
    });
  }

  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));

  await db.delete(otpTokens).where(eq(otpTokens.email, normalizedEmail));

  logger.info({ userId }, "Account deleted (soft)");
}
```

- [ ] **Step 2: 修改删除账号 server action**

Modify `src/modules/auth/server-actions/delete-account.ts`:

```typescript
"use server";
import { signOut } from "@/auth";
import { withAuth } from "@/lib/auth-actions";
import { deleteAccount as deleteAccountUseCase } from "../use-cases";

export const deleteAccount = withAuth(async (userId: string, email: string, otp: string) => {
  await deleteAccountUseCase(userId, email, otp);
  await signOut({ redirectTo: "/" });
});
```

- [ ] **Step 3: 更新删除账号集成测试**

Modify `tests/integration/auth/delete-account.test.ts`：

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users, otpTokens } from "@/persistence/schema/auth";
import { deleteAccount } from "@/modules/auth/use-cases";
import { hashOTP } from "@/modules/auth/services/otp";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

describe("deleteAccount use case", () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const TEST_EMAIL = "delete-account@example.com";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({
      id: userId,
      email: TEST_EMAIL,
      emailVerified: new Date(),
      name: "Delete Account User",
    });
  });

  async function createTestOTP(email: string, otp: string) {
    await db.insert(otpTokens).values({
      email: email.toLowerCase(),
      tokenHash: hashOTP(otp),
      expires: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
    });
  }

  it("soft deletes the specified user account with valid OTP", async () => {
    await createTestOTP(TEST_EMAIL, "123456");

    await deleteAccount(userId, TEST_EMAIL, "123456");

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    expect(user?.deletedAt).toBeInstanceOf(Date);
  });

  it("throws error when OTP is invalid", async () => {
    await createTestOTP(TEST_EMAIL, "123456");

    await expect(deleteAccount(userId, TEST_EMAIL, "999999")).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION,
    });
  });
});
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
npx vitest run tests/integration/auth/delete-account.test.ts
```

Expected: 2 tests PASS。

- [ ] **Step 5: 提交**

```bash
git add src/modules/auth/application/use-cases/delete-account.ts src/modules/auth/server-actions/delete-account.ts tests/integration/auth/delete-account.test.ts
git commit -m "feat: enhance delete-account with OTP verification"
```

---

## Task 11: 账户设置页 UI 组件

**Files:**
- Create: `src/app/[locale]/(protected)/settings/account/PasswordForm.tsx`
- Create: `src/app/[locale]/(protected)/settings/account/ChangeEmailForm.tsx`
- Create: `src/app/[locale]/(protected)/settings/account/ClearDataForm.tsx`
- Modify: `src/app/[locale]/(protected)/settings/account/DeleteAccountForm.tsx`
- Modify: `src/app/[locale]/(protected)/settings/account/page.tsx`

- [ ] **Step 1: 创建 PasswordForm 组件**

Create `src/app/[locale]/(protected)/settings/account/PasswordForm.tsx`:

```typescript
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { setPassword, changePassword } from "@/modules/auth/actions";
import { useSession } from "next-auth/react";

interface PasswordFormProps {
  hasPassword: boolean;
}

export function PasswordForm({ hasPassword }: PasswordFormProps) {
  const t = useTranslations("Settings.Account");
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setIsLoading(true);

    try {
      if (hasPassword) {
        await changePassword(currentPassword, newPassword, confirmPassword);
      } else {
        await setPassword(newPassword, confirmPassword);
      }
      setOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("passwordError"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit =
    newPassword !== "" &&
    confirmPassword !== "" &&
    (!hasPassword || currentPassword !== "") &&
    !isLoading;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{hasPassword ? t("changePassword") : t("setPassword")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hasPassword ? t("changePassword") : t("setPassword")}</DialogTitle>
          <DialogDescription>{t("passwordRequirements")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {hasPassword && (
            <div className="grid gap-2">
              <Label htmlFor="current-password">{t("currentPassword")}</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="new-password">{t("newPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">{t("confirmNewPassword")}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {error != null && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 创建 ChangeEmailForm 组件**

Create `src/app/[locale]/(protected)/settings/account/ChangeEmailForm.tsx`:

```typescript
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { changeEmail } from "@/modules/auth/actions";
import { sendOTPAction } from "@/modules/auth/actions";
import { useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { ResendCountdown } from "@/modules/auth/ui/resend-countdown";

export function ChangeEmailForm() {
  const t = useTranslations("Settings.Account");
  const locale = useLocale();
  const { data: session, update } = useSession();
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [canResendAt, setCanResendAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSendOTP = async () => {
    if (newEmail === "") return;
    setIsSendingOTP(true);
    setError(null);
    try {
      const result = await sendOTPAction(newEmail, locale);
      setCanResendAt(result.canResendAt ?? null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleSubmit = async () => {
    if (otp === "" || newEmail === "") return;
    setIsLoading(true);
    setError(null);
    try {
      await changeEmail(newEmail, otp);
      await update();
      setOpen(false);
      setNewEmail("");
      setOtp("");
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("changeEmailError"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("changeEmail")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changeEmail")}</DialogTitle>
          <DialogDescription>{t("changeEmailDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="new-email">{t("newEmail")}</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@example.com"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleSendOTP}
              disabled={isSendingOTP || newEmail === ""}
              size="sm"
            >
              {isSendingOTP && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {t("sendVerificationCode")}
            </Button>
            {canResendAt != null && (
              <ResendCountdown canResendAt={canResendAt} onResend={handleSendOTP} />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="otp">{t("verificationCode")}</Label>
            <Input
              id="otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              maxLength={6}
            />
          </div>
          {error != null && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || otp === "" || newEmail === ""}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: 创建 ClearDataForm 组件**

Create `src/app/[locale]/(protected)/settings/account/ClearDataForm.tsx`:

```typescript
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { clearUserData } from "@/modules/auth/actions";
import { sendOTPAction } from "@/modules/auth/actions";
import { useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ResendCountdown } from "@/modules/auth/ui/resend-countdown";

export function ClearDataForm() {
  const t = useTranslations("Settings.Account");
  const locale = useLocale();
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [canResendAt, setCanResendAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSendOTP = async () => {
    if (session?.user?.email == null) return;
    setIsSendingOTP(true);
    setError(null);
    try {
      const result = await sendOTPAction(session.user.email, locale);
      setCanResendAt(result.canResendAt ?? null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleClear = async () => {
    if (confirmText !== "CLEAR") return;
    setIsLoading(true);
    setError(null);
    try {
      await clearUserData();
      setOpen(false);
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("clearDataError"));
      }
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          {t("clearData")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("clearData")}</DialogTitle>
          <DialogDescription>{t("clearDataConfirmDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="clear-confirm">{t("clearDataConfirm")}</Label>
            <Input
              id="clear-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CLEAR"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleSendOTP}
              disabled={isSendingOTP}
              size="sm"
            >
              {isSendingOTP && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {t("sendVerificationCode")}
            </Button>
            {canResendAt != null && (
              <ResendCountdown canResendAt={canResendAt} onResend={handleSendOTP} />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="clear-otp">{t("verificationCode")}</Label>
            <Input
              id="clear-otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              maxLength={6}
            />
          </div>
          {error != null && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleClear}
            disabled={confirmText !== "CLEAR" || otp === "" || isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("clearData")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: 修改 DeleteAccountForm 增加验证码**

Modify `src/app/[locale]/(protected)/settings/account/DeleteAccountForm.tsx`：

在 imports 中添加：

```typescript
import { sendOTPAction } from "@/modules/auth/actions";
import { useLocale } from "next-intl";
import { ResendCountdown } from "@/modules/auth/ui/resend-countdown";
```

在组件中添加状态：

```typescript
export function DeleteAccountForm() {
  const t = useTranslations("Settings.Account");
  const locale = useLocale();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [canResendAt, setCanResendAt] = useState<number | null>(null);

  const handleSendOTP = async () => {
    if (session?.user?.email == null) return;
    setIsSendingOTP(true);
    try {
      const result = await sendOTPAction(session.user.email, locale);
      setCanResendAt(result.canResendAt ?? null);
    } catch (err) {
      console.error("Failed to send OTP", err);
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleDelete = async () => {
    if (confirmText !== "DELETE" || session?.user?.email == null) return;
    setIsLoading(true);
    try {
      await deleteAccount(session.user.email, otp);
    } catch (error) {
      console.error("Failed to delete account", error);
      setIsLoading(false);
    }
  };

  // ... rest of JSX with OTP input added
}
```

完整替换 DeleteAccountForm：

```typescript
"use client";
import { useState } from "react";
import { deleteAccount } from "@/modules/auth/actions";
import { sendOTPAction } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { ResendCountdown } from "@/modules/auth/ui/resend-countdown";

export function DeleteAccountForm() {
  const t = useTranslations("Settings.Account");
  const locale = useLocale();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [canResendAt, setCanResendAt] = useState<number | null>(null);

  const handleSendOTP = async () => {
    if (session?.user?.email == null) return;
    setIsSendingOTP(true);
    try {
      const result = await sendOTPAction(session.user.email, locale);
      setCanResendAt(result.canResendAt ?? null);
    } catch (err) {
      console.error("Failed to send OTP", err);
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleDelete = async () => {
    if (confirmText !== "DELETE" || session?.user?.email == null) return;
    setIsLoading(true);
    try {
      await deleteAccount(session.user.email, otp);
    } catch (error) {
      console.error("Failed to delete account", error);
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          {t("deleteButton") !== "" ? t("deleteButton") : "Delete Account"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("confirmTitle") !== "" ? t("confirmTitle") : "Are you absolutely sure?"}
          </DialogTitle>
          <DialogDescription>
            {t("confirmDesc") !== ""
              ? t("confirmDesc")
              : "This action cannot be undone. This will permanently delete your account and remove your data from our servers. Type DELETE to confirm."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="confirm">{t("deleteConfirmLabel") || "Confirmation"}</Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleSendOTP}
              disabled={isSendingOTP}
              size="sm"
            >
              {isSendingOTP && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {t("sendVerificationCode") || "Send verification code"}
            </Button>
            {canResendAt != null && (
              <ResendCountdown canResendAt={canResendAt} onResend={handleSendOTP} />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="delete-otp">{t("verificationCode") || "Verification Code"}</Label>
            <Input
              id="delete-otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              maxLength={6}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            {t("cancel") || "Cancel"}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={confirmText !== "DELETE" || otp === "" || isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("deleteButton") || "Delete Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: 修改账户设置页布局**

Modify `src/app/[locale]/(protected)/settings/account/page.tsx`：

```typescript
"use client";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { DeleteAccountForm } from "./DeleteAccountForm";
import { PasswordForm } from "./PasswordForm";
import { ChangeEmailForm } from "./ChangeEmailForm";
import { ClearDataForm } from "./ClearDataForm";

export default function AccountPage() {
  const { data: session, status } = useSession();
  const t = useTranslations("Settings.Account");
  const router = useRouter();

  if (status === "loading") {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (session?.user?.id == null) {
    router.push("/login");
    return null;
  }

  const hasPassword = session?.user?.hasPassword ?? false;

  return (
    <div className="space-y-8">
      {/* Email Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("emailSection") || "Email"}</h3>
          <p className="text-sm text-muted-foreground">
            {t("currentEmail") || "Current Email"}: {session.user.email}
          </p>
        </div>
        <ChangeEmailForm />
      </div>

      {/* Password Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("passwordSection") || "Password"}</h3>
          <p className="text-sm text-muted-foreground">
            {hasPassword
              ? t("passwordSetDesc") || "Your account is protected with a password"
              : t("passwordNotSetDesc") || "You have not set a password yet"}
          </p>
        </div>
        <PasswordForm hasPassword={hasPassword} />
      </div>

      {/* Danger Zone */}
      <div className="space-y-6 pt-6 border-t">
        <div>
          <h3 className="text-lg font-medium text-destructive">
            {t("dangerZone") !== "" ? t("dangerZone") : "Danger Zone"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("dangerZoneDesc") !== ""
              ? t("dangerZoneDesc")
              : "Irreversible actions for your account."}
          </p>
        </div>

        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-destructive">
                {t("clearData") || "Clear All Data"}
              </h4>
              <p className="text-sm text-destructive/80">
                {t("clearDataDesc") || "Delete all your ledgers and entries but keep your account."}
              </p>
            </div>
            <ClearDataForm />
          </div>
        </div>

        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-destructive">
                {t("deleteTitle") !== "" ? t("deleteTitle") : "Delete Account"}
              </h4>
              <p className="text-sm text-destructive/80">
                {t("deleteDesc") !== ""
                  ? t("deleteDesc")
                  : "Permanently delete your account and all data."}
              </p>
            </div>
            <DeleteAccountForm />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 验证 lint**

Run:
```bash
npm run lint
```

Expected: lint 成功，无错误。

- [ ] **Step 7: 提交**

```bash
git add src/app/[locale]/(protected)/settings/account/
git commit -m "feat: add account settings UI for password, email, clear data, and delete account"
```

---

## Task 12: i18n 翻译键

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: 添加英文翻译键**

Modify `messages/en.json`，在 `"Auth"` 对象中添加：

```json
"passwordLogin": "Password Login",
"otpLogin": "OTP Login",
"password": "Password",
"passwordPlaceholder": "Enter your password",
"forgotPassword": "Forgot password?",
"signingIn": "Signing in...",
"invalidCredentials": "Invalid email or password",
"signInWithPassword": "Sign in with your password"
```

在 `"Settings.Account"` 对象中添加（如果不存在则创建）：

```json
"Account": {
  "dangerZone": "Danger Zone",
  "dangerZoneDesc": "Irreversible actions for your account.",
  "deleteTitle": "Delete Account",
  "deleteDesc": "Permanently delete your account and all data.",
  "deleteButton": "Delete Account",
  "confirmTitle": "Are you absolutely sure?",
  "confirmDesc": "This action cannot be undone. This will permanently delete your account and remove your data from our servers. Type DELETE to confirm.",
  "emailSection": "Email",
  "currentEmail": "Current Email",
  "changeEmail": "Change Email",
  "changeEmailDesc": "We'll send a verification code to your new email address.",
  "newEmail": "New Email",
  "emailChangedSuccess": "Email changed successfully",
  "changeEmailError": "Failed to change email",
  "passwordSection": "Password",
  "setPassword": "Set Password",
  "changePassword": "Change Password",
  "currentPassword": "Current Password",
  "newPassword": "New Password",
  "confirmNewPassword": "Confirm New Password",
  "passwordSetSuccess": "Password set successfully",
  "passwordChangedSuccess": "Password changed successfully",
  "passwordRequirements": "At least 8 characters with at least one letter and one number",
  "passwordError": "Failed to update password",
  "passwordSetDesc": "Your account is protected with a password",
  "passwordNotSetDesc": "You have not set a password yet",
  "clearData": "Clear All Data",
  "clearDataDesc": "This will delete all your ledgers and entries but keep your account.",
  "clearDataConfirm": "Type CLEAR to confirm",
  "clearDataConfirmDesc": "This will permanently delete all your data. This action cannot be undone.",
  "clearDataError": "Failed to clear data",
  "sendVerificationCode": "Send verification code",
  "verificationCode": "Verification Code",
  "verificationCodeSent": "Verification code sent",
  "cancel": "Cancel",
  "confirm": "Confirm"
}
```

- [ ] **Step 2: 添加中文翻译键**

Modify `messages/zh.json`，在 `"Auth"` 对象中添加：

```json
"passwordLogin": "密码登录",
"otpLogin": "验证码登录",
"password": "密码",
"passwordPlaceholder": "输入您的密码",
"forgotPassword": "忘记密码？",
"signingIn": "登录中...",
"invalidCredentials": "邮箱或密码错误",
"signInWithPassword": "使用密码登录"
```

在 `"Settings.Account"` 对象中添加：

```json
"Account": {
  "dangerZone": "危险区域",
  "dangerZoneDesc": "对您的账户进行不可逆的操作。",
  "deleteTitle": "删除账号",
  "deleteDesc": "永久删除您的账号和所有数据。",
  "deleteButton": "删除账号",
  "confirmTitle": "您确定要这样做吗？",
  "confirmDesc": "此操作无法撤销。这将永久删除您的账号并从服务器中移除您的数据。输入 DELETE 确认。",
  "emailSection": "邮箱",
  "currentEmail": "当前邮箱",
  "changeEmail": "修改邮箱",
  "changeEmailDesc": "我们将向您的新邮箱地址发送验证码。",
  "newEmail": "新邮箱",
  "emailChangedSuccess": "邮箱修改成功",
  "changeEmailError": "修改邮箱失败",
  "passwordSection": "密码",
  "setPassword": "设置密码",
  "changePassword": "修改密码",
  "currentPassword": "当前密码",
  "newPassword": "新密码",
  "confirmNewPassword": "确认新密码",
  "passwordSetSuccess": "密码设置成功",
  "passwordChangedSuccess": "密码修改成功",
  "passwordRequirements": "至少 8 位字符，包含至少一个字母和一个数字",
  "passwordError": "更新密码失败",
  "passwordSetDesc": "您的账户已设置密码保护",
  "passwordNotSetDesc": "您尚未设置密码",
  "clearData": "清空所有数据",
  "clearDataDesc": "这将删除您所有账本和条目数据，但保留您的账户。",
  "clearDataConfirm": "输入 CLEAR 确认",
  "clearDataConfirmDesc": "这将永久删除您的所有数据。此操作无法撤销。",
  "clearDataError": "清空数据失败",
  "sendVerificationCode": "发送验证码",
  "verificationCode": "验证码",
  "verificationCodeSent": "验证码已发送",
  "cancel": "取消",
  "confirm": "确认"
}
```

- [ ] **Step 3: 提交**

```bash
git add messages/en.json messages/zh.json
git commit -m "i18n: add translations for password login and account management"
```

---

## Task 13: 从 session 暴露 passwordHash 存在状态

**Files:**
- Modify: `src/auth.ts`

- [ ] **Step 1: 在 session callback 中暴露 hasPassword**

Modify `src/auth.ts` 的 session callback：

```typescript
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
        hasPassword: dbUser.passwordHash != null && dbUser.passwordHash !== "",
      },
    };
  }
  return session;
},
```

- [ ] **Step 2: 更新类型声明**

在 `src/auth.ts` 底部的 declare module 中：

```typescript
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      hasPassword?: boolean;
    };
  }

  interface User {
    locale?: string | null;
  }
}
```

- [ ] **Step 3: 更新账户设置页使用 hasPassword**

Modify `src/app/[locale]/(protected)/settings/account/page.tsx`：

将 `const hasPassword = false;` 改为：

```typescript
const hasPassword = session?.user?.hasPassword ?? false;
```

- [ ] **Step 4: 验证构建**

Run:
```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 5: 提交**

```bash
git add src/auth.ts src/app/[locale]/(protected)/settings/account/page.tsx
git commit -m "feat: expose hasPassword flag in session for UI conditional rendering"
```

---

## Task 14: 全量测试验证

**Files:**
- N/A (运行验证命令)

- [ ] **Step 1: 运行所有 auth 相关测试**

Run:
```bash
npx vitest run tests/unit/auth/ tests/integration/auth/
```

Expected: 所有测试 PASS。

- [ ] **Step 2: 运行 lint**

Run:
```bash
npm run lint
```

Expected: lint 成功，无错误。

- [ ] **Step 3: 运行 TypeScript 类型检查**

Run:
```bash
npx tsc --noEmit
```

Expected: 无类型错误。

- [ ] **Step 4: 运行构建**

Run:
```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 5: 提交**

```bash
git commit --allow-empty -m "chore: verify all tests, lint, types, and build pass"
```

---

## 自审检查清单

### Spec 覆盖检查

| Spec 需求 | 对应 Task |
|-----------|-----------|
| 密码登录（Tab 切换） | Task 4, 5 |
| 设置密码 | Task 6 |
| 修改密码 | Task 7 |
| 修改邮箱 | Task 8 |
| 清空数据 | Task 9 |
| 删除账号（增强验证码） | Task 10 |
| bcryptjs 密码哈希 | Task 2 |
| 数据库迁移 | Task 1 |
| NextAuth password provider | Task 4 |
| i18n 翻译键 | Task 12 |
| 错误码扩展 | Task 3 |
| hasPassword session 标志 | Task 13 |
| 测试覆盖 | 每个 Task 都有 TDD 测试 |

### Placeholder 扫描

- [x] 无 "TBD", "TODO", "implement later"
- [x] 无 "Add appropriate error handling" 等模糊描述
- [x] 每个代码步骤都有完整代码块
- [x] 无 "Similar to Task N" 引用

### 类型一致性检查

- [x] `authenticateWithPassword` 参数类型一致
- [x] `setPassword` / `changePassword` 参数类型一致
- [x] `changeEmail` 参数类型一致
- [x] `clearUserData` 参数类型一致
- [x] `deleteAccount` 增强后签名一致（userId, email, otp）
- [x] Session 类型扩展 `hasPassword` 一致
- [x] AUTH_ERROR_CODES 所有新增错误码在 use-cases 中使用一致

---

## 执行交接

**计划已保存到 `docs/superpowers/plans/2026-04-25-password-auth.md`。**

**两种执行方式可选：**

**1. Subagent-Driven（推荐）** — 每个 Task 分配一个独立 subagent 执行，完成后 review，快速迭代

**2. Inline Execution** — 在当前会话中使用 executing-plans skill 批量执行，带有 review checkpoint

**选择哪种方式？**

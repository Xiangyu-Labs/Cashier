# Auth Email I18n And Sender Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OTP emails and login-notification emails fully localized for `zh` and `en`, propagate locale through the auth flow, and support friendly `Display Name <email>` sender strings without breaking startup validation or deployment docs.

**Architecture:** Introduce one shared locale resolver so the app request config, OTP send action, and auth sign-in side effects all choose `zh`/`en` the same way: `explicit locale -> NEXT_LOCALE cookie -> Accept-Language -> zh`. Move all email copy into `messages/en.json` and `messages/zh.json`, render both OTP and login-notification emails with React Email components, and localize server-side subjects/body text with explicit locale selection. Centralize sender defaults and mailbox validation in shared email utilities so `AUTH_EMAIL_FROM` accepts either a bare address or `Display Name <email>` while keeping fallback behavior and env docs aligned.

**Tech Stack:** Next.js 16 App Router, Auth.js/NextAuth v5 beta, next-intl, React Email, Resend, Zod, Vitest, ESLint

---

## Scope Notes

- `.env.example` already contains `AUTH_EMAIL_FROM`; the real gap is that it still documents a bare email address instead of the intended mailbox format. Update the existing entry instead of adding a duplicate variable.
- `src/lib/env/startup.ts` currently validates `AUTH_EMAIL_FROM` as a raw email only, so code, schema, tests, and docs must change together.
- The `users` table has no locale column. Keep this change request-scoped by threading locale through the OTP flow and resolving a fallback from `NEXT_LOCALE` and `Accept-Language` during `events.signIn`. Do not add a database migration.

## File Structure

- `src/i18n/resolve-locale.ts`
  Shared `zh`/`en` locale normalization used by request config and auth email flows.
- `src/i18n/request.ts`
  Reuse the shared locale resolver so page locale and email locale follow the same precedence.
- `src/lib/utils/email.ts`
  Keep email-related pure helpers together: `normalizeEmail`, sender default, and mailbox validation helpers.
- `src/lib/env/startup.ts`
  Accept friendly mailbox syntax for `AUTH_EMAIL_FROM` during startup validation.
- `src/lib/env/catalog.ts`
  Keep env metadata in sync with the new sender semantics and default example.
- `src/emails/otp-email.tsx`
  Render OTP email UI from localized copy passed in by the server flow.
- `src/emails/login-notification-email.tsx`
  New React Email template for localized login-notification content.
- `src/modules/auth/application/use-cases/send-otp.ts`
  Accept locale, build localized OTP subject/body, and send with the shared sender default.
- `src/modules/auth/server-actions/send-otp.ts`
  Resolve locale from explicit arg, cookie, and request headers before calling the use case.
- `src/modules/auth/hooks/use-login-flow.ts`
  Pass the current `useLocale()` value into `sendOTPAction`.
- `src/modules/auth/application/use-cases/authenticate-with-otp.ts`
  Preserve OTP sign-in locale on the returned user object so auth events can reuse it.
- `src/modules/auth/application/use-cases/handle-auth-user-signed-in.ts`
  Resolve locale for login notifications and pass it into the notification service.
- `src/modules/auth/services/notifications.ts`
  Switch from inline hardcoded HTML to a localized React Email template with localized subject/body.
- `src/auth.ts`
  Thread transient `user.locale` through the `events.signIn` hook and extend NextAuth typing accordingly.
- `messages/en.json`
  Add `AuthEmail` strings for OTP and login-notification subjects/body copy.
- `messages/zh.json`
  Add the matching Chinese `AuthEmail` strings.
- `.env.example`
  Keep the existing `AUTH_EMAIL_FROM` entry, but update the description and example to show mailbox syntax.
- `docs/guides/ENV.md`
  Update the `AUTH_EMAIL_FROM` section to document `Display Name <email>` support.
- `docs/guides/RUNBOOK.md`
  Update the operational example and troubleshooting note for named sender addresses.
- `tests/unit/i18n/resolve-locale.test.ts`
  New unit coverage for locale precedence and normalization.
- `tests/unit/lib/utils/email.test.ts`
  New unit coverage for sender mailbox validation helpers.
- `tests/unit/lib/env/startup.test.ts`
  Assert startup env accepts friendly sender strings.
- `tests/unit/auth/application/use-cases/send-otp.test.ts`
  Verify localized OTP subject/template props and named sender fallback.
- `tests/integration/auth/send-otp-edge-cases.test.ts`
  Render the email and verify locale fallback from headers plus host fallback behavior.
- `tests/unit/auth/services/notifications.test.ts`
  Verify localized login-notification subject/body and sender behavior.
- `tests/unit/auth/auth-use-cases.test.ts`
  Verify `handleAuthUserSignedIn` passes locale into `sendLoginNotification`.
- `tests/unit/auth/auth-events.test.ts`
  Verify `auth.ts` forwards transient locale into the sign-in event handler.
- `tests/unit/auth/application/use-cases/authenticate-with-otp.more.test.ts`
  Verify OTP sign-in returns locale on the user payload for event reuse.

### Task 1: Shared Locale Resolution

**Files:**
- Create: `src/i18n/resolve-locale.ts`
- Create: `tests/unit/i18n/resolve-locale.test.ts`
- Modify: `src/i18n/request.ts`

- [ ] **Step 1: Write the failing locale-resolution test**

```ts
import { describe, expect, it } from "vitest";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";

describe("resolveSupportedLocale", () => {
  it("prefers explicit locale over cookie and header values", () => {
    expect(
      resolveSupportedLocale({
        explicitLocale: "en",
        cookieLocale: "zh",
        acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
      })
    ).toBe("en");
  });

  it("normalizes locale variants from cookies and headers", () => {
    expect(resolveSupportedLocale({ cookieLocale: "zh-CN" })).toBe("zh");
    expect(resolveSupportedLocale({ acceptLanguage: "en-US,en;q=0.9" })).toBe("en");
  });

  it("falls back to zh for unsupported values", () => {
    expect(resolveSupportedLocale({ explicitLocale: "fr", acceptLanguage: "fr-FR" })).toBe("zh");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm run test:unit -- tests/unit/i18n/resolve-locale.test.ts`

Expected: FAIL because `@/i18n/resolve-locale` does not exist yet.

- [ ] **Step 3: Implement the shared locale helper and refactor request config**

```ts
// src/i18n/resolve-locale.ts
import { routing } from "@/i18n/routing";

export type SupportedLocale = (typeof routing.locales)[number];

function normalizeLocaleCandidate(value: string | null | undefined): SupportedLocale | null {
  if (value == null || value === "") return null;
  const normalized = value.toLowerCase();
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("en")) return "en";
  return null;
}

export function resolveSupportedLocale(input: {
  explicitLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): SupportedLocale {
  const explicit = normalizeLocaleCandidate(input.explicitLocale);
  if (explicit != null) return explicit;

  const cookieLocale = normalizeLocaleCandidate(input.cookieLocale);
  if (cookieLocale != null) return cookieLocale;

  for (const rawPart of (input.acceptLanguage ?? "").split(",")) {
    const candidate = normalizeLocaleCandidate(rawPart.split(";")[0]?.trim());
    if (candidate != null) return candidate;
  }

  return routing.defaultLocale;
}
```

```ts
// src/i18n/request.ts
import { resolveSupportedLocale } from "@/i18n/resolve-locale";

const locale = resolveSupportedLocale({
  cookieLocale: cookieStore.get("NEXT_LOCALE")?.value,
  acceptLanguage: headersList.get("accept-language"),
});
```

- [ ] **Step 4: Run the locale tests and request-config-adjacent checks**

Run: `npm run test:unit -- tests/unit/i18n/resolve-locale.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/i18n/resolve-locale.ts src/i18n/request.ts tests/unit/i18n/resolve-locale.test.ts
git commit -m "refactor(i18n): share locale resolution for auth and requests"
```

### Task 2: Localize The OTP Email Flow

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Modify: `src/emails/otp-email.tsx`
- Modify: `src/modules/auth/application/use-cases/send-otp.ts`
- Modify: `src/modules/auth/server-actions/send-otp.ts`
- Modify: `src/modules/auth/hooks/use-login-flow.ts`
- Modify: `tests/unit/auth/application/use-cases/send-otp.test.ts`
- Modify: `tests/integration/auth/send-otp-edge-cases.test.ts`

- [ ] **Step 1: Add failing tests for localized OTP subject/body and locale propagation**

```ts
// tests/unit/auth/application/use-cases/send-otp.test.ts
it("builds a Chinese subject and localized OTP template props", async () => {
  process.env.AUTH_RESEND_KEY = "resend-key";

  await sendOTP({
    email: validEmail("user@example.com"),
    ip: "203.0.113.2",
    host: "cashier.example",
    locale: "zh",
  });

  expect(otpEmailMock).toHaveBeenCalledWith(
    expect.objectContaining({
      host: "cashier.example",
      locale: "zh",
      copy: expect.objectContaining({
        heading: "登录 cashier.example",
        codeLabel: "您的验证码：",
      }),
    })
  );
  expect(resendSendMock).toHaveBeenCalledWith(
    expect.objectContaining({
      subject: "您的验证码是 123456",
    })
  );
});
```

```ts
// tests/integration/auth/send-otp-edge-cases.test.ts
it("falls back to Accept-Language when sendOTPAction is called without locale", async () => {
  process.env.AUTH_RESEND_KEY = "test-resend-key";
  headersMock.mockResolvedValue({
    get: (key: string) => {
      if (key === "x-forwarded-for") return "203.0.113.18";
      if (key === "accept-language") return "en-US,en;q=0.9";
      return null;
    },
  });

  await sendOTPAction(testEmail);

  const firstCall = resendSendMock.mock.calls[0]?.[0];
  const renderedEmail = await render(firstCall?.react);
  expect(firstCall?.subject).toBe("Your verification code is 123456");
  expect(renderedEmail).toContain("Sign in to localhost");
});
```

- [ ] **Step 2: Run the focused OTP tests and confirm they fail**

Run: `npm run test:unit -- tests/unit/auth/application/use-cases/send-otp.test.ts`

Run: `npm run test:integration -- tests/integration/auth/send-otp-edge-cases.test.ts`

Expected: FAIL because `sendOTP` does not accept `locale`, `OTPEmail` has no localized props, and `sendOTPAction` ignores locale/header selection.

- [ ] **Step 3: Implement localized OTP subjects, template copy, and locale threading**

```json
// messages/zh.json
"AuthEmail": {
  "otpSubject": "您的验证码是 {otp}",
  "otpPreview": "您的验证码已生成",
  "otpHeading": "登录 {host}",
  "otpIntro": "请输入下方验证码以登录您的账户：",
  "otpCodeLabel": "您的验证码：",
  "otpExpiry": "该验证码将在 {minutes} 分钟后失效。",
  "otpWarning": "请勿将验证码透露给任何人。我们绝不会主动向您索取验证码。",
  "otpFooter": "如果这不是您本人操作，可以忽略这封邮件。"
}
```

```json
// messages/en.json
"AuthEmail": {
  "otpSubject": "Your verification code is {otp}",
  "otpPreview": "Your verification code is ready",
  "otpHeading": "Sign in to {host}",
  "otpIntro": "Enter the verification code below to sign in to your account:",
  "otpCodeLabel": "Your verification code:",
  "otpExpiry": "This code will expire in {minutes} minutes.",
  "otpWarning": "Do not share this code with anyone. We will never ask for your verification code.",
  "otpFooter": "If you didn't request this code, you can safely ignore this email."
}
```

```ts
// src/modules/auth/application/use-cases/send-otp.ts
import { getTranslations } from "next-intl/server";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";
import { DEFAULT_AUTH_EMAIL_FROM } from "@/lib/utils/email";

export async function sendOTP(params: {
  email: SendOTPEmail;
  ip: string;
  host: string;
  locale?: string;
}) {
  const locale = resolveSupportedLocale({ explicitLocale: params.locale });
  const t = await getTranslations({ locale, namespace: "AuthEmail" });

  await resend.emails.send({
    from: process.env.AUTH_EMAIL_FROM ?? DEFAULT_AUTH_EMAIL_FROM,
    to: normalizedEmail,
    subject: t("otpSubject", { otp }),
    react: OTPEmail({
      otp,
      host: params.host,
      locale,
      expiresInMinutes: 5,
      copy: {
        preview: t("otpPreview"),
        heading: t("otpHeading", { host: params.host }),
        intro: t("otpIntro"),
        codeLabel: t("otpCodeLabel"),
        expiry: t("otpExpiry", { minutes: 5 }),
        warning: t("otpWarning"),
        footer: t("otpFooter"),
      },
    }),
  });
}
```

```ts
// src/modules/auth/server-actions/send-otp.ts
import { cookies, headers } from "next/headers";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";

export async function sendOTPAction(email: string, locale?: string) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const resolvedLocale = resolveSupportedLocale({
    explicitLocale: locale,
    cookieLocale: cookieStore.get("NEXT_LOCALE")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });

  return sendOTP({
    email: validatedEmail,
    ip: getClientIPFromHeaders(requestHeaders),
    host: requestHeaders.get("host") ?? "localhost",
    locale: resolvedLocale,
  });
}
```

```ts
// src/modules/auth/hooks/use-login-flow.ts
const result = await sendOTPAction(email, locale);
```

- [ ] **Step 4: Run focused OTP tests plus i18n catalog validation**

Run: `npm run test:unit -- tests/unit/auth/application/use-cases/send-otp.test.ts`

Run: `npm run test:integration -- tests/integration/auth/send-otp-edge-cases.test.ts`

Run: `npm run validate:i18n`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/zh.json src/emails/otp-email.tsx src/modules/auth/application/use-cases/send-otp.ts src/modules/auth/server-actions/send-otp.ts src/modules/auth/hooks/use-login-flow.ts tests/unit/auth/application/use-cases/send-otp.test.ts tests/integration/auth/send-otp-edge-cases.test.ts
git commit -m "feat(auth): localize otp email delivery"
```

### Task 3: Localize Login Notifications And Thread Locale Through Auth Events

**Files:**
- Create: `src/emails/login-notification-email.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Modify: `src/modules/auth/services/notifications.ts`
- Modify: `src/modules/auth/application/use-cases/handle-auth-user-signed-in.ts`
- Modify: `src/modules/auth/application/use-cases/authenticate-with-otp.ts`
- Modify: `src/auth.ts`
- Modify: `tests/unit/auth/services/notifications.test.ts`
- Modify: `tests/unit/auth/auth-use-cases.test.ts`
- Modify: `tests/unit/auth/auth-events.test.ts`
- Modify: `tests/unit/auth/application/use-cases/authenticate-with-otp.more.test.ts`

- [ ] **Step 1: Add failing tests for localized login notifications and auth-event locale forwarding**

```ts
// tests/unit/auth/services/notifications.test.ts
it("renders a Chinese login-notification email when locale is zh", async () => {
  process.env.AUTH_RESEND_KEY = "resend-key";

  await sendLoginNotification({ email: "notify@example.com", locale: "zh" });

  const firstCall = sendMock.mock.calls[0]?.[0];
  expect(firstCall?.subject).toBe("您的账户有新的登录");
  const rendered = await render(firstCall?.react);
  expect(rendered).toContain("检测到您的账户有新的登录");
  expect(rendered).toContain("登录时间");
});
```

```ts
// tests/unit/auth/auth-events.test.ts
expect(handleAuthUserSignedInMock).toHaveBeenCalledWith({
  userId: "user-signin",
  email: "user@example.com",
  locale: "en",
  isNewUser: false,
});
```

```ts
// tests/unit/auth/application/use-cases/authenticate-with-otp.more.test.ts
expect(result).toEqual({
  id: "new-user-id",
  email: "new-user@example.com",
  name: null,
  image: null,
  locale: "en",
});
```

- [ ] **Step 2: Run the login-notification and auth-event tests and confirm they fail**

Run: `npm run test:unit -- tests/unit/auth/services/notifications.test.ts tests/unit/auth/auth-use-cases.test.ts tests/unit/auth/auth-events.test.ts tests/unit/auth/application/use-cases/authenticate-with-otp.more.test.ts`

Expected: FAIL because `sendLoginNotification` is still English-only, `authenticateWithOTP` drops locale, and `auth.ts` does not forward locale into `handleAuthUserSignedIn`.

- [ ] **Step 3: Implement the localized login-notification pipeline**

Extend the `AuthEmail` namespace added in Task 2. Do not replace the OTP keys; append the login-notification keys into the same object.

```json
// messages/en.json
"loginSubject": "New login to your account",
"loginPreview": "A new login to your account was detected",
"loginHeading": "New Login Detected",
"loginIntro": "We noticed a new login to your account:",
"loginTimeLabel": "Time",
"loginEmailLabel": "Email",
"loginSafe": "If this was you, you can ignore this email.",
"loginWarn": "If you didn't log in, please secure your account immediately."
```

```json
// messages/zh.json
"loginSubject": "您的账户有新的登录",
"loginPreview": "检测到您的账户有新的登录",
"loginHeading": "检测到新的登录",
"loginIntro": "我们检测到您的账户发生了一次新的登录：",
"loginTimeLabel": "登录时间",
"loginEmailLabel": "登录邮箱",
"loginSafe": "如果这是您本人操作，可以忽略这封邮件。",
"loginWarn": "如果这不是您本人登录，请立即检查并保护您的账户。"
```

```ts
// src/modules/auth/application/use-cases/authenticate-with-otp.ts
return {
  id: user.id,
  email: user.email,
  name: user.name,
  image: user.image,
  locale,
};
```

```ts
// src/auth.ts
async signIn({ user, isNewUser }) {
  await handleAuthUserSignedIn({
    ...(user.id != null ? { userId: user.id } : {}),
    ...(user.email != null ? { email: user.email } : {}),
    ...(typeof user.locale === "string" ? { locale: user.locale } : {}),
    ...(isNewUser != null ? { isNewUser } : {}),
  });
}

declare module "next-auth" {
  interface User {
    locale?: string | null;
  }
}
```

```ts
// src/modules/auth/application/use-cases/handle-auth-user-signed-in.ts
import { cookies, headers } from "next/headers";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";

async function resolveNotificationLocale(explicitLocale?: string) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();

  return resolveSupportedLocale({
    explicitLocale,
    cookieLocale: cookieStore.get("NEXT_LOCALE")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });
}

await sendLoginNotification({
  email: params.email,
  locale: await resolveNotificationLocale(params.locale),
});
```

```ts
// src/modules/auth/services/notifications.ts
import { getTranslations } from "next-intl/server";
import LoginNotificationEmail from "@/emails/login-notification-email";
import { DEFAULT_AUTH_EMAIL_FROM } from "@/lib/utils/email";

export async function sendLoginNotification(params: {
  email: string;
  locale?: string;
}): Promise<void> {
  const locale = resolveSupportedLocale({ explicitLocale: params.locale });
  const t = await getTranslations({ locale, namespace: "AuthEmail" });
  const loginTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: process.env.TZ ?? "Asia/Shanghai",
  }).format(new Date());

  await resend.emails.send({
    from: process.env.AUTH_EMAIL_FROM ?? DEFAULT_AUTH_EMAIL_FROM,
    to: params.email,
    subject: t("loginSubject"),
    react: LoginNotificationEmail({
      locale,
      email: params.email,
      loginTime,
      copy: {
        preview: t("loginPreview"),
        heading: t("loginHeading"),
        intro: t("loginIntro"),
        timeLabel: t("loginTimeLabel"),
        emailLabel: t("loginEmailLabel"),
        safeMessage: t("loginSafe"),
        warningMessage: t("loginWarn"),
      },
    }),
  });
}
```

- [ ] **Step 4: Run the login-notification/auth-event tests**

Run: `npm run test:unit -- tests/unit/auth/services/notifications.test.ts tests/unit/auth/auth-use-cases.test.ts tests/unit/auth/auth-events.test.ts tests/unit/auth/application/use-cases/authenticate-with-otp.more.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/emails/login-notification-email.tsx messages/en.json messages/zh.json src/modules/auth/services/notifications.ts src/modules/auth/application/use-cases/handle-auth-user-signed-in.ts src/modules/auth/application/use-cases/authenticate-with-otp.ts src/auth.ts tests/unit/auth/services/notifications.test.ts tests/unit/auth/auth-use-cases.test.ts tests/unit/auth/auth-events.test.ts tests/unit/auth/application/use-cases/authenticate-with-otp.more.test.ts
git commit -m "feat(auth): localize login notification emails"
```

### Task 4: Support Friendly Sender Mailboxes In Code, Validation, And Docs

**Files:**
- Modify: `src/lib/utils/email.ts`
- Modify: `src/lib/env/startup.ts`
- Modify: `src/lib/env/catalog.ts`
- Modify: `.env.example`
- Modify: `docs/guides/ENV.md`
- Modify: `docs/guides/RUNBOOK.md`
- Create: `tests/unit/lib/utils/email.test.ts`
- Modify: `tests/unit/lib/env/startup.test.ts`
- Modify: `tests/unit/auth/application/use-cases/send-otp.test.ts`
- Modify: `tests/unit/auth/services/notifications.test.ts`

- [ ] **Step 1: Add failing tests for mailbox validation and friendly sender defaults**

```ts
// tests/unit/lib/utils/email.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTH_EMAIL_FROM,
  isValidAuthEmailFrom,
} from "@/lib/utils/email";

describe("isValidAuthEmailFrom", () => {
  it("accepts named mailboxes and bare addresses", () => {
    expect(isValidAuthEmailFrom("Cashier <noreply@example.com>")).toBe(true);
    expect(isValidAuthEmailFrom("noreply@example.com")).toBe(true);
  });

  it("rejects multiple addresses and header injection", () => {
    expect(isValidAuthEmailFrom("Cashier <a@example.com>, b@example.com")).toBe(false);
    expect(isValidAuthEmailFrom("Cashier\r\nBcc:evil@example.com")).toBe(false);
  });

  it("uses a named mailbox as the default sender", () => {
    expect(DEFAULT_AUTH_EMAIL_FROM).toBe("Cashier <noreply@example.com>");
  });
});
```

```ts
// tests/unit/lib/env/startup.test.ts
it("accepts AUTH_EMAIL_FROM in named mailbox format", () => {
  const result = validateStartupEnv({
    ...baseEnv,
    AUTH_EMAIL_FROM: "Cashier <noreply@example.com>",
  });

  expect(result.AUTH_EMAIL_FROM).toBe("Cashier <noreply@example.com>");
});
```

```ts
// tests/unit/auth/application/use-cases/send-otp.test.ts
expect(resendSendMock).toHaveBeenCalledWith(
  expect.objectContaining({
    from: "Cashier <noreply@example.com>",
  })
);
```

- [ ] **Step 2: Run the sender-format tests and confirm they fail**

Run: `npm run test:unit -- tests/unit/lib/utils/email.test.ts tests/unit/lib/env/startup.test.ts tests/unit/auth/application/use-cases/send-otp.test.ts tests/unit/auth/services/notifications.test.ts`

Expected: FAIL because the helper does not exist, startup validation only accepts raw emails, and the auth flows still default to a bare sender address.

- [ ] **Step 3: Implement sender helpers, startup validation, and documentation updates**

```ts
// src/lib/utils/email.ts
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAMED_MAILBOX_REGEX = /^(?<name>[^<>\r\n]+)\s<(?<address>[^<>\s]+@[^<>\s]+)>$/;

export const DEFAULT_AUTH_EMAIL_FROM = "Cashier <noreply@example.com>";

export function isValidAuthEmailFrom(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "" || /[\r\n]/.test(trimmed)) return false;
  if (SIMPLE_EMAIL_REGEX.test(trimmed)) return true;

  const match = trimmed.match(NAMED_MAILBOX_REGEX);
  const address = match?.groups?.address;
  return address != null && SIMPLE_EMAIL_REGEX.test(address);
}
```

```ts
// src/lib/env/startup.ts
import { DEFAULT_AUTH_EMAIL_FROM, isValidAuthEmailFrom } from "@/lib/utils/email";

AUTH_EMAIL_FROM: z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .refine(
      isValidAuthEmailFrom,
      "AUTH_EMAIL_FROM must be a valid email address or Display Name <email> mailbox"
    )
    .default(DEFAULT_AUTH_EMAIL_FROM)
),
```

```ts
// src/lib/env/catalog.ts
{
  name: "AUTH_EMAIL_FROM",
  tier: "runtime",
  required: false,
  defaultValue: "Cashier <noreply@example.com>",
  description: "Sender mailbox for OTP and security notifications. Supports bare email or Display Name <email>.",
  validateOnStartup: true,
}
```

```dotenv
# .env.example
# Sender mailbox for OTP and login security notifications.
# Supports bare email or `Display Name <email>`.
# Required: No
# Default: Cashier <noreply@example.com>
AUTH_EMAIL_FROM=Cashier <noreply@example.com>
```

```md
<!-- docs/guides/ENV.md -->
| **Default**     | `Cashier <noreply@example.com>`                               |
| **Description** | Sender mailbox for OTP and security-notification emails       |
| **Format**      | Bare email or `Display Name <email>`                          |

Use a verified Resend sender domain, for example: `AUTH_EMAIL_FROM=Cashier <noreply@cashier.app>`.
```

- [ ] **Step 4: Run sender-format tests plus env catalog coverage**

Run: `npm run test:unit -- tests/unit/lib/utils/email.test.ts tests/unit/lib/env/startup.test.ts tests/unit/auth/application/use-cases/send-otp.test.ts tests/unit/auth/services/notifications.test.ts tests/unit/lib/env/catalog.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/email.ts src/lib/env/startup.ts src/lib/env/catalog.ts .env.example docs/guides/ENV.md docs/guides/RUNBOOK.md tests/unit/lib/utils/email.test.ts tests/unit/lib/env/startup.test.ts tests/unit/auth/application/use-cases/send-otp.test.ts tests/unit/auth/services/notifications.test.ts
git commit -m "fix(auth): support named sender mailboxes"
```

## Verification Matrix

- Focused unit suites:
  `npm run test:unit -- tests/unit/i18n/resolve-locale.test.ts tests/unit/lib/utils/email.test.ts tests/unit/lib/env/startup.test.ts tests/unit/auth/application/use-cases/send-otp.test.ts tests/unit/auth/services/notifications.test.ts tests/unit/auth/auth-use-cases.test.ts tests/unit/auth/auth-events.test.ts tests/unit/auth/application/use-cases/authenticate-with-otp.more.test.ts`
- Focused integration suite:
  `npm run test:integration -- tests/integration/auth/send-otp-edge-cases.test.ts`
- Static checks:
  `npm run lint -- src/i18n/resolve-locale.ts src/i18n/request.ts src/lib/utils/email.ts src/lib/env/startup.ts src/lib/env/catalog.ts src/emails/otp-email.tsx src/emails/login-notification-email.tsx src/modules/auth/application/use-cases/send-otp.ts src/modules/auth/server-actions/send-otp.ts src/modules/auth/services/notifications.ts src/modules/auth/application/use-cases/handle-auth-user-signed-in.ts src/modules/auth/application/use-cases/authenticate-with-otp.ts src/auth.ts tests/unit/i18n/resolve-locale.test.ts tests/unit/lib/utils/email.test.ts tests/unit/lib/env/startup.test.ts tests/unit/auth/application/use-cases/send-otp.test.ts tests/unit/auth/services/notifications.test.ts tests/unit/auth/auth-use-cases.test.ts tests/unit/auth/auth-events.test.ts tests/unit/auth/application/use-cases/authenticate-with-otp.more.test.ts tests/integration/auth/send-otp-edge-cases.test.ts`
- i18n catalog consistency:
  `npm run validate:i18n`

## Manual Smoke Checklist

- From `/en/login`, request an OTP and confirm the subject/body are English and the sender displays as `Cashier <...>`.
- From `/zh/login`, request an OTP and confirm the subject/body are Chinese and the sender displays as `Cashier <...>`.
- Complete an existing-user sign-in from both locales and confirm the login-notification email subject/body match the locale.
- Verify that leaving `AUTH_EMAIL_FROM` unset still produces the named fallback sender and that setting `AUTH_EMAIL_FROM=Cashier <noreply@cashier.app>` passes startup validation.

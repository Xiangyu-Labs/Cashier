import { vi } from "vitest";
import React from "react";
import type * as ReactModule from "react";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://cashier:cashier@127.0.0.1:55432/cashier_test";
process.env.AI_MODEL = process.env.AI_MODEL ?? "test-model";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-openai-key";
process.env.API_KEY_PEPPER = process.env.API_KEY_PEPPER ?? "test-pepper-for-testing-only";
process.env.RATE_LIMIT_PEPPER = process.env.RATE_LIMIT_PEPPER ?? "test-rate-limit-pepper";
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-auth-secret";
process.env.AUTH_OTP_PEPPER = process.env.AUTH_OTP_PEPPER ?? "test-auth-otp-pepper";
process.env.AUTH_RESEND_KEY = process.env.AUTH_RESEND_KEY ?? "test-resend-key";
process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";
process.env.S3_ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:9000";
process.env.S3_BUCKET = process.env.S3_BUCKET ?? "cashier-test-images";
process.env.S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID ?? "test-access-key";
process.env.S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY ?? "test-secret-key";

/**
 * Promises of fire-and-forget `after()` callbacks registered during tests.
 * Tests await them via `flushAfterCallbacks()` before destructive setup (for
 * example the per-test TRUNCATE) so request-bound work cannot deadlock with
 * the next test's table locks.
 */
const { pendingAfterCallbacks } = vi.hoisted(() => ({
  pendingAfterCallbacks: [] as Promise<unknown>[],
}));

/**
 * Drain pending `after()` callbacks within a bounded budget, including
 * callbacks registered by earlier callbacks (the recovery pass schedules
 * intent execution). Long-running work such as AI requests holds no database
 * locks and is left running in the background; only the quick database work
 * that could deadlock against a subsequent TRUNCATE needs to settle first.
 */
export async function flushAfterCallbacks(timeoutMs = 2500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pending = pendingAfterCallbacks.splice(0);
    if (pending.length === 0) return;
    const remaining = Math.max(1, deadline - Date.now());
    await Promise.all(
      pending.map((promise) =>
        Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, remaining))])
      )
    );
  }
}

vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === "function") {
      const handler = args[0] as (req: unknown, ctx: unknown) => unknown;
      return async (req: { auth?: unknown }, ctx: unknown) => {
        req.auth = req.auth ?? {
          user: {
            id: "00000000-0000-0000-0000-000000000000",
            email: "test@example.com",
          },
        };
        return handler(req, ctx);
      };
    }
    return Promise.resolve({
      user: {
        id: "00000000-0000-0000-0000-000000000000",
        email: "test@example.com",
      },
    });
  },
}));

vi.mock("next-intl", async () => {
  const actual = await vi.importActual("react");
  const React = actual as typeof ReactModule;
  const defaultMessages = await import("../messages/zh.json").then((m) => m.default ?? m);

  const defaultMessagesRecord = defaultMessages as Record<string, unknown>;
  interface IntlContextValue {
    messages: Record<string, unknown>;
    locale: string;
  }
  const IntlContext = React.createContext<IntlContextValue | null>(null);

  const valueAtPath = (value: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>((current, segment) => {
      if (current == null || typeof current !== "object" || !(segment in current)) return undefined;
      return (current as Record<string, unknown>)[segment];
    }, value);

  return {
    useTranslations: (namespace?: string) => {
      const context = React.useContext(IntlContext);
      const messages = context?.messages ?? defaultMessagesRecord;
      const fullKey = (key: string) => (namespace == null ? key : `${namespace}.${key}`);
      const translate = (key: string, values?: Record<string, unknown>) => {
        const msg = valueAtPath(messages, fullKey(key));
        if (msg == null) return fullKey(key);
        let translated = msg as string;
        if (values != null && typeof translated === "string") {
          Object.keys(values).forEach((k) => {
            translated = translated.replaceAll(`{${k}}`, String(values[k]));
          });
        }
        return translated;
      };
      translate.raw = (key: string) => valueAtPath(messages, fullKey(key));
      return translate;
    },
    useLocale: () => React.useContext(IntlContext)?.locale ?? "zh",
    useMessages: () => React.useContext(IntlContext)?.messages ?? defaultMessagesRecord,
    useTimeZone: () => "UTC",
    useNow: () => new Date(),
    NextIntlClientProvider: ({
      children,
      messages,
      locale,
    }: {
      children: React.ReactNode;
      messages: Record<string, unknown>;
      locale: string;
    }) => React.createElement(IntlContext.Provider, { value: { messages, locale } }, children),
  };
});

vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string; [key: string]: unknown }) => {
    return React.createElement("img", { ...props, src: props.src });
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/i18n/routing", () => ({
  Link: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => React.createElement("a", { href, ...rest }, children),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    // Suppress rejections so that teardown failures don't pollute test output.
    // Wraps fn() in try/catch for sync throws and .catch() for async rejections.
    after: (fn: () => void) => {
      try {
        pendingAfterCallbacks.push(Promise.resolve(fn()).catch(() => {}));
      } catch {}
    },
  };
});

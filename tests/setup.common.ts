import { vi } from "vitest";
import React from "react";
import type * as ReactModule from "react";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://cashier:cashier@127.0.0.1:55432/cashier_test";
process.env.AI_MODEL = process.env.AI_MODEL ?? "test-model";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-openai-key";
process.env.API_KEY_PEPPER = process.env.API_KEY_PEPPER ?? "test-pepper-for-testing-only";
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-auth-secret";
process.env.AUTH_RESEND_KEY = process.env.AUTH_RESEND_KEY ?? "test-resend-key";
process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";
process.env.S3_ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:9000";
process.env.S3_BUCKET = process.env.S3_BUCKET ?? "cashier-test-images";
process.env.S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID ?? "test-access-key";
process.env.S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY ?? "test-secret-key";

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
  const messages = await import("../messages/zh.json").then((m) => m.default ?? m);

  const messagesRecord = messages as Record<string, unknown>;

  return {
    useTranslations: (namespace?: string) => {
      const nsMessages =
        namespace != null ? (messagesRecord[namespace] as Record<string, unknown>) : messagesRecord;
      return (key: string, values?: Record<string, unknown>) => {
        let msg = nsMessages?.[key];
        if (msg == null) {
          for (const ns in messagesRecord) {
            const nsMsg = messagesRecord[ns] as Record<string, unknown>;
            if (nsMsg != null && typeof nsMsg === "object" && nsMsg[key] != null) {
              msg = nsMsg[key];
              break;
            }
          }
        }
        if (msg == null) return key;
        let translated = msg as string;
        if (values != null && typeof translated === "string") {
          Object.keys(values).forEach((k) => {
            translated = translated.replace(`{${k}}`, String(values[k]));
          });
        }
        return translated;
      };
    },
    useLocale: () => "zh",
    useMessages: () => messages,
    useTimeZone: () => "UTC",
    useNow: () => new Date(),
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
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
        void Promise.resolve(fn()).catch(() => {});
      } catch {}
    },
  };
});

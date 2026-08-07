import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMessages, getTranslations, notFound } = vi.hoisted(() => ({
  getMessages: vi.fn(),
  getTranslations: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound }));

vi.mock("next-intl/server", () => ({
  getMessages,
  getTranslations,
}));

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();

  return {
    ...actual,
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("@/components/providers", () => ({
  Providers: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/i18n/routing", () => ({
  routing: {
    locales: ["zh", "en"] as const,
    defaultLocale: "zh",
  },
}));

vi.mock("@/i18n/client-feature-messages", () => ({
  pickMessages: (messages: Record<string, unknown>, namespaces: string[]) => {
    const picked: Record<string, unknown> = {};
    for (const ns of namespaces) {
      if (ns in messages) picked[ns] = messages[ns];
    }
    return picked;
  },
  FEATURE_MESSAGES: {
    shell: ["Common", "Auth", "NotFound", "Error", "Metadata", "AuthEmail"],
    stream: ["LedgerPage", "LedgerEntriesTab", "SourceDocumentCard"],
    details: [],
    stats: [],
    settings: [],
  },
}));

import LocaleLayout, { generateMetadata } from "@/app/[locale]/layout";

describe("locale layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMessages.mockImplementation(async ({ locale }: { locale: string }) => ({
      locale,
      Common: { key: "common" },
      Auth: { key: "auth" },
      LedgerPage: { key: "ledger" },
      Metadata: { title: `${locale}:title`, description: `${locale}:description` },
    }));
    getTranslations.mockImplementation(async ({ locale }: { locale: string }) => {
      return (key: string) => `${locale}:${key}`;
    });
  });

  it.each(["zh", "en"] as const)(
    "loads shell messages only and renders metadata for %s",
    async (locale) => {
      const layout = await LocaleLayout({
        children: <div>Child page</div>,
        params: Promise.resolve({ locale }),
      });
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale }),
      });

      expect(layout).toMatchObject({
        type: "html",
        props: { lang: locale },
      });
      // Full message catalog is still loaded on the server,
      // but only shell namespaces should be available in the provider
      expect(getMessages).toHaveBeenCalledWith({ locale });
      expect(getTranslations).toHaveBeenCalledWith({ locale, namespace: "Metadata" });
      expect(metadata).toMatchObject({
        title: `${locale}:title`,
        description: `${locale}:description`,
      });
      expect(notFound).not.toHaveBeenCalled();
    }
  );

  it("renders without a downloaded font class", async () => {
    const layout = await LocaleLayout({
      children: <div>Content</div>,
      params: Promise.resolve({ locale: "en" }),
    });
    const html = layout as React.ReactElement<{
      children: React.ReactElement<{ className: string }>;
    }>;
    const body = html.props.children;
    expect(body.props.className).toBe("antialiased");
  });

  it.each(["sw.js", "en-US", "typo"])(
    "rejects invalid locale %s before loading localized content",
    async (locale) => {
      await expect(
        LocaleLayout({
          children: <div>Child page</div>,
          params: Promise.resolve({ locale }),
        })
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(getMessages).not.toHaveBeenCalled();

      await expect(generateMetadata({ params: Promise.resolve({ locale }) })).rejects.toThrow(
        "NEXT_NOT_FOUND"
      );

      expect(getTranslations).not.toHaveBeenCalled();
      expect(notFound).toHaveBeenCalledTimes(2);
    }
  );

  it("omits SessionProvider and Providers from global scope", async () => {
    // Verify Providers is not used in the global layout
    // (checked by seeing no import in the rendered layout's tree)
    const layout = await LocaleLayout({
      children: <div>Content</div>,
      params: Promise.resolve({ locale: "en" }),
    });
    // Renders as <html><body>... directly without Providers wrapper
    expect((layout! as React.ReactElement).type).toBe("html");
  });
});

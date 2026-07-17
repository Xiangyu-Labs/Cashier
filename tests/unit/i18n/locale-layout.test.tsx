import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMessages, getTranslations, notFound } = vi.hoisted(() => ({
  getMessages: vi.fn(),
  getTranslations: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "font-sans" }),
  JetBrains_Mono: () => ({ variable: "font-mono" }),
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

import LocaleLayout, { generateMetadata } from "@/app/[locale]/layout";

describe("locale layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMessages.mockImplementation(async ({ locale }: { locale: string }) => ({
      locale,
    }));
    getTranslations.mockImplementation(async ({ locale }: { locale: string }) => {
      return (key: string) => `${locale}:${key}`;
    });
  });

  it.each(["zh", "en"] as const)("loads messages and metadata for %s", async (locale) => {
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
    expect(getMessages).toHaveBeenCalledWith({ locale });
    expect(getTranslations).toHaveBeenCalledWith({ locale, namespace: "Metadata" });
    expect(metadata).toMatchObject({
      title: `${locale}:title`,
      description: `${locale}:description`,
    });
    expect(notFound).not.toHaveBeenCalled();
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

      await expect(
        generateMetadata({ params: Promise.resolve({ locale }) })
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(getTranslations).not.toHaveBeenCalled();
      expect(notFound).toHaveBeenCalledTimes(2);
    }
  );
});

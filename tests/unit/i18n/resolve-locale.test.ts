import { describe, expect, it } from "vitest";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";

describe("resolveSupportedLocale", () => {
  it("returns explicit locale when provided and supported", () => {
    expect(resolveSupportedLocale({ explicitLocale: "en" })).toBe("en");
    expect(resolveSupportedLocale({ explicitLocale: "zh" })).toBe("zh");
  });

  it("falls back to cookie locale when no explicit locale", () => {
    expect(resolveSupportedLocale({ cookieLocale: "en" })).toBe("en");
    expect(resolveSupportedLocale({ cookieLocale: "zh" })).toBe("zh");
  });

  it("falls back to Accept-Language header when no cookie", () => {
    expect(resolveSupportedLocale({ acceptLanguage: "en-US,en;q=0.9" })).toBe("en");
    expect(resolveSupportedLocale({ acceptLanguage: "zh-CN,zh;q=0.9" })).toBe("zh");
  });

  it("prefers explicit locale over cookie and header", () => {
    expect(
      resolveSupportedLocale({ explicitLocale: "en", cookieLocale: "zh", acceptLanguage: "zh-CN" })
    ).toBe("en");
  });

  it("prefers cookie over Accept-Language header", () => {
    expect(resolveSupportedLocale({ cookieLocale: "zh", acceptLanguage: "en-US,en;q=0.9" })).toBe(
      "zh"
    );
  });

  it("normalizes locale variants from cookies and headers", () => {
    expect(resolveSupportedLocale({ cookieLocale: "zh-CN" })).toBe("zh");
    expect(resolveSupportedLocale({ acceptLanguage: "en-US,en;q=0.9" })).toBe("en");
  });

  it("falls back to zh for unsupported values", () => {
    expect(resolveSupportedLocale({ explicitLocale: "fr", acceptLanguage: "fr-FR" })).toBe("zh");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/i18n/[locale]/[feature]/route";

function request(locale: string, feature: string) {
  return GET(new Request("http://localhost/api/i18n"), {
    params: Promise.resolve({ locale, feature }),
  });
}

describe("feature messages route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves versioned messages as an immutable public asset", async () => {
    const response = await request("en", "stats");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("X-Message-Version")).toBeTruthy();
  });

  it("refuses to let a development browser pin a regenerated catalog", async () => {
    // Regression: the catalogs are rewritten in place while the dev server runs,
    // so an immutable response left components rendering raw key paths until the
    // browser cache was cleared.
    vi.stubEnv("NODE_ENV", "development");

    const response = await request("en", "stats");

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each([
    ["fr", "stats"],
    ["en", "constructor"],
    ["en", "__proto__"],
    ["en", "toString"],
    ["en", "missing"],
  ])("returns 404 for invalid locale or feature %s/%s", async (locale, feature) => {
    expect((await request(locale, feature)).status).toBe(404);
  });
});

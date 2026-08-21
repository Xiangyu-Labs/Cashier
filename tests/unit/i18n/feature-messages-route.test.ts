import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/i18n/[locale]/[feature]/route";

function request(locale: string, feature: string) {
  return GET(new Request("http://localhost/api/i18n"), {
    params: Promise.resolve({ locale, feature }),
  });
}

describe("feature messages route", () => {
  it("serves versioned messages as an immutable public asset", async () => {
    const response = await request("en", "stats");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("X-Message-Version")).toBeTruthy();
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

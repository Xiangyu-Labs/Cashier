import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("global security headers", () => {
  it("configures baseline browser security policies for every route", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain('key: "X-Content-Type-Options", value: "nosniff"');
    expect(config).toContain('key: "Referrer-Policy", value: "same-origin"');
    expect(config).toContain('value: "camera=(), microphone=(), geolocation=()"');
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getClientIPFromHeaders } from "@/lib/utils/ip";

const originalTrustedProxy = process.env.TRUSTED_PROXY;
const originalVercel = process.env.VERCEL;

afterEach(() => {
  if (originalTrustedProxy === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = originalTrustedProxy;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});

describe("ip module boundaries", () => {
  it("keeps header parsing utilities free of next/headers", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/utils/ip.ts"), "utf8");

    expect(source).not.toContain('from "next/headers"');
    expect(source).not.toContain("export async function getClientIP");
  });
});

describe("trusted proxy handling", () => {
  it("ignores forwarded addresses unless trusted proxy mode is enabled", () => {
    delete process.env.TRUSTED_PROXY;
    const headers = new Headers({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.20",
    });

    expect(getClientIPFromHeaders(headers)).toBe("unknown");
  });

  it("accepts a single validated Docker proxy address", () => {
    process.env.TRUSTED_PROXY = "platform";
    delete process.env.VERCEL;
    const headers = new Headers({ "x-real-ip": "198.51.100.20" });

    expect(getClientIPFromHeaders(headers)).toBe("198.51.100.20");
  });

  it("accepts a single validated Vercel address", () => {
    process.env.TRUSTED_PROXY = "platform";
    process.env.VERCEL = "1";
    const headers = new Headers({ "x-vercel-forwarded-for": "2001:db8::1" });

    expect(getClientIPFromHeaders(headers)).toBe("2001:db8::1");
  });

  it("rejects multi-value, empty, and invalid platform addresses", () => {
    process.env.TRUSTED_PROXY = "platform";
    delete process.env.VERCEL;

    expect(getClientIPFromHeaders(new Headers({ "x-real-ip": "198.51.100.20, 10.0.0.1" }))).toBe(
      "unknown"
    );
    expect(getClientIPFromHeaders(new Headers({ "x-real-ip": "not-an-ip" }))).toBe("unknown");
    expect(getClientIPFromHeaders(new Headers())).toBe("unknown");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getClientIPFromHeaders } from "@/lib/utils/ip";

const originalTrustedProxy = process.env.TRUSTED_PROXY;

afterEach(() => {
  if (originalTrustedProxy === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = originalTrustedProxy;
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

  it("accepts validated proxy addresses in trusted proxy mode", () => {
    process.env.TRUSTED_PROXY = "platform";
    const headers = new Headers({ "x-forwarded-for": "198.51.100.20, 10.0.0.1" });

    expect(getClientIPFromHeaders(headers)).toBe("198.51.100.20");
  });
});

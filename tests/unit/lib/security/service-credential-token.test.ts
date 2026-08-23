import { describe, it, expect, beforeAll } from "vitest";
import {
  createToken,
  prefixSuffix,
  computeHash,
  DOMAIN_PREFIX,
  DISPLAY_PREFIX_LENGTH,
  DISPLAY_SUFFIX_LENGTH,
} from "@/lib/security/service-credential-token";
import crypto from "crypto";

const TEST_PEPPER = "test-pepper-for-testing-only";

beforeAll(() => {
  // Ensure pepper is set (setup.common.ts normally does this)
  process.env.API_KEY_PEPPER = TEST_PEPPER;
});

describe("computeHash", () => {
  it("produces a deterministic hex HMAC-SHA-256", () => {
    const token = "sk_live_abcdef1234567890abcdef1234567890abcdef12";
    const hash1 = computeHash(token);
    const hash2 = computeHash(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("domain-separates with the credential:v1: prefix", () => {
    const token = "sk_live_test_domain_separation";
    const hash = computeHash(token);

    // Verify the hash uses the domain prefix by checking HMAC output
    const expectedHmac = crypto.createHmac("sha256", TEST_PEPPER);
    expectedHmac.update(DOMAIN_PREFIX);
    expectedHmac.update(token);
    expect(hash).toBe(expectedHmac.digest("hex"));
  });

  it("produces different hashes for different peppers", () => {
    const token = "sk_live_pepper_test";

    const hashWithOriginal = computeHash(token);

    // Temporarily change pepper
    const originalPepper = process.env.API_KEY_PEPPER;
    process.env.API_KEY_PEPPER = "different-pepper";
    const hashWithDifferent = computeHash(token);
    process.env.API_KEY_PEPPER = originalPepper;

    expect(hashWithOriginal).not.toBe(hashWithDifferent);
  });

  it("produces different hashes for different tokens with same pepper", () => {
    const hash1 = computeHash("sk_live_token_a");
    const hash2 = computeHash("sk_live_token_b");
    expect(hash1).not.toBe(hash2);
  });
});

describe("createToken", () => {
  it("generates a well-formed token with hash, prefix, and suffix", () => {
    const result = createToken();

    // Token shape: sk_live_<48 hex chars>
    expect(result.token).toMatch(/^sk_live_[0-9a-f]{48}$/);
    expect(result.token.length).toBe(8 + 48); // "sk_live_" + 48 hex chars

    // Hash is 64 hex chars (SHA-256)
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);

    // Prefix is first 8 chars of token
    expect(result.prefix).toBe(result.token.slice(0, DISPLAY_PREFIX_LENGTH));

    // Suffix is last 4 chars of token
    expect(result.suffix).toBe(result.token.slice(-DISPLAY_SUFFIX_LENGTH));
  });

  it("computes the correct hash for the generated token", () => {
    const result = createToken();
    const expectedHash = computeHash(result.token);
    expect(result.hash).toBe(expectedHash);
  });

  it("generates unique tokens on each call", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(createToken().token);
    }
    expect(tokens.size).toBe(100);
  });
});

describe("prefixSuffix", () => {
  it("returns the correct prefix and suffix for masked display", () => {
    const token = "sk_live_abcdef1234567890abcdef1234567890abcdef12";
    const result = prefixSuffix(token);

    expect(result.prefix).toBe("sk_live_");
    expect(result.suffix).toBe("ef12");
  });

  it("does not reveal the full token", () => {
    const token = "sk_live_secret_token_123456789012345678901234567890";
    const result = prefixSuffix(token);

    // Prefix + suffix should be much shorter than the full token
    expect((result.prefix + result.suffix).length).toBeLessThan(token.length);

    // Neither prefix nor suffix should contain the middle portion
    const middle = token.slice(DISPLAY_PREFIX_LENGTH, -DISPLAY_SUFFIX_LENGTH);
    expect(result.prefix).not.toContain(middle);
    expect(result.suffix).not.toContain(middle);
  });
});

describe("missing pepper fails startup validation", () => {
  it("throws when computeHash is called without API_KEY_PEPPER set", () => {
    const originalPepper = process.env.API_KEY_PEPPER;
    delete process.env.API_KEY_PEPPER;

    // computeHash calls getStartupEnvValue which validates API_KEY_PEPPER is set
    expect(() => computeHash("sk_live_test")).toThrow(/API_KEY_PEPPER/);

    process.env.API_KEY_PEPPER = originalPepper;
  });
});

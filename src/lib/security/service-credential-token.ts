/**
 * Service Credential Token Utilities
 *
 * Generates, hashes, and authenticates service credential tokens using
 * domain-separated HMAC-SHA-256 with a configurable pepper.
 *
 * Hash format: lowercase hex
 *   HMAC-SHA-256(API_KEY_PEPPER, "credential:v1:" + token)
 */

import crypto from "crypto";
import { getStartupEnvValue } from "@/lib/env/startup";

export const DOMAIN_PREFIX = "credential:v1:";
export const TOKEN_PREFIX = "sk_live_";
export const TOKEN_HEX_LENGTH = 48; // 24 random bytes => 48 hex chars
export const DISPLAY_PREFIX_LENGTH = 8;
export const DISPLAY_SUFFIX_LENGTH = 4;

function getPepper(): string {
  return getStartupEnvValue("API_KEY_PEPPER");
}

/**
 * Generate a random 48-hex-char token (with `sk_live_` prefix), compute its
 * HMAC-SHA-256 hash, and return everything needed for storage and display.
 */
export function createToken(): {
  token: string;
  hash: string;
  prefix: string;
  suffix: string;
} {
  const randomHex = crypto.randomBytes(TOKEN_HEX_LENGTH / 2).toString("hex");
  const token = `${TOKEN_PREFIX}${randomHex}`;
  const hash = computeHash(token);
  const { prefix, suffix } = prefixSuffix(token);
  return { token, hash, prefix, suffix };
}

/**
 * Verify a raw token against a previously stored hash using constant-time comparison.
 */
export function authenticateToken(token: string, storedHash: string): boolean {
  const computed = computeHash(token);
  if (computed.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
}

/**
 * Derive display prefix (first N chars) and suffix (last N chars) from a full token.
 */
export function prefixSuffix(token: string): { prefix: string; suffix: string } {
  return {
    prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
    suffix: token.slice(-DISPLAY_SUFFIX_LENGTH),
  };
}

/**
 * Compute the HMAC-SHA-256 hash of a token using the configured pepper.
 *
 * @internal Exported for testing purposes only.
 */
export function computeHash(token: string): string {
  const hmac = crypto.createHmac("sha256", getPepper());
  hmac.update(DOMAIN_PREFIX);
  hmac.update(token);
  return hmac.digest("hex");
}

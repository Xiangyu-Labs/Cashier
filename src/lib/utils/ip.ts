import { isIP } from "node:net";
import { runtimeEnv } from "@/lib/env/runtime";

export type HeadersLike = Pick<Headers, "get">;

/**
 * Get client IP address from request headers with secure fallback chain.
 *
 * Platform headers are trusted only when the matching deployment mode is
 * explicit. Each accepted header must contain exactly one valid address.
 */
export function getClientIPFromHeaders(headersList: HeadersLike): string {
  if (runtimeEnv.trustedProxy !== "platform") return "unknown";
  const header = process.env.VERCEL === "1" ? "x-vercel-forwarded-for" : "x-real-ip";
  const value = headersList.get(header)?.trim() ?? "";
  if (value !== "" && !value.includes(",") && isIP(value) !== 0) return value;
  return "unknown";
}

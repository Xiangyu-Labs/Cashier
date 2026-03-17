import { headers } from "next/headers";

/**
 * Get client IP address from request headers with secure fallback chain.
 *
 * Priority order:
 * 1. X-Real-IP (if TRUSTED_PROXY is configured) - most reliable with trusted proxies
 * 2. X-Forwarded-For first entry (with validation) - common with reverse proxies
 * 3. "unknown" - fallback when no proxy headers available
 *
 * Security: Only trusts X-Real-IP when TRUSTED_PROXY environment variable is set.
 * This prevents IP spoofing when the app is directly exposed to the internet.
 */
export async function getClientIP(): Promise<string> {
  const headersList = await headers();

  // If configured with trusted proxies, prefer X-Real-IP (set by nginx, etc.)
  if (process.env.TRUSTED_PROXY != null && process.env.TRUSTED_PROXY !== "") {
    const realIP = headersList.get("x-real-ip");
    if (realIP != null && realIP !== "") {
      const trimmed = realIP.trim();
      if (isValidIP(trimmed)) {
        return trimmed;
      }
    }
  }

  // Fallback to X-Forwarded-For (take the first hop)
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded != null && forwarded !== "") {
    const firstHop = forwarded.split(",")[0].trim();
    if (isValidIP(firstHop)) {
      return firstHop;
    }
  }

  return "unknown";
}

/**
 * Basic IP address validation to prevent header injection attacks.
 * Validates IPv4 and IPv6 addresses.
 */
function isValidIP(ip: string): boolean {
  if (ip === "" || ip.length > 45) return false;

  // IPv4 regex pattern
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 regex pattern (simplified, allows common formats)
  const ipv6Regex =
    /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,7}:$|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}$|^([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}$|^([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}$|^([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})$|^:((:[0-9a-fA-F]{1,4}){1,7}|:)$/;

  if (ipv4Regex.test(ip)) {
    // Validate IPv4 octets are in valid range
    const octets = ip.split(".").map(Number);
    return octets.every((octet) => octet >= 0 && octet <= 255);
  }

  return ipv6Regex.test(ip);
}

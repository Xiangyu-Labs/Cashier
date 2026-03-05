import { headers } from "next/headers";

/**
 * Get client IP address from request headers.
 * Uses X-Forwarded-For header, falling back to "unknown".
 *
 * Note: In production with trusted proxies, consider using X-Real-IP
 * or validating the X-Forwarded-For chain.
 */
export async function getClientIP(): Promise<string> {
    const headersList = await headers();
    const forwarded = headersList.get("x-forwarded-for");
    return forwarded ? forwarded.split(",")[0].trim() : "unknown";
}

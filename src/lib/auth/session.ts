/**
 * Session Management for Device Tracking
 *
 * This module manages database session records for device management and audit purposes.
 *
 * ARCHITECTURE NOTE:
 * - NextAuth uses JWT strategy for authentication (stateless, performant)
 * - We maintain a separate sessions table for:
 *   1. Device management (show user's active devices)
 *   2. Security audit (track login history, IP addresses)
 *   3. Remote logout capability (revoke specific devices)
 *
 * The sessions table is NOT used by NextAuth itself in JWT mode.
 * Sessions are manually created in auth.ts events.signIn and updated via touchSession().
 */

import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { UAParser } from "ua-parser-js";

export type SessionInfo = {
    current: boolean;
    id: string; // This is sessionToken in our schema
    ua: string;
    ip: string;
    device: string;
    lastActive: Date | null;
    createdAt: Date;
};

/**
 * Get all active sessions for the current user
 * Used in the device management UI to show all logged-in devices
 */
export async function getActiveSessions(userId: string, currentSessionToken: string): Promise<SessionInfo[]> {
    const allSessions = await db.query.sessions.findMany({
        where: eq(sessions.userId, userId),
        orderBy: [desc(sessions.lastActiveAt)],
    });

    return allSessions.map((s) => ({
        current: s.sessionToken === currentSessionToken,
        id: s.sessionToken,
        ua: s.userAgent || "Unknown",
        ip: s.ipAddress || "Unknown",
        device: s.deviceName || "Unknown Device",
        lastActive: s.lastActiveAt,
        createdAt: s.createdAt,
    }));
}

/**
 * Revoke a specific session (remote logout)
 * This removes the session record from the database.
 * Note: In JWT mode, the JWT itself is still valid until expiry.
 * This function is primarily for UI purposes (hiding the device from the list).
 */
export async function revokeSession(sessionToken: string, userId: string): Promise<void> {
    await db.delete(sessions).where(
        and(
            eq(sessions.sessionToken, sessionToken),
            eq(sessions.userId, userId)
        )
    );
}

/**
 * Update the current session with device info and refresh activity timestamp
 * This is called when the user accesses the app to track device information and last activity.
 * Should be called from a Server Action or API route.
 */
export async function touchSession(sessionToken: string): Promise<void> {
    const headersList = await headers();
    const userAgent = headersList.get("user-agent") || "Unknown";
    const ip = headersList.get("x-forwarded-for") || "Unknown"; // Naive IP check

    // Parse UA
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();

    let deviceName = `${browser.name || "Browser"} on ${os.name || "OS"}`;
    if (device.model) {
        deviceName = `${device.vendor || ""} ${device.model} (${os.name || "OS"})`;
    }

    await db.update(sessions)
        .set({
            userAgent,
            ipAddress: ip.split(",")[0], // Take first IP
            deviceName,
            lastActiveAt: new Date(),
        })
        .where(eq(sessions.sessionToken, sessionToken));
}

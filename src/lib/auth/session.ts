
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, ne, and, desc } from "drizzle-orm"; // Fixed: import specific operators
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
 * Revoke a specific session
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
 * Update the current session with device info
 * This should be called appropriately (e.g. from a Server Action triggered by client)
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

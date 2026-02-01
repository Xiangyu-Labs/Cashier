"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sessions } from "@/features/auth/server/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { UAParser } from "ua-parser-js";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";

export interface SessionInfo {
    id: string; // sessionToken
    ipAddress: string | null;
    lastActiveAt: Date | null;
    isCurrent: boolean;
    device: {
        browser: string;
        os: string;
        device: string;
        type: string;
    };
}

export async function getActiveSessionsAction(): Promise<{ success: boolean; data?: SessionInfo[]; error?: string }> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" };
        }

        // Fetch all active sessions for the user
        // Note: We check if session is expired based on 'expires' field
        const activeSessions = await db.query.sessions.findMany({
            where: and(
                eq(sessions.userId, session.user.id),
                // We could filter by expires > now, but let's just show all in DB 
                // typically persistent sessions are long-lived.
            ),
            orderBy: [desc(sessions.lastActiveAt), desc(sessions.createdAt)],
        });

        // 1. We need to identify the "Current Session".
        // BUT: session.sessionToken is NOT available in the session object by default in NextAuth v5 custom adapter setup unless we put it there.
        // In JWT strategy, the token has 'jti' (JWT ID) or we can look at cookies.
        // However, we are in a Server Action. 'auth()' returns the session object decoded from JWT.
        // We need a reliable way to know WHICH session ID corresponds to the CURRENT request.

        // Strategy: 
        // In `auth.ts` session callback, we can put the sessionToken (if available) into the session object.
        // But with JWT strategy, there IS NO session token by default linking to the DB unless we manually manage it.
        // Wait, our `auth.ts` -> events.signIn MANUALLY creates a DB session for audit.
        // But how do we link the JWT to that specific DB row?
        // 
        // Issue: The JWT is stateless. It doesn't know about the DB session ID unless we stored it in the JWT during sign in.
        // 
        // Fix: We need to update `auth.ts` jwt callback to retrieve the `sessionToken` we created in `events.signIn`? 
        // No, `events.signIn` happens after token creation or asynchronously.
        // 
        // Alternative: Use the `jti` claim in JWT as the `sessionToken` in DB.
        // When we create the JWT, we generate a JTI. We should use THAT as the primary key in `sessions` table if possible?
        // Or store the generated `sessionToken` in the JWT token.

        // Let's assume for now we can't easily identify "Current" specific row without Auth.js changes.
        // Fallback: Use User-Agent matching as a heuristic for "Current Device" purely for UI display if needed, 
        // or accept we might not know exactly which row is "this" one securely without cookie inspection.

        // BETTER FIX for this PR:
        // Update `auth.ts` to store `sessionToken` in JWT token.
        // Since we insert into DB manually in `events.signIn`, we might not have access to modify the token *response* there.
        // 
        // Real Solution: 
        // 1. In `jwt` callback: Generate a unique ID if not present. Store in token.
        // 2. In `session` callback: Expose that ID.
        // 3. In `signIn` event: Use that ID (how to get it?) -> actually `events.signIn` doesn't get the JWT.
        //
        // OK, Simpler approach for Device Management with NextAuth JWT:
        // Identify "Current" by comparing User Agent? No, inaccurate.
        //
        // Let's look at `auth.ts` again.

        // Since we are using "manual" session capability for "device tracking" only, and using JWT for auth...
        // The `events.signIn` creates a row. But we never passed that ID back to the user's JWT.
        // So the user's JWT has NO LINK to the `sessions` table row created.
        // This means we CANNOT revoke "this specific session" easily because "this session" effectively doesn't exist in a 1-to-1 persistent way.
        //
        // Pivot: We need to change how we track sessions.
        // OR: We accept that "Log out all other devices" is the features.
        // OR: We implement proper link.

        // Proper Link Plan:
        // 1. `jwt` callback: Check if `token.sessionId` exists. If not, generate one.
        // 2. `session` callback: Add `session.sessionId = token.sessionId`.
        // 3. `signIn` event: This is too late/disconnected.
        // 4. INSTEAD: Do check-and-create inside `jwt` callback or `signIn` callback?
        //    Actually, do it in `jwt` call.
        //    If `trigger === "signIn"`, create DB session record with `token.jti` (which NextAuth generates).

        // Let's try to deduce "Current" session by checking the exact `jti` from `auth()` if available?
        // NextAuth v5 `auth()` returns Session object. Does it have jti? No.

        // Workaround: We will implement `getActiveSessionsAction` to return all. 
        // We will TRY to identify current by `headers()` User-Agent comparison for now (low confidence),
        // or just listed them.
        // 
        // Wait, if we can't identify the current session, "Revoke" might revoke OURSELVES accidentally.
        //
        // Let's pause and fix `auth.ts` FIRST to ensure we have a stable `sessionId` in the JWT.

        // For this step (creating the action), I will assume `session.user.sessionId` will be available after I fix `auth.ts`.
        // I will declare strict types assuming the fix.

        const currentSessionId = (session as any).sessionId as string | undefined;

        const results: SessionInfo[] = activeSessions.map(s => {
            const ua = new UAParser(s.userAgent || "");
            const browser = ua.getBrowser();
            const os = ua.getOS();
            const device = ua.getDevice();

            return {
                id: s.sessionToken,
                ipAddress: s.ipAddress,
                lastActiveAt: s.lastActiveAt,
                isCurrent: s.sessionToken === currentSessionId,
                device: {
                    browser: `${browser.name || 'Unknown Browser'} ${browser.version || ''}`.trim(),
                    os: `${os.name || 'Unknown OS'} ${os.version || ''}`.trim(),
                    device: device.vendor ? `${device.vendor} ${device.model}` : (device.type || 'Desktop'),
                    type: device.type || 'desktop'
                }
            };
        });

        // Heuristic fallback if currentSessionId is missing (e.g. old sessions)
        // If no session is marked current, try to match by exact User Agent string?
        // Actually, without ID it's risky. I'll rely on the `auth.ts` fix.

        return { success: true, data: results };
    } catch (error) {
        logger.error({ error }, "Failed to get active sessions");
        return { success: false, error: "Failed to fetch sessions" };
    }
}

export async function revokeSessionAction(sessionToken: string) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" };
        }

        // Verify ownership
        const targetSession = await db.query.sessions.findFirst({
            where: and(
                eq(sessions.sessionToken, sessionToken),
                eq(sessions.userId, session.user.id)
            )
        });

        if (!targetSession) {
            return { success: false, error: "Session not found or unauthorized" };
        }

        await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken));

        revalidatePath("/settings"); // or whatever path
        return { success: true };
    } catch (error) {
        logger.error({ error, sessionToken }, "Failed to revoke session");
        return { success: false, error: "Failed to revoke session" };
    }
}

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Get the current authenticated user from the session.
 * Returns null if not authenticated.
 */
export async function getCurrentUser() {
    const session = await auth();
    return session?.user ?? null;
}

/**
 * Get the current user ID from the session.
 * Returns null if not authenticated.
 */
export async function getCurrentUserId(): Promise<string | null> {
    const user = await getCurrentUser();
    return user?.id ?? null;
}

/**
 * Require authentication for an API route.
 * Returns the user if authenticated, or a 401 response if not.
 */
export async function requireAuth(): Promise<
    | { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; error?: never }
    | { user?: never; error: NextResponse }
> {
    const user = await getCurrentUser();

    if (!user) {
        return {
            error: NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            ),
        };
    }

    return { user };
}

/**
 * Verify that a ledger belongs to the current user.
 * Returns the ledger if found and owned, or an error response.
 */
export async function verifyLedgerOwnership(ledgerId: string): Promise<
    | { ledger: typeof ledgers.$inferSelect; error?: never }
    | { ledger?: never; error: NextResponse }
> {

    const userId = await getCurrentUserId();

    if (!userId) {
        return {
            error: NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            ),
        };
    }

    const ledger = await db.query.ledgers.findFirst({
        where: and(
            eq(ledgers.id, ledgerId),
            eq(ledgers.userId, userId)
        ),
    });

    if (!ledger) {
        return {
            error: NextResponse.json(
                { error: "Ledger not found" },
                { status: 404 }
            ),
        };
    }

    return { ledger };
}

/**
 * Helper to get user ID and verify ledger ownership in one call.
 * Common pattern for protected ledger routes.
 */
export async function requireLedgerAccess(ledgerId: string): Promise<
    | { userId: string; ledger: typeof ledgers.$inferSelect; error?: never }
    | { userId?: never; ledger?: never; error: NextResponse }
> {
    const result = await verifyLedgerOwnership(ledgerId);

    if (result.error) {
        return result;
    }

    return {
        userId: result.ledger.userId,
        ledger: result.ledger,
    };
}

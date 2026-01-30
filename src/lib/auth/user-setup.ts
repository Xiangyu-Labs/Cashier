import { db } from "@/lib/db";
import { ledgers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Create a default ledger for a new user
 */
export async function createDefaultLedgerForUser(
    userId: string,
    userEmail: string
): Promise<string> {
    // Create the default ledger
    const [newLedger] = await db
        .insert(ledgers)
        .values({
            userId,
            name: `${userEmail.split("@")[0]}'s Ledger`,
            aiLanguage: "zh", // Default to Chinese, user can change later
        })
        .returning();

    // Update user's default ledger
    await db
        .update(users)
        .set({ defaultLedgerId: newLedger.id })
        .where(eq(users.id, userId));

    return newLedger.id;
}

/**
 * Get a user's default ledger ID, or the first ledger if no default is set
 */
export async function getUserDefaultLedgerId(
    userId: string
): Promise<string | null> {
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    });

    if (user?.defaultLedgerId) {
        return user.defaultLedgerId;
    }

    // Fallback: get the first ledger for this user
    const firstLedger = await db.query.ledgers.findFirst({
        where: eq(ledgers.userId, userId),
        orderBy: (ledgers, { asc }) => [asc(ledgers.createdAt)],
    });

    return firstLedger?.id ?? null;
}

/**
 * Set a user's default ledger
 */
export async function setUserDefaultLedger(
    userId: string,
    ledgerId: string
): Promise<void> {
    // Verify the ledger belongs to this user
    const ledger = await db.query.ledgers.findFirst({
        where: (l, { and, eq }) => and(eq(l.id, ledgerId), eq(l.userId, userId)),
    });

    if (!ledger) {
        throw new Error("Ledger not found or does not belong to user");
    }

    await db
        .update(users)
        .set({ defaultLedgerId: ledgerId })
        .where(eq(users.id, userId));
}

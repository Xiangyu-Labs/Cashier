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
    const { defaultLedger } = await import("@/config/default-ledger");
    const { entryCategories } = await import("@/lib/db/schema");

    let newLedgerId: string;

    // Atomically create ledger, categories, and set user default in a transaction
    db.transaction((tx) => {
        // 1. Create the default ledger
        const [newLedger] = tx
            .insert(ledgers)
            .values({
                userId,
                name: `${userEmail.split("@")[0]}'s Ledger`,
                metadata: {
                    settings: {
                        ...defaultLedger.settings,
                    }
                }
            })
            .returning()
            .all();

        newLedgerId = newLedger.id;

        // 2. Insert default categories
        if (defaultLedger.categories.length > 0) {
            tx.insert(entryCategories).values(
                defaultLedger.categories.map((cat) => ({
                    ...cat,
                    ledgerId: newLedger.id,
                }))
            ).run();
        }

        // 3. Update user's default ledger
        tx.update(users)
            .set({ defaultLedgerId: newLedger.id })
            .where(eq(users.id, userId))
            .run();
    });

    return newLedgerId!;
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

    return null;
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

import { db } from "@/lib/db";
import { ledgers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Create a default ledger for a new user
 */
export async function createDefaultLedgerForUser(
  userId: string,
  _userEmail: string,
  locale: string = "zh"
): Promise<string> {
  const { getDefaultLedger } = await import("@/config/default-ledger");
  const defaultLedger = getDefaultLedger(locale);
  const { entryCategories } = await import("@/lib/db/schema");

  let newLedgerId: string;

  // Atomically create ledger, categories, and set user default in a transaction
  db.transaction((tx) => {
    // 1. Create the default ledger
    const [newLedger] = tx
      .insert(ledgers)
      .values({
        userId,
        metadata: {
          settings: {
            ...defaultLedger.settings,
          },
        },
      })
      .returning()
      .all();

    newLedgerId = newLedger.id;

    // 2. Insert default categories
    if (defaultLedger.categories.length > 0) {
      tx.insert(entryCategories)
        .values(
          defaultLedger.categories.map((cat) => ({
            ...cat,
            ledgerId: newLedger.id,
          }))
        )
        .run();
    }

    // 3. Update user's default ledger
    tx.update(users).set({ defaultLedgerId: newLedger.id }).where(eq(users.id, userId)).run();
  });

  return newLedgerId!;
}

/**
 * Clear defaultLedgerId when the ledger is deleted
 */
export async function clearUserDefaultLedger(ledgerId: string): Promise<void> {
  await db.update(users).set({ defaultLedgerId: null }).where(eq(users.defaultLedgerId, ledgerId));
}

import { db } from "@/lib/db";
import { users } from "@/persistence";
import { eq } from "drizzle-orm";
import { createDefaultLedger } from "@/modules/ledger/application/use-cases/create-default-ledger";

/**
 * Create a default ledger for a new user
 */
export async function createDefaultLedgerForUser(
  userId: string,
  _userEmail: string,
  locale: string = "zh"
): Promise<string> {
  const newLedger = await createDefaultLedger({ userId, locale });
  await db.update(users).set({ defaultLedgerId: newLedger.id }).where(eq(users.id, userId));
  return newLedger.id;
}

/**
 * Clear defaultLedgerId when the ledger is deleted
 */
export async function clearUserDefaultLedger(ledgerId: string): Promise<void> {
  await db.update(users).set({ defaultLedgerId: null }).where(eq(users.defaultLedgerId, ledgerId));
}

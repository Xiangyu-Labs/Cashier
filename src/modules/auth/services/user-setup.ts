import { db } from "@/lib/db";
import { users } from "@/persistence";
import { eq } from "drizzle-orm";
import { createDefaultLedger } from "@/modules/ledger";

export async function createDefaultLedgerForUser(
  userId: string,
  _userEmail: string,
  locale: string = "zh"
): Promise<string> {
  const newLedger = await createDefaultLedger({ userId, locale });
  await db.update(users).set({ defaultLedgerId: newLedger.id }).where(eq(users.id, userId));
  return newLedger.id;
}

export async function clearUserDefaultLedger(ledgerId: string): Promise<void> {
  await db.update(users).set({ defaultLedgerId: null }).where(eq(users.defaultLedgerId, ledgerId));
}

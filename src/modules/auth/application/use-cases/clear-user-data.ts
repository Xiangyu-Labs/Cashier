import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, ledgers, ledgerEntries, sourceDocuments, entryCategories, serviceCredentials } from "@/persistence";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function clearUserData(params: { userId: string }): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, params.userId) });
  if (user == null) throw new NotFoundError("User not found");

  const now = new Date();
  const userLedgers = await db.query.ledgers.findMany({
    where: and(eq(ledgers.userId, params.userId), isNull(ledgers.deletedAt)),
  });

  for (const ledger of userLedgers) {
    await db.update(sourceDocuments).set({ deletedAt: now }).where(eq(sourceDocuments.ledgerId, ledger.id));
    await db.update(ledgerEntries).set({ deletedAt: now }).where(eq(ledgerEntries.ledgerId, ledger.id));
    await db.update(entryCategories).set({ deletedAt: now }).where(eq(entryCategories.ledgerId, ledger.id));
    await db.update(serviceCredentials).set({ deletedAt: now }).where(eq(serviceCredentials.ledgerId, ledger.id));
    await db.update(ledgers).set({ deletedAt: now }).where(eq(ledgers.id, ledger.id));
  }

  logger.info({ userId: params.userId, ledgerCount: userLedgers.length }, "User data cleared");
}

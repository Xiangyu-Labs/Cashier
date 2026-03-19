import { db } from "@/lib/db";
import { ledgerEntries } from "@/persistence";
import { and, eq, inArray, isNull } from "drizzle-orm";

export async function listUncategorizedEntriesForCategorization(ledgerId: string) {
  return db.query.ledgerEntries.findMany({
    where: and(
      eq(ledgerEntries.ledgerId, ledgerId),
      isNull(ledgerEntries.categoryId),
      isNull(ledgerEntries.deletedAt)
    ),
    with: {
      sourceDocument: true,
    },
  });
}

export async function listSelectedEntriesForCategorization(ledgerId: string, entryIds: string[]) {
  return db.query.ledgerEntries.findMany({
    where: and(
      eq(ledgerEntries.ledgerId, ledgerId),
      inArray(ledgerEntries.id, entryIds),
      isNull(ledgerEntries.deletedAt)
    ),
    with: {
      sourceDocument: true,
    },
  });
}

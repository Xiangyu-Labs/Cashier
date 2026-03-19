"use server";

import { db } from "@/lib/db";
import { ledgers } from "@/persistence";
import { withAuth } from "@/lib/auth-actions";
import { eq, and, isNull, desc } from "drizzle-orm";
import type { LedgerDto } from "@/modules/ledger/contracts";
import { mapLedgerDto } from "@/modules/ledger/application/mappers";

export const getLedgerAction = withAuth(
  async (userId: string, id: string): Promise<LedgerDto | null> => {
    const existing = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
    });

    if (!existing || existing.userId !== userId) {
      return null;
    }

    return mapLedgerDto(existing);
  }
);

export const getLedgersAction = withAuth(async (userId: string): Promise<LedgerDto[]> => {
  const rows = await db.query.ledgers.findMany({
    where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
    orderBy: [desc(ledgers.createdAt)],
  });

  return rows.map(mapLedgerDto);
});

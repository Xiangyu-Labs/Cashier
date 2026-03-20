import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgers } from "@/persistence";
import { mapLedgerDto } from "@/modules/ledger/application/mappers";
import type { LedgerDto } from "@/modules/ledger/contracts";

export async function getLedgers(userId: string): Promise<LedgerDto[]> {
  const rows = await db.query.ledgers.findMany({
    where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
    orderBy: [desc(ledgers.createdAt)],
  });

  return rows.map(mapLedgerDto);
}

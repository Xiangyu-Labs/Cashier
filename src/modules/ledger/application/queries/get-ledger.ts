import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgers } from "@/persistence";
import { mapLedgerDto } from "@/modules/ledger/application/mappers";
import type { LedgerDto } from "@/modules/ledger/contracts";

interface GetLedgerInput {
  ledgerId: string;
  userId: string;
}

export async function getLedger({ ledgerId, userId }: GetLedgerInput): Promise<LedgerDto | null> {
  const ledger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
  });

  return ledger == null ? null : mapLedgerDto(ledger);
}

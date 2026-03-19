import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgers } from "@/persistence";

export async function getLedgerMainCurrency(ledgerId: string): Promise<string> {
  const ledger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    columns: { metadata: true },
  });

  return ledger?.metadata?.settings?.mainCurrency ?? "CNY";
}

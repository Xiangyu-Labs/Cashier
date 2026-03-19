import { db } from "@/lib/db";
import { ledgers } from "@/persistence";
import { and, eq, isNull } from "drizzle-orm";

export async function getLedgerAiLanguage(ledgerId: string): Promise<string> {
  const ledger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
  });

  const aiLanguage = ledger?.metadata?.settings?.aiLanguage;
  return aiLanguage != null && aiLanguage !== "" ? aiLanguage : "zh-CN";
}

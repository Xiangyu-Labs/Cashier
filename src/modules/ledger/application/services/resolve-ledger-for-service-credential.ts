import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { logError } from "@/lib/error-handlers";
import { ledgers, serviceCredentials, type Ledger } from "@/persistence";

export async function resolveLedgerForServiceCredential(
  credentialId: string
): Promise<Ledger | null> {
  const credential = await db.query.serviceCredentials.findFirst({
    where: and(eq(serviceCredentials.id, credentialId), isNull(serviceCredentials.deletedAt)),
    columns: { id: true, ledgerId: true },
  });

  if (credential == null) {
    return null;
  }

  try {
    await db
      .update(serviceCredentials)
      .set({ lastUsedAt: new Date() })
      .where(eq(serviceCredentials.id, credential.id));
  } catch (error) {
    logError("modules/ledger:resolve-ledger-for-service-credential:update-last-used", error);
  }

  const ledger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, credential.ledgerId), isNull(ledgers.deletedAt)),
  });

  return ledger ?? null;
}

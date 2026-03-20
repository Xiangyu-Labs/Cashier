import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { NotFoundError } from "@/lib/errors";
import { serviceCredentials } from "@/persistence/schema/ledger";

export async function deleteServiceCredential(
  ledgerId: string,
  credentialId: string
): Promise<void> {
  const q = forLedger(serviceCredentials, ledgerId);
  const result = await db
    .update(serviceCredentials)
    .set(q.softDelete)
    .where(q.whereId(credentialId))
    .returning({ id: serviceCredentials.id });

  if (result.length === 0) {
    throw new NotFoundError("Credential");
  }
}

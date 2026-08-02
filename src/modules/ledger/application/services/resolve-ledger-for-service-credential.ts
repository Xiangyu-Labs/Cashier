import type { LedgerPort } from "@/application/contracts";

export async function resolveLedgerForServiceCredential(
  credentialId: string,
  ledgers: LedgerPort
): Promise<{ id: string } | null> {
  const id = await ledgers.getLedgerIdForCredential(credentialId);
  return id == null ? null : { id };
}

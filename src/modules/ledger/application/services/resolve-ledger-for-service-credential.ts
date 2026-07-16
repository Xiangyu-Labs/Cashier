import type { LedgerPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";

export async function resolveLedgerForServiceCredential(
  credentialId: string,
  ledgers: LedgerPort = currentApplication.ledgers
): Promise<{ id: string } | null> {
  const id = await ledgers.getLedgerIdForCredential(credentialId);
  return id == null ? null : { id };
}

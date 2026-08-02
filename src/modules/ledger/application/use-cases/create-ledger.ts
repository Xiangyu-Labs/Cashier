import { currentApplication } from "@/application/current";
import { ConflictError } from "@/lib/errors";
import type { LedgerDto } from "@/modules/ledger/contracts";
import { createDefaultLedger } from "./create-default-ledger";

const CONFLICT_MESSAGE = "User already has a ledger. Only one ledger per user is allowed.";

export async function createLedger(input: { userId: string; locale?: string }): Promise<LedgerDto> {
  if ((await currentApplication.ledgers.listIdsForUser(input.userId)).length > 0) {
    throw new ConflictError(CONFLICT_MESSAGE);
  }
  try {
    const ledger = await createDefaultLedger(input);
    return {
      id: ledger.id,
      userId: ledger.userId,
      settings: ledger.settings,
      createdAt: ledger.createdAt.toISOString(),
      updatedAt: ledger.updatedAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof ConflictError) throw new ConflictError(CONFLICT_MESSAGE);
    throw error;
  }
}

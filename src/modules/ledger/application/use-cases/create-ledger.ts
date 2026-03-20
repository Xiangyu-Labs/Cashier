import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { ConflictError } from "@/lib/errors";
import { mapLedgerDto } from "@/modules/ledger/application/mappers";
import type { LedgerDto } from "@/modules/ledger/contracts";
import { createDefaultLedger } from "@/modules/ledger/application/use-cases/create-default-ledger";
import { ledgers } from "@/persistence";

const SINGLE_LEDGER_CONFLICT_MESSAGE =
  "User already has a ledger. Only one ledger per user is allowed.";

export async function createLedger(input: { userId: string; locale?: string }): Promise<LedgerDto> {
  const existingLedger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.userId, input.userId), isNull(ledgers.deletedAt)),
  });

  if (existingLedger != null) {
    throw new ConflictError(SINGLE_LEDGER_CONFLICT_MESSAGE);
  }

  try {
    const payload: Parameters<typeof createDefaultLedger>[0] = {
      userId: input.userId,
    };
    if (input.locale !== undefined) {
      payload.locale = input.locale;
    }

    const ledger = await createDefaultLedger(payload);

    if (ledger === undefined) {
      throw new Error("Failed to create ledger: transaction returned no result");
    }

    return mapLedgerDto(ledger);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new ConflictError(SINGLE_LEDGER_CONFLICT_MESSAGE);
    }
    throw error;
  }
}

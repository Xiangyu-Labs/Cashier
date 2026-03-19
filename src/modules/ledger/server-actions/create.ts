"use server";

import { db } from "@/lib/db";
import { ledgers } from "@/persistence";
import { withAuth } from "@/lib/auth-actions";
import { eq, isNull, and } from "drizzle-orm";
import { ConflictError } from "@/lib/errors";
import { createDefaultLedger } from "@/modules/ledger/application/use-cases/create-default-ledger";
import { mapLedgerDto } from "@/modules/ledger/mappers";
import type { LedgerDto } from "@/modules/ledger/contracts";
import { createLedgerInputSchema, type CreateLedgerInput } from "@/modules/ledger/contract-schemas";

export const createLedgerAction = withAuth(
  async (userId: string, data: CreateLedgerInput): Promise<LedgerDto> => {
    const validated = createLedgerInputSchema.parse(data);

    // Check if user already has a ledger
    const existingLedger = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
    });

    if (existingLedger) {
      throw new ConflictError("User already has a ledger. Only one ledger per user is allowed.");
    }

    let newLedger: Awaited<ReturnType<typeof createDefaultLedger>>;

    try {
      const payload: Parameters<typeof createDefaultLedger>[0] = {
        userId,
      };
      if (validated.aiLanguage !== undefined) payload.locale = validated.aiLanguage;
      newLedger = await createDefaultLedger(payload);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        throw new ConflictError("User already has a ledger. Only one ledger per user is allowed.");
      }
      throw error;
    }

    if (newLedger === undefined) {
      throw new Error("Failed to create ledger: transaction returned no result");
    }

    return mapLedgerDto(newLedger);
  }
);

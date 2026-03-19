"use server";

import { db } from "@/lib/db";
import { ledgers } from "@/persistence";
import { withAuth } from "@/lib/auth-actions";
import { createLedgerSchema } from "./schemas";
import type { CreateLedgerInput } from "./schemas";
import { eq, isNull, and } from "drizzle-orm";
import { ConflictError } from "@/lib/errors";
import type { Ledger } from "@/persistence";
import { createDefaultLedger } from "@/modules/ledger/application/use-cases/create-default-ledger";

export const createLedgerAction = withAuth(
  async (userId: string, data: CreateLedgerInput): Promise<Ledger> => {
    const validated = createLedgerSchema.parse(data);

    // Check if user already has a ledger
    const existingLedger = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
    });

    if (existingLedger) {
      throw new ConflictError("User already has a ledger. Only one ledger per user is allowed.");
    }

    let newLedger: Ledger;

    try {
      newLedger = await createDefaultLedger({
        userId,
        locale: validated.aiLanguage,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        throw new ConflictError("User already has a ledger. Only one ledger per user is allowed.");
      }
      throw error;
    }

    if (newLedger === undefined) {
      throw new Error("Failed to create ledger: transaction returned no result");
    }

    return newLedger;
  }
);

"use server";

import { db } from "@/lib/db";
import { ledgers, entryCategories } from "@/lib/db/schema";
import { defaultLedger } from "@/config/default-ledger";
import { withAuth } from "@/lib/auth-actions";
import { createLedgerSchema } from "./schemas";
import type { CreateLedgerInput } from "./schemas";
import { eq, isNull, and } from "drizzle-orm";
import { ConflictError } from "@/lib/errors";
import type { Ledger } from "@/lib/db/schema";

export const createLedgerAction = withAuth(async (userId: string, data: CreateLedgerInput): Promise<Ledger> => {
    const validated = createLedgerSchema.parse(data);

    // Check if user already has a ledger
    const existingLedger = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
    });

    if (existingLedger) {
        throw new ConflictError("User already has a ledger. Only one ledger per user is allowed.");
    }

    let newLedger: Ledger;

    // Atomically create ledger and seed categories in a transaction
    try {
        newLedger = db.transaction((tx) => {
            // 1. Create ledger
            const result = tx
                .insert(ledgers)
                .values({
                    userId: userId,
                    metadata: {
                        settings: {
                            aiLanguage: validated.aiLanguage || defaultLedger.settings.aiLanguage,
                            currencies: defaultLedger.settings.currencies,
                            mainCurrency: defaultLedger.settings.mainCurrency,
                            collapseEntriesDefault: defaultLedger.settings.collapseEntriesDefault,
                            aiCustomPrompt: defaultLedger.settings.aiCustomPrompt,
                        }
                    }
                })
                .returning()
                .all();

            if (!result || result.length === 0) {
                throw new Error("Failed to create ledger: no result returned");
            }

            const createdLedger = result[0];

            // 2. Seed categories for the new ledger
            if (defaultLedger.categories.length > 0) {
                tx.insert(entryCategories).values(
                    defaultLedger.categories.map((cat) => ({
                        ...cat,
                        ledgerId: createdLedger.id,
                    }))
                ).run();
            }

            return createdLedger;
        });
    } catch (error) {
        // Handle database-level unique constraint violation
        if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
            throw new ConflictError("User already has a ledger. Only one ledger per user is allowed.");
        }
        throw error;
    }

    if (!newLedger) {
        throw new Error("Failed to create ledger: transaction returned no result");
    }

    return newLedger;
});

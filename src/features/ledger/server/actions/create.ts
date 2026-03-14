"use server";

import { db } from "@/lib/db";
import { ledgers, entryCategories } from "@/lib/db/schema";
import { defaultLedger } from "@/config/default-ledger";
import { withAuth } from "@/lib/auth-actions";
import { createLedgerSchema } from "./schemas";
import type { CreateLedgerInput } from "./schemas";

export const createLedgerAction = withAuth(async (userId: string, data: CreateLedgerInput): Promise<import("@/lib/db/schema").Ledger> => {
    const validated = createLedgerSchema.parse(data);

    let newLedger: import("@/lib/db/schema").Ledger;

    // Atomically create ledger and seed categories in a transaction
    db.transaction((tx) => {
        // 1. Create ledger
        [newLedger] = tx
            .insert(ledgers)
            .values({
                userId: userId,
                name: validated.name,
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

        // 2. Seed categories for the new ledger
        if (defaultLedger.categories.length > 0) {
            tx.insert(entryCategories).values(
                defaultLedger.categories.map((cat) => ({
                    ...cat,
                    ledgerId: newLedger.id,
                }))
            ).run();
        }
    });

    return newLedger!;
});

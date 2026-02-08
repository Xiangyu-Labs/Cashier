import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../setup";
import { createTestUserWithLedger } from "../helpers/schema-setup";
import { ledgerEntries, ledgers, currencyRates, sourceDocuments } from "@/lib/db/schema";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { eq } from "drizzle-orm";

describe("Stats Currency Conversion", () => {
    let ledgerId: string;

    beforeEach(async () => {
        const db = getTestDb();
        const setup = await createTestUserWithLedger(db, "converter-test@example.com", "Converter Ledger");
        ledgerId = setup.ledgerId;

        // Set Main Currency to CNY
        await db.update(ledgers)
            .set({
                metadata: {
                    settings: {
                        mainCurrency: "CNY"
                    }
                }
            })
            .where(eq(ledgers.id, ledgerId));

        // Cleanup entries for this ledger
        await db.delete(ledgerEntries).where(eq(ledgerEntries.ledgerId, ledgerId));

        // Setup mock rates (Date: 2024-01-01)
        // Frankfurter base is usually EUR.
        // CNY = 7.8, USD = 1.08, MYR = 5.0
        // (Made up numbers for testing)
        await db.insert(currencyRates).values({
            date: "2024-01-01",
            base: "EUR",
            rates: {
                "CNY": 7.8,
                "USD": 1.08,
                "MYR": 5.0
            }
        }).onConflictDoUpdate({
            target: currencyRates.date,
            set: { rates: { "CNY": 7.8, "USD": 1.08, "MYR": 5.0 } }
        });
    });

    it("should convert multiple currencies to primary currency in stats", async () => {
        const db = getTestDb();

        // 1. Create source document with entryDate
        const [sourceDoc] = await db.insert(sourceDocuments).values({
            ledgerId,
            text: "MYR expense",
            entryDate: "2024-01-01",
            status: "completed",
        }).returning();

        // 2. Insert an entry in MYR associated with source document
        await db.insert(ledgerEntries).values({
            ledgerId,
            sourceDocumentId: sourceDoc.id,
            amount: "100.00",
            currency: "MYR",
            itemName: "MYR Item",
        });

        // 3. Call action
        const stats = await getLedgerStatsAction(ledgerId);

        // 4. Assert
        // Expected CNY = (100 / 5.0) * 7.8 = 20 * 7.8 = 156.0
        expect(stats.convertedTotal?.currency).toBe("CNY");
        expect(stats.convertedTotal?.total).toBeCloseTo(156.0);
    });

    it("should aggregate multiple different currencies into main currency", async () => {
        const db = getTestDb();

        // 1. Create source document with entryDate
        const [sourceDoc] = await db.insert(sourceDocuments).values({
            ledgerId,
            text: "Multi-currency expenses",
            entryDate: "2024-01-01",
            status: "completed",
        }).returning();

        // 2. Insert entries
        // 100 MYR = 156 CNY
        await db.insert(ledgerEntries).values({
            ledgerId,
            sourceDocumentId: sourceDoc.id,
            amount: "100.00",
            currency: "MYR",
            itemName: "MYR Item",
        });

        // 50 USD = (50 / 1.08) * 7.8 = 46.296 * 7.8 = 361.111
        await db.insert(ledgerEntries).values({
            ledgerId,
            sourceDocumentId: sourceDoc.id,
            amount: "50.00",
            currency: "USD",
            itemName: "USD Item",
        });

        // 100 CNY = 100 CNY
        await db.insert(ledgerEntries).values({
            ledgerId,
            sourceDocumentId: sourceDoc.id,
            amount: "100.00",
            currency: "CNY",
            itemName: "CNY Item",
        });

        // 3. Call action
        const stats = await getLedgerStatsAction(ledgerId);

        // 4. Assert
        // Total = 156 + 361.111 + 100 = 617.111
        expect(stats.convertedTotal?.currency).toBe("CNY");
        expect(stats.convertedTotal?.total).toBeCloseTo(617.11, 1);
    });
});

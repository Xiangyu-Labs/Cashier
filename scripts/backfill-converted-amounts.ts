/**
 * One-time script to backfill converted_amount and exchange_rate for existing entries.
 * 
 * Usage: npx tsx scripts/backfill-converted-amounts.ts
 * 
 * After running successfully, this script can be deleted.
 */

import * as fs from "fs";
import * as path from "path";

// Load .env.local BEFORE importing db (critical for DATABASE_URL)
function loadEnvLocal() {
    try {
        const envLocalPath = path.resolve(process.cwd(), ".env.local");
        if (fs.existsSync(envLocalPath)) {
            const envLocal = fs.readFileSync(envLocalPath, "utf8");
            const lines = envLocal.split('\n');
            for (const line of lines) {
                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    const value = match[2].trim();
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            }
        }
    } catch (error) {
        console.warn("Failed to load .env.local:", error);
    }
}

// Load env FIRST, then dynamically import modules
loadEnvLocal();

async function main() {
    // Dynamic import AFTER env is loaded
    const { db } = await import("../src/lib/db");
    const { ledgerEntries, ledgers } = await import("../src/lib/db/schema");
    const { eq, and, isNull, or } = await import("drizzle-orm");
    const { ExchangeRateService } = await import("../src/features/currency/server/exchange-rate-service");

    console.log("Starting backfill of converted_amount and exchange_rate...");
    console.log("Using DATABASE_URL:", process.env.DATABASE_URL || "sqlite.db");

    // Get all ledgers
    const allLedgers = await db.query.ledgers.findMany({
        where: isNull(ledgers.deletedAt),
    });

    console.log(`Found ${allLedgers.length} ledgers`);

    let totalUpdated = 0;
    let totalFailed = 0;

    for (const ledger of allLedgers) {
        const mainCurrency = ledger.metadata?.settings?.mainCurrency || "CNY";
        console.log(`\nProcessing ledger: ${ledger.name} (${ledger.id}), main currency: ${mainCurrency}`);

        // Get entries without converted_amount
        const entries = await db.query.ledgerEntries.findMany({
            where: and(
                eq(ledgerEntries.ledgerId, ledger.id),
                isNull(ledgerEntries.deletedAt),
                or(
                    isNull(ledgerEntries.convertedAmount),
                    eq(ledgerEntries.convertedAmount, "")
                )
            ),
        });

        console.log(`  Found ${entries.length} entries needing backfill`);

        for (const entry of entries) {
            const entryCurrency = entry.currency || "CNY";
            const amount = Number(entry.amount);
            const entryDate = entry.entryDate || undefined;

            let convertedAmount: string;
            let exchangeRate: string;

            if (entryCurrency === mainCurrency) {
                convertedAmount = amount.toFixed(2);
                exchangeRate = "1";
            } else {
                try {
                    const converted = await ExchangeRateService.convert(
                        amount,
                        entryCurrency,
                        mainCurrency,
                        entryDate
                    );
                    convertedAmount = converted.toFixed(2);
                    exchangeRate = (converted / amount).toFixed(6);
                } catch (err) {
                    console.error(`  Failed to convert entry ${entry.id}: ${err}`);
                    totalFailed++;
                    continue;
                }
            }

            await db.update(ledgerEntries)
                .set({ convertedAmount, exchangeRate })
                .where(eq(ledgerEntries.id, entry.id));

            totalUpdated++;
        }
    }

    console.log(`\nBackfill complete!`);
    console.log(`  Total entries updated: ${totalUpdated}`);
    console.log(`  Total entries failed: ${totalFailed}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Fatal error:", err);
        process.exit(1);
    });

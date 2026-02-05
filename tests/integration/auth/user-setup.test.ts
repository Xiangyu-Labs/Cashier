import { describe, it, expect } from "vitest";
import { createDefaultLedgerForUser } from "@/features/auth/server/services/user-setup";
import { getTestDb } from "../../setup";
import { ledgers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { defaultLedger } from "@/config/default-ledger";

describe("createDefaultLedgerForUser", () => {
    it("should create a ledger with all default settings from config", async () => {
        const db = getTestDb();
        const testUserId = "00000000-0000-0000-0000-000000000001";
        const testEmail = "newuser@example.com";

        // 1. Ensure user exists
        await db.insert(users).values({
            id: testUserId,
            email: testEmail,
            name: "New User",
        }).onConflictDoNothing();

        // 2. Call user setup
        const ledgerId = await createDefaultLedgerForUser(testUserId, testEmail);

        // 3. Verify ledger settings
        const ledger = await db.query.ledgers.findFirst({
            where: eq(ledgers.id, ledgerId),
        });

        expect(ledger).toBeDefined();
        expect(ledger?.name).toBe("newuser's Ledger");

        const settings = ledger?.metadata?.settings;
        expect(settings).toBeDefined();
        expect(settings?.currencies).toEqual(defaultLedger.settings.currencies);
        expect(settings?.mainCurrency).toBe(defaultLedger.settings.mainCurrency);
        expect(settings?.aiLanguage).toBe(defaultLedger.settings.aiLanguage);
    });
});

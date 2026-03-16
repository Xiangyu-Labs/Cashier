import { describe, it, expect } from "vitest";
import { createDefaultLedgerForUser } from "@/features/auth/server/services/user-setup";
import { getTestDb } from "../../setup";
import { ledgers, users, entryCategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
// Note: getDefaultLedger is used indirectly through createDefaultLedgerForUser

describe("createDefaultLedgerForUser", () => {
    it("should create a ledger with Chinese default settings when locale is zh", async () => {
        const db = getTestDb();
        const testUserId = "00000000-0000-0000-0000-000000000001";
        const testEmail = "newuser@example.com";

        // 1. Ensure user exists
        await db.insert(users).values({
            id: testUserId,
            email: testEmail,
            name: "New User",
        }).onConflictDoNothing();

        // 2. Call user setup with zh locale
        const ledgerId = await createDefaultLedgerForUser(testUserId, testEmail, "zh");

        // 3. Verify ledger settings
        const ledger = await db.query.ledgers.findFirst({
            where: eq(ledgers.id, ledgerId),
        });

        expect(ledger).toBeDefined();

        const settings = ledger?.metadata?.settings;
        expect(settings).toBeDefined();
        expect(settings?.currencies).toEqual(["CNY", "USD"]);
        expect(settings?.mainCurrency).toBe("CNY");
        expect(settings?.aiLanguage).toBe("zh-CN");

        // 4. Verify Chinese categories were created
        const categories = await db.query.entryCategories.findMany({
            where: eq(entryCategories.ledgerId, ledgerId),
        });

        const categoryNames = categories.map(c => c.name);
        expect(categoryNames).toContain("餐饮");
        expect(categoryNames).toContain("日用");
        expect(categoryNames).toContain("交通");
    });

    it("should create a ledger with English default settings when locale is en", async () => {
        const db = getTestDb();
        const testUserId = "00000000-0000-0000-0000-000000000002";
        const testEmail = "englishuser@example.com";

        // 1. Ensure user exists
        await db.insert(users).values({
            id: testUserId,
            email: testEmail,
            name: "English User",
        }).onConflictDoNothing();

        // 2. Call user setup with en locale
        const ledgerId = await createDefaultLedgerForUser(testUserId, testEmail, "en");

        // 3. Verify ledger settings
        const ledger = await db.query.ledgers.findFirst({
            where: eq(ledgers.id, ledgerId),
        });

        expect(ledger).toBeDefined();

        const settings = ledger?.metadata?.settings;
        expect(settings).toBeDefined();
        expect(settings?.currencies).toEqual(["USD", "EUR", "GBP"]);
        expect(settings?.mainCurrency).toBe("USD");
        expect(settings?.aiLanguage).toBe("en");

        // 4. Verify English categories were created
        const categories = await db.query.entryCategories.findMany({
            where: eq(entryCategories.ledgerId, ledgerId),
        });

        const categoryNames = categories.map(c => c.name);
        expect(categoryNames).toContain("Dining");
        expect(categoryNames).toContain("Groceries");
        expect(categoryNames).toContain("Transport");
    });

    it("should default to Chinese settings when no locale is provided", async () => {
        const db = getTestDb();
        const testUserId = "00000000-0000-0000-0000-000000000003";
        const testEmail = "defaultuser@example.com";

        // 1. Ensure user exists
        await db.insert(users).values({
            id: testUserId,
            email: testEmail,
            name: "Default User",
        }).onConflictDoNothing();

        // 2. Call user setup without locale (should default to zh)
        const ledgerId = await createDefaultLedgerForUser(testUserId, testEmail);

        // 3. Verify ledger uses Chinese settings
        const ledger = await db.query.ledgers.findFirst({
            where: eq(ledgers.id, ledgerId),
        });

        expect(ledger).toBeDefined();
        expect(ledger?.metadata?.settings?.aiLanguage).toBe("zh-CN");
        expect(ledger?.metadata?.settings?.mainCurrency).toBe("CNY");
    });
});

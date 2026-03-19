import { describe, it, expect } from "vitest";
import { eq, and, isNull } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgers, users } from "@/persistence";
import { ensureUserLedger } from "@/modules/workspace/use-cases";

describe("ensureUserLedger", () => {
  it("creates a ledger for a new user with the requested locale defaults", async () => {
    const db = getTestDb();
    const testUserId = "00000000-0000-0000-0000-000000000001";
    const testEmail = "newuser@example.com";

    await db
      .insert(users)
      .values({
        id: testUserId,
        email: testEmail,
        name: "New User",
      })
      .onConflictDoNothing();

    const result = await ensureUserLedger({
      userId: testUserId,
      locale: "en",
    });

    expect(result.created).toBe(true);

    const ledger = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, result.ledgerId),
    });

    expect(ledger).toBeDefined();
    expect(ledger?.metadata?.settings?.mainCurrency).toBe("USD");
    expect(ledger?.metadata?.settings?.aiLanguage).toBe("en");
  });

  it("returns the existing ledger and does not create another one", async () => {
    const db = getTestDb();
    const testUserId = "00000000-0000-0000-0000-000000000002";
    const testEmail = "existing@example.com";

    await db
      .insert(users)
      .values({
        id: testUserId,
        email: testEmail,
        name: "Existing User",
      })
      .onConflictDoNothing();

    const first = await ensureUserLedger({
      userId: testUserId,
      locale: "zh",
    });
    const second = await ensureUserLedger({
      userId: testUserId,
      locale: "en",
    });

    expect(first.ledgerId).toBe(second.ledgerId);
    expect(second.created).toBe(false);

    const activeLedgers = await db.query.ledgers.findMany({
      where: and(eq(ledgers.userId, testUserId), isNull(ledgers.deletedAt)),
    });
    expect(activeLedgers).toHaveLength(1);
  });
});

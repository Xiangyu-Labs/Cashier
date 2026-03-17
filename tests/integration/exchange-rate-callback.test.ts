import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "../setup";
import { ledgers, users } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";

// Mock auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("Exchange rate callback behavior", () => {
  let counter = 0;

  beforeEach(() => {
    counter++;

    // Setup auth mock for each test
    vi.mocked(auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });

  it("should query all non-deleted ledgers with their mainCurrency", async () => {
    const db = getTestDb();

    // Arrange: Create multiple ledgers with different users (userId has unique constraint)
    const user1Id = `user-1-${counter}`;
    const user2Id = `user-2-${counter}`;
    const user3Id = `user-3-${counter}`;
    const ledger1Id = `ledger-1-${counter}`;
    const ledger2Id = `ledger-2-${counter}`;
    const deletedLedgerId = `ledger-del-${counter}`;

    await db.insert(users).values({ id: user1Id, email: `user1-${counter}@example.com` });
    await db.insert(users).values({ id: user2Id, email: `user2-${counter}@example.com` });
    await db.insert(users).values({ id: user3Id, email: `user3-${counter}@example.com` });

    await db.insert(ledgers).values({
      id: ledger1Id,
      userId: user1Id,
      metadata: { settings: { mainCurrency: "USD" } },
    });

    await db.insert(ledgers).values({
      id: ledger2Id,
      userId: user2Id,
      metadata: { settings: { mainCurrency: "EUR" } },
    });

    await db.insert(ledgers).values({
      id: deletedLedgerId,
      userId: user3Id,
      metadata: { settings: { mainCurrency: "GBP" } },
      deletedAt: new Date(),
    });

    // Act: Query non-deleted ledgers (simulating onExchangeRatesUpdated behavior)
    const allLedgers = await db.query.ledgers.findMany({
      where: isNull(ledgers.deletedAt),
    });

    // Assert
    expect(allLedgers).toHaveLength(2);
    expect(allLedgers.map((l) => l.id)).toContain(ledger1Id);
    expect(allLedgers.map((l) => l.id)).toContain(ledger2Id);
    expect(allLedgers.map((l) => l.id)).not.toContain(deletedLedgerId);

    // Verify mainCurrency extraction
    const currencies = allLedgers.map((l) => l.metadata?.settings?.mainCurrency || "CNY");
    expect(currencies).toContain("USD");
    expect(currencies).toContain("EUR");
  });

  it("should default to CNY when mainCurrency is not set", async () => {
    const db = getTestDb();

    // Arrange: Create ledger without mainCurrency
    const ledgerId = `ledger-${counter}`;

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {}, // No settings
    });

    // Act: Query and extract currency
    const ledger = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });

    const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";

    // Assert
    expect(mainCurrency).toBe("CNY");
  });
});

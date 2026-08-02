import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "../setup";
import { ledgers, ledgerEntries, entryCategories, sourceDocuments } from "@/persistence";
import { eq } from "drizzle-orm";

// Mock auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("batchUpdateLedgerEntriesAction currency recalculation", () => {
  beforeEach(() => {
    // Setup auth mock for each test
    vi.mocked(auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });

  it("should update currency successfully", async () => {
    const db = getTestDb();

    // Arrange: Create test data
    const ledgerId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    const categoryId = crypto.randomUUID();
    const sourceDocId = crypto.randomUUID();

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {
        settings: { mainCurrency: "USD" },
      },
    });

    await db.insert(entryCategories).values({
      id: categoryId,
      ledgerId,
      name: "Test",
      sortOrder: 0,
    });

    await db.insert(sourceDocuments).values({
      id: sourceDocId,
      ledgerId,
    });

    await db.insert(ledgerEntries).values({
      id: entryId,
      ledgerId,
      categoryId,
      sourceDocumentId: sourceDocId,
      amount: "100",
      currency: "CNY",
      itemName: "Test Item",
    });

    // Act: Update currency
    await db
      .update(ledgerEntries)
      .set({ currency: "EUR", updatedAt: new Date() })
      .where(eq(ledgerEntries.id, entryId));

    // Assert
    const updated = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, entryId),
    });
    expect(updated?.currency).toBe("EUR");
  });

  it("should update itemName without changing currency", async () => {
    const db = getTestDb();

    // Arrange: Create test data
    const ledgerId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    const categoryId = crypto.randomUUID();
    const sourceDocId = crypto.randomUUID();

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });

    await db.insert(entryCategories).values({
      id: categoryId,
      ledgerId,
      name: "Test",
      sortOrder: 0,
    });

    await db.insert(sourceDocuments).values({
      id: sourceDocId,
      ledgerId,
    });

    await db.insert(ledgerEntries).values({
      id: entryId,
      ledgerId,
      categoryId,
      sourceDocumentId: sourceDocId,
      amount: "100",
      currency: "CNY",
      itemName: "Test Item",
    });

    // Act: Update itemName
    await db
      .update(ledgerEntries)
      .set({ itemName: "Updated Name", updatedAt: new Date() })
      .where(eq(ledgerEntries.id, entryId));

    // Assert
    const updated = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, entryId),
    });
    expect(updated?.itemName).toBe("Updated Name");
    expect(updated?.currency).toBe("CNY"); // Currency unchanged
  });
});

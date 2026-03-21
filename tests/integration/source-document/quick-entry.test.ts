import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, entryCategories, sourceDocuments, ledgerEntries, users } from "@/persistence";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// Mock auth
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { createQuickEntryAction } from "@/modules/source-document/actions";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

function mockSession(userId = TEST_USER_ID) {
  vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue({
    user: { id: userId, email: "test@example.com" },
    expires: new Date(Date.now() + 3600 * 1000).toISOString(),
  });
}

describe("createQuickEntryAction", () => {
  let ledgerId: string;
  let categoryId: string;

  beforeEach(async () => {
    mockSession();
    const db = getTestDb();

    // Clean up
    await db.delete(ledgerEntries);
    await db.delete(sourceDocuments);
    await db.delete(entryCategories);
    await db.delete(ledgers);

    // Create test ledger
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: { settings: { mainCurrency: "CNY" } },
    });

    // Create test category
    categoryId = uuidv4();
    await db.insert(entryCategories).values({
      id: categoryId,
      ledgerId,
      name: "Test Category",
      sortOrder: 0,
    });
  });

  it("should create quick entry with valid data", async () => {
    const result = await createQuickEntryAction(ledgerId, {
      categoryId,
      amount: 100.5,
      currency: "CNY",
      itemName: "Test Item",
      description: "Test description",
      entryDate: "2024-01-15",
    });

    expect(result.status).toBe("completed");
    expect(result.sourceDocumentId).toBeDefined();
    expect(result.ledgerEntryId).toBeDefined();

    // Verify source document was created
    const db = getTestDb();
    const sourceDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId),
    });
    expect(sourceDoc).toBeDefined();
    expect(sourceDoc?.type).toBe("manual");
    expect(sourceDoc?.status).toBe("completed");

    // Verify ledger entry was created
    const entry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, result.ledgerEntryId),
    });
    expect(entry).toBeDefined();
    expect(entry?.amount).toBe("100.50");
    expect(entry?.currency).toBe("CNY");
  });

  it("should use category name when itemName is not provided", async () => {
    const result = await createQuickEntryAction(ledgerId, {
      categoryId,
      amount: 50,
    });

    const db = getTestDb();
    const entry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, result.ledgerEntryId),
    });
    expect(entry?.itemName).toBe("Test Category");
  });

  it("should use default currency when not provided", async () => {
    const result = await createQuickEntryAction(ledgerId, {
      categoryId,
      amount: 100,
    });

    const db = getTestDb();
    const entry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, result.ledgerEntryId),
    });
    expect(entry?.currency).toBe("CNY");
  });

  it("should use provided currency", { timeout: 20_000 }, async () => {
    const result = await createQuickEntryAction(ledgerId, {
      categoryId,
      amount: 100,
      currency: "USD",
    });

    const db = getTestDb();
    const entry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, result.ledgerEntryId),
    });
    expect(entry?.currency).toBe("USD");
  });

  it("should use current date when entryDate not provided", async () => {
    const result = await createQuickEntryAction(ledgerId, {
      categoryId,
      amount: 100,
    });

    const db = getTestDb();
    const sourceDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId),
    });
    expect(sourceDoc?.entryDate).toBeDefined();
  });

  it("should throw error for unauthorized ledger", async () => {
    const otherUserId = uuidv4();
    const otherLedgerId = uuidv4();

    const db = getTestDb();
    // Create other user first
    await db
      .insert(users)
      .values({
        id: otherUserId,
        email: "other@example.com",
        name: "Other User",
        emailVerified: new Date(),
      })
      .onConflictDoNothing();

    await db.insert(ledgers).values({
      id: otherLedgerId,
      userId: otherUserId,
      metadata: {},
    });

    await expect(
      createQuickEntryAction(otherLedgerId, {
        categoryId,
        amount: 100,
      })
    ).rejects.toThrow("Unauthorized or Ledger not found");
  });

  it("should reject negative amount", async () => {
    await expect(
      createQuickEntryAction(ledgerId, {
        categoryId,
        amount: -100,
      })
    ).rejects.toThrow();
  });

  it("should reject zero amount", async () => {
    await expect(
      createQuickEntryAction(ledgerId, {
        categoryId,
        amount: 0,
      })
    ).rejects.toThrow();
  });

  it("should create entry with null description", async () => {
    const result = await createQuickEntryAction(ledgerId, {
      categoryId,
      amount: 100,
      description: null,
    });

    expect(result.status).toBe("completed");

    const db = getTestDb();
    const entry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, result.ledgerEntryId),
    });
    expect(entry?.description).toBeNull();
  });
});

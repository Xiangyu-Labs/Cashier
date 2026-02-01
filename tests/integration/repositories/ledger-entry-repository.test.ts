import { describe, it, expect, beforeEach } from "vitest";
import { ledgerEntryRepo } from "@/features/ledger/server/repository";
import { getTestDb } from "tests/setup";
import { ledgers, ledgerEntries } from "@/lib/db/schema";
import { createLedgerData, createLedgerEntryData } from "tests/helpers/factories";
import { eq } from "drizzle-orm";

describe("LedgerEntryRepository Integration", () => {
  const TEST_USER_ID = "00000000-0000-0000-0000-000000000000"; // From tests/setup.ts
  let ledgerId: string;

  beforeEach(async () => {
    const db = getTestDb();

    // Create a parent ledger for testing
    const ledgerData = createLedgerData({ userId: TEST_USER_ID } as any);
    const [ledger] = await db.insert(ledgers).values(ledgerData).returning();
    ledgerId = ledger.id;
  });

  it("should create a new ledger entry", async () => {
    const entryData = createLedgerEntryData(ledgerId, {
      itemName: "Test Item",
      amount: "100.50",
      currency: "USD",
      description: "Test Description"
    });

    const created = await ledgerEntryRepo.create(entryData, ledgerId);

    expect(created).toBeDefined();
    expect(created.id).toBe(entryData.id);
    expect(created.itemName).toBe("Test Item");
    expect(created.amount).toBe("100.50");

    // Verify in DB directly
    const db = getTestDb();
    const result = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, created.id));
    expect(result).toHaveLength(1);
    expect(result[0].itemName).toBe("Test Item");
  });

  it("should retrieve a ledger entry by ID", async () => {
    // Setup: Insert directly to ensure data exists
    const db = getTestDb();
    const entryData = createLedgerEntryData(ledgerId, {
        itemName: "Fetch Me",
        amount: "50.00"
    });
    await db.insert(ledgerEntries).values(entryData);

    // Act
    const retrieved = await ledgerEntryRepo.getById(entryData.id, ledgerId);

    // Assert
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(entryData.id);
    expect(retrieved?.itemName).toBe("Fetch Me");
    expect(retrieved?.amount).toBe("50.00");
  });

  it("should update a ledger entry", async () => {
    // Setup
    const db = getTestDb();
    const entryData = createLedgerEntryData(ledgerId, {
        itemName: "Old Name",
        amount: "10.00"
    });
    await db.insert(ledgerEntries).values(entryData);

    // Act
    const updated = await ledgerEntryRepo.update(entryData.id, {
        itemName: "New Name",
        amount: "20.00"
    }, ledgerId);

    // Assert
    expect(updated.itemName).toBe("New Name");
    expect(updated.amount).toBe("20.00");

    // Verify persistence
    const retrieved = await ledgerEntryRepo.getById(entryData.id, ledgerId);
    expect(retrieved?.itemName).toBe("New Name");
  });

  it("should delete a ledger entry", async () => {
    // Setup
    const db = getTestDb();
    const entryData = createLedgerEntryData(ledgerId, { itemName: "Delete Me" });
    await db.insert(ledgerEntries).values(entryData);

    // Act
    await ledgerEntryRepo.delete(entryData.id, ledgerId);

    // Assert
    const retrieved = await ledgerEntryRepo.getById(entryData.id, ledgerId);
    expect(retrieved).toBeNull();
  });

  it("should respect tenant isolation (ledgerId)", async () => {
    // Setup: Create another ledger
    const db = getTestDb();
    const otherLedgerData = createLedgerData({ userId: TEST_USER_ID } as any);
    const [otherLedger] = await db.insert(ledgers).values(otherLedgerData).returning();

    // Create entry in main ledger
    const entryData = createLedgerEntryData(ledgerId, { itemName: "Main Ledger Item" });
    await db.insert(ledgerEntries).values(entryData);

    // Act: Try to fetch from other ledger
    const result = await ledgerEntryRepo.getById(entryData.id, otherLedger.id);

    // Assert
    expect(result).toBeNull();
  });
});

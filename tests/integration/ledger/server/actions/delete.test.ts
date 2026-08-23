import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "tests/setup";
import { users, ledgers, entryCategories } from "@/persistence";
import { deleteLedgerAction } from "@/modules/ledger/actions";
import { eq } from "drizzle-orm";

// Mock next/cache
vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
}));

// Mock auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

// Test user ID
const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("deleteLedgerAction", () => {
  let counter = 0;

  beforeEach(() => {
    counter++;
    // Setup auth mock for each test
    vi.mocked(auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });

  it("should soft-delete ledger and all related data", async () => {
    const db = getTestDb();

    // Arrange: Create test ledger and related data (user already exists from setup.ts)
    const ledgerId = crypto.randomUUID();

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
    });

    await db.insert(entryCategories).values({
      id: crypto.randomUUID(),
      ledgerId,
      name: "Test Category",
      sortOrder: 0,
    });

    // Act: Delete the ledger (withAuth extracts userId from session, only pass ledgerId)
    await deleteLedgerAction(ledgerId);

    // Assert: Check all data is soft-deleted
    const ledger = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });
    expect(ledger?.deletedAt).not.toBeNull();

    const categories = await db.query.entryCategories.findMany({
      where: eq(entryCategories.ledgerId, ledgerId),
    });
    expect(categories.every((c) => c.deletedAt !== null)).toBe(true);
  });

  it("should throw NotFoundError if ledger does not exist", async () => {
    await expect(deleteLedgerAction(crypto.randomUUID())).rejects.toThrow("Ledger");
  });

  it("should throw NotFoundError if user does not own the ledger", async () => {
    const db = getTestDb();

    // Arrange: Create ledger owned by different user
    const ownerId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();

    await db.insert(users).values({
      id: ownerId,
      email: `owner${counter}@example.com`,
    });

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: ownerId,
    });

    // Ownership is intentionally indistinguishable from absence at the action boundary.
    await expect(deleteLedgerAction(ledgerId)).rejects.toThrow("Ledger");
  });
});

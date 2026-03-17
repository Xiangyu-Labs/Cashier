import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "../../../../../setup";
import { users, ledgers, entryCategories } from "@/lib/db/schema";
import { deleteLedgerAction } from "@/features/ledger/server/actions/delete";
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
    const ledgerId = `test-ledger-${counter}`;

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });

    await db.insert(entryCategories).values({
      id: `test-category-${counter}`,
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

  it("should clear defaultLedgerId for users who had this ledger as default", async () => {
    const db = getTestDb();

    // Arrange: Create ledger and set it as default for test user
    const ledgerId = `test-ledger-${counter}`;

    // Update test user to have defaultLedgerId
    await db.update(users).set({ defaultLedgerId: ledgerId }).where(eq(users.id, TEST_USER_ID));

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });

    // Act: Delete the ledger (withAuth extracts userId from session, only pass ledgerId)
    await deleteLedgerAction(ledgerId);

    // Assert: Check defaultLedgerId is cleared
    const user = await db.query.users.findFirst({
      where: eq(users.id, TEST_USER_ID),
    });
    expect(user?.defaultLedgerId).toBeNull();
  });

  it("should throw NotFoundError if ledger does not exist", async () => {
    await expect(deleteLedgerAction("non-existent-ledger")).rejects.toThrow("Ledger");
  });

  it("should throw ForbiddenError if user does not own the ledger", async () => {
    const db = getTestDb();

    // Arrange: Create ledger owned by different user
    const ownerId = `owner-${counter}`;
    const ledgerId = `test-ledger-${counter}`;

    await db.insert(users).values({
      id: ownerId,
      email: `owner${counter}@example.com`,
    });

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: ownerId,
      metadata: {},
    });

    // Act & Assert - withAuth uses TEST_USER_ID from session, which doesn't own the ledger
    await expect(deleteLedgerAction(ledgerId)).rejects.toThrow("Access denied");
  });
});

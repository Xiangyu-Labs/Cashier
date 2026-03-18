import { describe, it, expect, beforeEach, vi } from "vitest";
import { getLedgerEntryAction } from "@/features/ledger/server/actions/get-entry";
import { getTestDb } from "../setup";
import { ledgers, ledgerEntries, users, sourceDocuments } from "@/persistence";
import {
  createLedgerData,
  createLedgerEntryData,
  createSourceDocumentData,
} from "../helpers/factories";
import { v4 as uuidv4 } from "uuid";

// Mock auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

describe("getLedgerEntryAction", () => {
  const testUserId = "00000000-0000-0000-0000-000000000000";

  beforeEach(() => {
    // Default mock implementation
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: testUserId, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });

  it("should return the ledger entry when it exists and user has access", async () => {
    const db = getTestDb();
    // 1. Create Ledger
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Create Source Document
    const sourceDocData = createSourceDocumentData(ledgerData.id);
    await db.insert(sourceDocuments).values(sourceDocData);

    // 3. Create Entry
    const entryData = createLedgerEntryData(ledgerData.id, { sourceDocumentId: sourceDocData.id });
    await db.insert(ledgerEntries).values(entryData);

    // 4. Action - now returns data directly
    const result = await getLedgerEntryAction(entryData.id);

    // 5. Assertion
    expect(result).not.toBeNull();
    expect(result!.id).toBe(entryData.id);
    expect(result!.ledgerId).toBe(ledgerData.id);
  });

  it("should return null when entry does not exist", async () => {
    const result = await getLedgerEntryAction(uuidv4());
    expect(result).toBeNull();
  });

  it("should throw error when user does not have access to the ledger", async () => {
    // 1. Create Ledger for ANOTHER user
    const otherUserId = "11111111-1111-1111-1111-111111111111";

    // Mock auth to return the default test user, BUT the ledger belongs to otherUserId
    // The global setup already creates testUserId. We need to verify that testUserId cannot access otherUserId's ledger.
    // So we don't need to change the auth mock here, just create data for another user.

    // Ensure other user exists
    const db = getTestDb();
    await db
      .insert(users)
      .values({
        id: otherUserId,
        email: "other@example.com",
        name: "Other User",
        emailVerified: new Date(),
      })
      .onConflictDoNothing();

    const ledgerData = createLedgerData({ userId: otherUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Create Source Document
    const sourceDocData = createSourceDocumentData(ledgerData.id);
    await db.insert(sourceDocuments).values(sourceDocData);

    // 3. Create Entry
    const entryData = createLedgerEntryData(ledgerData.id, { sourceDocumentId: sourceDocData.id });
    await db.insert(ledgerEntries).values(entryData);

    // 4. Action (Current authenticated user is testUserId) - now throws
    await expect(getLedgerEntryAction(entryData.id)).rejects.toThrow("Unauthorized");
  });
});

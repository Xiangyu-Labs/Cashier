import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { ledgers, users } from "@/persistence";
import { createLedgerAction } from "@/features/ledger/server/actions/create";
import { ConflictError } from "@/lib/errors";

// Mock auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

async function createTestUser(email?: string) {
  const id = crypto.randomUUID();
  const [user] = await db
    .insert(users)
    .values({
      id,
      email: email ?? `test-${id}@example.com`,
      name: "Test User",
      emailVerified: new Date(),
    })
    .returning();
  return user;
}

describe("createLedgerAction single limit", () => {
  beforeEach(async () => {
    // Clean up test ledgers before each test
    await db.delete(ledgers);
  });

  it("should allow creating first ledger", async () => {
    const user = await createTestUser();

    // Mock auth to return this user
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: user.id, email: user.email },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const result = await createLedgerAction({});

    expect(result).toBeDefined();
    expect(result.userId).toBe(user.id);
  });

  it("should reject creating second ledger", async () => {
    const user = await createTestUser();

    // Mock auth for first ledger creation
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: user.id, email: user.email },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Create first ledger
    await createLedgerAction({});

    // Mock auth for second attempt (same user)
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: user.id, email: user.email },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Attempt to create second ledger should fail
    await expect(createLedgerAction({})).rejects.toThrow(ConflictError);
  });

  it("should reject with correct error message", async () => {
    const user = await createTestUser();

    // Mock auth for first ledger creation
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: user.id, email: user.email },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Create first ledger
    await createLedgerAction({});

    // Mock auth for second attempt
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: user.id, email: user.email },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Verify error message
    await expect(createLedgerAction({})).rejects.toThrow(
      "User already has a ledger. Only one ledger per user is allowed."
    );
  });
});

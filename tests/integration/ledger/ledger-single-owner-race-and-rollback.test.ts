import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { createTestUser } from "tests/helpers/schema-setup";
import { ledgers } from "@/persistence";
import { ConflictError } from "@/lib/errors";
import { createDefaultLedger, createLedger } from "@/modules/ledger/use-cases";

describe("ledger single-owner race and rollback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allows recreating a ledger after the previous one is soft deleted", async () => {
    const db = getTestDb();
    const userId = await createTestUser(db, undefined, crypto.randomUUID());
    const initial = await createDefaultLedger({ userId, locale: "zh" });

    await db.update(ledgers).set({ deletedAt: new Date() }).where(eq(ledgers.id, initial.id));

    const recreated = await createLedger({ userId, locale: "en" });

    expect(recreated.id).not.toBe(initial.id);
    expect(recreated.userId).toBe(userId);
  });

  it("maps UNIQUE constraint failures from createDefaultLedger to ConflictError", async () => {
    const db = getTestDb();
    const userId = await createTestUser(db, undefined, crypto.randomUUID());

    const createDefaultLedgerSpy = vi
      .spyOn(await import("@/modules/ledger/application/use-cases/create-default-ledger"), "createDefaultLedger")
      .mockRejectedValueOnce(new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed: ledgers.user_id"));

    await expect(createLedger({ userId, locale: "zh" })).rejects.toThrow(ConflictError);
    createDefaultLedgerSpy.mockRestore();
  });

  it("rolls back createDefaultLedger when category insertion fails", async () => {
    const db = getTestDb();
    const userId = await createTestUser(db, undefined, crypto.randomUUID());
    const defaultLedgerModule = await import("@/config/default-ledger");
    const getDefaultLedgerSpy = vi.spyOn(defaultLedgerModule, "getDefaultLedger").mockReturnValue({
      settings: { mainCurrency: "CNY" },
      categories: [
        {
          name: null as never,
          description: null,
          icon: null,
          sortOrder: 1,
          isEditable: true,
        },
      ],
    });

    await expect(createDefaultLedger({ userId })).rejects.toThrow();

    const persisted = await db.query.ledgers.findFirst({
      where: eq(ledgers.userId, userId),
    });
    expect(persisted).toBeUndefined();
    getDefaultLedgerSpy.mockRestore();
  });
});

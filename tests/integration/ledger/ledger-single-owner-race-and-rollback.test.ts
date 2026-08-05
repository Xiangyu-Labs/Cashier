import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { createTestUser } from "tests/helpers/schema-setup";
import { ledgers } from "@/persistence";
import { ConflictError } from "@/lib/errors";
import { createDefaultLedger as createDefaultLedgerUseCase } from "@/modules/ledger/application/use-cases/create-default-ledger";
import { createLedger as createLedgerUseCase } from "@/modules/ledger/application/use-cases/create-ledger";
import { serverComposition } from "@/application/server-composition-root";

const createDefaultLedger = (input: Parameters<typeof createDefaultLedgerUseCase>[0]) =>
  createDefaultLedgerUseCase(input, serverComposition.ledgers);
const createLedger = (input: Parameters<typeof createLedgerUseCase>[0]) =>
  createLedgerUseCase(input, serverComposition.ledgers);

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

  it("preserves normalized conflicts from the ledger port", async () => {
    const db = getTestDb();
    const userId = await createTestUser(db, undefined, crypto.randomUUID());

    const createDefaultLedgerSpy = vi
      .spyOn(
        await import("@/modules/ledger/application/use-cases/create-default-ledger"),
        "createDefaultLedger"
      )
      .mockRejectedValueOnce(new ConflictError("User already has an active ledger"));

    await expect(createLedger({ userId, locale: "zh" })).rejects.toThrow(ConflictError);
    createDefaultLedgerSpy.mockRestore();
  });

  it("rolls back createDefaultLedger when category insertion fails", async () => {
    const db = getTestDb();
    const userId = await createTestUser(db, undefined, crypto.randomUUID());
    const defaultLedgerModule = await import("@/config/default-ledger");
    const getDefaultLedgerSpy = vi.spyOn(defaultLedgerModule, "getDefaultLedger").mockReturnValue({
      settings: {
        aiLanguage: "zh-CN",
        currencies: ["CNY", "USD"],
        mainCurrency: "CNY",
        collapseEntriesDefault: false,
        aiCustomPrompt: "",
        duplicateDetectionEnabled: true,
      },
      categories: [
        {
          name: "Duplicate category",
          description: "First duplicate category",
          icon: "Utensils",
          sortOrder: 1,
          isEditable: true,
        },
        {
          name: "Duplicate category",
          description: "Second duplicate category",
          icon: "Package",
          sortOrder: 2,
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

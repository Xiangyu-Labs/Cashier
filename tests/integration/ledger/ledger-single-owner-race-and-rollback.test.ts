import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { createTestUser } from "tests/helpers/schema-setup";
import { ledgers } from "@/persistence";
import { serverComposition } from "@/application/server-composition-root";
import { getDefaultLedger } from "@/config/default-ledger";

const createDefaultLedger = (input: { userId: string; locale?: string }) => {
  const defaults = getDefaultLedger(input.locale ?? "zh");
  return serverComposition.ledgers.createDefault({
    userId: input.userId,
    settings: defaults.settings,
    categories: defaults.categories,
  });
};

describe("ledger single-owner race and rollback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allows recreating a ledger after the previous one is soft deleted", async () => {
    const db = getTestDb();
    const userId = await createTestUser(db, undefined, crypto.randomUUID());
    const initial = await createDefaultLedger({ userId, locale: "zh" });

    await db.update(ledgers).set({ deletedAt: new Date() }).where(eq(ledgers.id, initial.id));

    const recreated = await createDefaultLedger({ userId, locale: "en" });

    expect(recreated.id).not.toBe(initial.id);
    expect(recreated.userId).toBe(userId);
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
        },
        {
          name: "Duplicate category",
          description: "Second duplicate category",
          icon: "Package",
          sortOrder: 2,
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

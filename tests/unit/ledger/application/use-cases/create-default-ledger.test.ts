import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { createTestUser } from "tests/helpers/schema-setup";
import { entryCategories, ledgers } from "@/persistence";

const getDefaultLedgerMock = vi.hoisted(() => vi.fn());

vi.mock("@/config/default-ledger", () => ({
  getDefaultLedger: getDefaultLedgerMock,
}));

import { createDefaultLedger } from "@/modules/ledger/application/use-cases/create-default-ledger";

describe("createDefaultLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDefaultLedgerMock.mockImplementation((locale: string) => ({
      settings: {
        mainCurrency: locale === "en" ? "USD" : "CNY",
        aiLanguage: locale,
      },
      categories: [
        {
          name: locale === "en" ? "Food" : "餐饮",
          description: null,
          icon: null,
          sortOrder: 1,
          isEditable: true,
        },
      ],
    }));
  });

  it("creates a ledger with locale-aware default settings and categories", async () => {
    const db = getTestDb();
    const userId = await createTestUser(db, undefined, crypto.randomUUID());

    const ledger = await createDefaultLedger({ userId, locale: "en" });
    const categories = await db.query.entryCategories.findMany({
      where: eq(entryCategories.ledgerId, ledger.id),
    });

    expect(getDefaultLedgerMock).toHaveBeenCalledWith("en");
    expect(ledger.userId).toBe(userId);
    expect(ledger.settings).toEqual({
      mainCurrency: "USD",
      aiLanguage: "en",
      currencies: [],
      collapseEntriesDefault: false,
      aiCustomPrompt: "",
      timeZone: null,
    });
    expect(categories).toHaveLength(1);
    expect(categories[0]?.name).toBe("Food");
  });

  it("rolls back the ledger insert when category creation fails", async () => {
    const db = getTestDb();
    const userId = await createTestUser(db, undefined, crypto.randomUUID());
    getDefaultLedgerMock.mockReturnValueOnce({
      settings: { mainCurrency: "CNY" },
      categories: [
        {
          name: null,
          description: null,
          icon: null,
          sortOrder: 1,
          isEditable: true,
        },
      ],
    });

    await expect(createDefaultLedger({ userId })).rejects.toThrow();

    const persistedLedger = await db.query.ledgers.findFirst({
      where: eq(ledgers.userId, userId),
    });
    expect(persistedLedger).toBeUndefined();
  });
});

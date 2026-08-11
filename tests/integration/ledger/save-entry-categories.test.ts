import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { saveEntryCategoriesAction } from "@/modules/ledger/server-actions/categories";
import { entryCategories, ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import { getTestDb } from "../../setup";
import { createLedgerData, createSourceDocumentData } from "../../helpers/factories";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

describe("saveEntryCategoriesAction", () => {
  const userId = "00000000-0000-0000-0000-000000000000";

  beforeEach(() => {
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: userId, email: "category-save@example.com" },
      expires: new Date(Date.now() + 3_600_000).toISOString(),
    });
  });

  it("commits additions, edits, deletions, and ordering in one transaction", async () => {
    const db = getTestDb();
    const ledger = createLedgerData({ userId });
    const keepId = crypto.randomUUID();
    const removeId = crypto.randomUUID();
    const newId = crypto.randomUUID();
    const document = createSourceDocumentData(ledger.id);
    const entryId = crypto.randomUUID();

    await db.insert(ledgers).values(ledger);
    await db.insert(entryCategories).values([
      { id: keepId, ledgerId: ledger.id, name: "Keep", sortOrder: 0 },
      { id: removeId, ledgerId: ledger.id, name: "Remove", sortOrder: 1 },
    ]);
    await db.insert(sourceDocuments).values(document);
    await db.insert(ledgerEntries).values({
      id: entryId,
      ledgerId: ledger.id,
      sourceDocumentId: document.id,
      itemName: "Categorized",
      amount: "10.00",
      currency: "CNY",
      categoryId: removeId,
    });

    const saved = await saveEntryCategoriesAction(ledger.id, {
      categories: [
        {
          clientId: newId,
          name: "New",
          description: "Created in draft",
          icon: "circle",
        },
        {
          id: keepId,
          name: "Renamed",
          description: null,
          icon: null,
        },
      ],
    });

    expect(saved.map((category) => category.id)).toEqual([newId, keepId]);
    expect(saved.map((category) => category.sortOrder)).toEqual([0, 1]);
    expect(saved[1]?.name).toBe("Renamed");
    const removed = await db.query.entryCategories.findFirst({
      where: eq(entryCategories.id, removeId),
    });
    const entry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, entryId),
    });
    expect(removed?.deletedAt).not.toBeNull();
    expect(entry?.categoryId).toBeNull();
  });

  it("rolls back every change when a non-editable category would be deleted", async () => {
    const db = getTestDb();
    const ledger = createLedgerData({ userId });
    const editableId = crypto.randomUUID();
    const fixedId = crypto.randomUUID();
    await db.insert(ledgers).values(ledger);
    await db.insert(entryCategories).values([
      { id: editableId, ledgerId: ledger.id, name: "Editable", sortOrder: 0 },
      {
        id: fixedId,
        ledgerId: ledger.id,
        name: "Fixed",
        sortOrder: 1,
        isEditable: false,
      },
    ]);

    await expect(
      saveEntryCategoriesAction(ledger.id, {
        categories: [
          {
            id: editableId,
            name: "Must roll back",
            description: null,
            icon: null,
          },
        ],
      })
    ).rejects.toThrow(/non-editable category cannot be deleted/i);

    const active = await db.query.entryCategories.findMany({
      where: isNull(entryCategories.deletedAt),
      orderBy: entryCategories.sortOrder,
    });
    expect(active.map((category) => category.name)).toEqual(["Editable", "Fixed"]);
  });
});

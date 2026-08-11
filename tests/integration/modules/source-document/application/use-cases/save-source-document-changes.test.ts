import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { saveSourceDocumentChangesAction } from "@/modules/source-document/actions";
import { ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import { getTestDb } from "../../../../../setup";
import { createLedgerData, createSourceDocumentData } from "../../../../../helpers/factories";
import { activateTestSourceDocumentProjection } from "../../../../../helpers/schema-setup";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

describe("saveSourceDocumentChangesAction", () => {
  const userId = "00000000-0000-0000-0000-000000000000";

  beforeEach(() => {
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: userId, email: "atomic-save@example.com" },
      expires: new Date(Date.now() + 3_600_000).toISOString(),
    });
  });

  async function seedDocument() {
    const db = getTestDb();
    const ledger = createLedgerData({ userId, mainCurrency: "USD" });
    const document = createSourceDocumentData(ledger.id, {
      status: "completed",
      type: "manual",
      title: "Original title",
      entryDate: "2026-08-01",
    });
    const firstEntryId = crypto.randomUUID();
    const secondEntryId = crypto.randomUUID();

    await db.insert(ledgers).values(ledger);
    await db.insert(sourceDocuments).values(document);
    await db.insert(ledgerEntries).values([
      {
        id: firstEntryId,
        ledgerId: ledger.id,
        sourceDocumentId: document.id,
        amount: "10.00",
        currency: "USD",
        itemName: "First",
        convertedAmount: "10.00",
        exchangeRate: "1.000000",
      },
      {
        id: secondEntryId,
        ledgerId: ledger.id,
        sourceDocumentId: document.id,
        amount: "20.00",
        currency: "USD",
        itemName: "Second",
        convertedAmount: "20.00",
        exchangeRate: "1.000000",
      },
    ]);
    const revisionId = await activateTestSourceDocumentProjection(db, document.id);

    return { db, ledger, document, firstEntryId, secondEntryId, revisionId };
  }

  it("commits document and entry changes together and returns the authoritative projection", async () => {
    const fixture = await seedDocument();
    const operationId = crypto.randomUUID();

    const result = await saveSourceDocumentChangesAction(fixture.ledger.id, {
      sourceDocumentId: fixture.document.id,
      expectedRevisionId: fixture.revisionId,
      operationId,
      sourceDocument: { title: "Updated title" },
      entries: [
        {
          ledgerEntryId: fixture.firstEntryId,
          data: { itemName: "Updated first", amount: 12 },
        },
        {
          ledgerEntryId: fixture.secondEntryId,
          data: { description: "Updated second" },
        },
      ],
    });

    expect(result.activeRevisionId).toBe(operationId);
    expect(result.sourceDocument).toMatchObject({
      id: fixture.document.id,
      title: "Updated title",
      activeRevisionId: operationId,
    });
    expect(result.sourceDocument.ledgerEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: fixture.firstEntryId,
          itemName: "Updated first",
          amount: "12.00",
        }),
        expect.objectContaining({
          id: fixture.secondEntryId,
          description: "Updated second",
        }),
      ])
    );
  });

  it("rolls back the document patch when any entry does not belong to the active projection", async () => {
    const fixture = await seedDocument();
    const operationId = crypto.randomUUID();

    await expect(
      saveSourceDocumentChangesAction(fixture.ledger.id, {
        sourceDocumentId: fixture.document.id,
        expectedRevisionId: fixture.revisionId,
        operationId,
        sourceDocument: { title: "Must not persist" },
        entries: [
          {
            ledgerEntryId: crypto.randomUUID(),
            data: { itemName: "Invalid entry" },
          },
        ],
      })
    ).rejects.toThrow();

    const document = await fixture.db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, fixture.document.id),
    });
    const activeEntries = await fixture.db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, fixture.document.id),
        isNull(ledgerEntries.deletedAt)
      ),
    });
    expect(document?.title).toBe("Original title");
    expect(document?.activeRevisionId).toBe(fixture.revisionId);
    expect(activeEntries.map((entry) => entry.itemName).sort()).toEqual(["First", "Second"]);
  });

  it("rejects a stale revision without writing any changes", async () => {
    const fixture = await seedDocument();

    await expect(
      saveSourceDocumentChangesAction(fixture.ledger.id, {
        sourceDocumentId: fixture.document.id,
        expectedRevisionId: crypto.randomUUID(),
        operationId: crypto.randomUUID(),
        sourceDocument: { title: "Stale update" },
        entries: [],
      })
    ).rejects.toThrow(/active revision changed/i);

    const document = await fixture.db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, fixture.document.id),
    });
    expect(document?.title).toBe("Original title");
    expect(document?.activeRevisionId).toBe(fixture.revisionId);
  });

  it("replays an acknowledged operation without creating another revision", async () => {
    const fixture = await seedDocument();
    const operationId = crypto.randomUUID();
    const input = {
      sourceDocumentId: fixture.document.id,
      expectedRevisionId: fixture.revisionId,
      operationId,
      sourceDocument: { title: "Idempotent update" },
      entries: [
        {
          ledgerEntryId: fixture.firstEntryId,
          data: { itemName: "Idempotent entry" },
        },
      ],
    };

    const first = await saveSourceDocumentChangesAction(fixture.ledger.id, input);
    const replay = await saveSourceDocumentChangesAction(fixture.ledger.id, input);

    expect(replay).toEqual(first);
    const document = await fixture.db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, fixture.document.id),
    });
    expect(document?.activeRevisionId).toBe(operationId);
  });
});

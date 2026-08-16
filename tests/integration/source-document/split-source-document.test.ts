import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { splitSourceDocumentAction } from "@/modules/source-document/actions";
import {
  ledgerEntries,
  ledgers,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";
import { getTestDb } from "../../setup";
import { createLedgerData, createSourceDocumentData } from "../../helpers/factories";
import { activateTestSourceDocumentProjection } from "../../helpers/schema-setup";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

describe("splitSourceDocumentAction", () => {
  const userId = "00000000-0000-0000-0000-000000000000";

  beforeEach(() => {
    vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue({
      user: { id: userId, email: "split@example.com" },
      expires: new Date(Date.now() + 3_600_000).toISOString(),
    });
  });

  async function seedDocument() {
    const db = getTestDb();
    const ledger = createLedgerData({ userId, mainCurrency: "USD" });
    const document = createSourceDocumentData(ledger.id, {
      status: "completed",
      title: "Shared receipt",
      entryDate: "2026-08-01",
    });
    const entryIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(ledgers).values(ledger);
    await db.insert(sourceDocuments).values(document);
    await db.insert(ledgerEntries).values(
      entryIds.map((id, position) => ({
        id,
        ledgerId: ledger.id,
        sourceDocumentId: document.id,
        position,
        amount: `${position + 1}0.00`,
        currency: "USD",
        itemName: `Item ${position + 1}`,
        convertedAmount: `${position + 1}0.00`,
        exchangeRate: "1.000000",
        createdAt: new Date(`2026-08-01T00:00:0${position}.000Z`),
      }))
    );
    const revisionId = await activateTestSourceDocumentProjection(db, document.id, {
      text: "Full original evidence",
      imageUrls: ["fixture.jpg"],
    });
    return { db, ledger, document, entryIds, revisionId };
  }

  it("moves selected entries atomically while sharing text and stored files", async () => {
    const fixture = await seedDocument();
    const operationId = crypto.randomUUID();
    const newSourceDocumentId = crypto.randomUUID();
    const storedFileCountBefore = await fixture.db.select().from(storedFiles);

    const result = await splitSourceDocumentAction(fixture.ledger.id, {
      sourceDocumentId: fixture.document.id,
      expectedRevisionId: fixture.revisionId,
      operationId,
      newSourceDocumentId,
      ledgerEntryIds: [fixture.entryIds[2]!, fixture.entryIds[0]!],
      entryDate: "2026-08-16",
    });

    expect(result).toMatchObject({
      sourceDocumentActiveRevisionId: operationId,
      splitSourceDocumentId: newSourceDocumentId,
      movedEntryCount: 2,
      sourceDocument: { title: "Shared receipt", entryDate: "2026-08-01" },
      splitSourceDocument: {
        title: "Shared receipt",
        entryDate: "2026-08-16",
        type: "manual",
        status: "completed",
        text: "Full original evidence",
      },
    });
    expect(result.sourceDocument.ledgerEntries!.map((entry) => entry.itemName)).toEqual(["Item 2"]);
    expect(result.splitSourceDocument.ledgerEntries!.map((entry) => entry.itemName)).toEqual([
      "Item 1",
      "Item 3",
    ]);
    expect(result.splitSourceDocument.ledgerEntries!.map((entry) => entry.id)).not.toEqual(
      expect.arrayContaining([fixture.entryIds[0], fixture.entryIds[2]])
    );

    const [storedFileCountAfter, sourceFiles, splitFiles, activeEntries] = await Promise.all([
      fixture.db.select().from(storedFiles),
      fixture.db.select().from(revisionFiles).where(eq(revisionFiles.revisionId, operationId)),
      fixture.db
        .select()
        .from(revisionFiles)
        .where(eq(revisionFiles.revisionId, result.splitSourceDocumentActiveRevisionId)),
      fixture.db
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.ledgerId, fixture.ledger.id), isNull(ledgerEntries.deletedAt))),
    ]);
    expect(storedFileCountAfter).toHaveLength(storedFileCountBefore.length);
    expect(sourceFiles.map((file) => file.storedFileId)).toEqual(
      splitFiles.map((file) => file.storedFileId)
    );
    expect(activeEntries).toHaveLength(3);

    const replay = await splitSourceDocumentAction(fixture.ledger.id, {
      sourceDocumentId: fixture.document.id,
      expectedRevisionId: fixture.revisionId,
      operationId,
      newSourceDocumentId,
      ledgerEntryIds: [fixture.entryIds[2]!, fixture.entryIds[0]!],
      entryDate: "2026-08-16",
    });
    expect(replay).toEqual(result);

    await expect(
      splitSourceDocumentAction(fixture.ledger.id, {
        sourceDocumentId: fixture.document.id,
        expectedRevisionId: fixture.revisionId,
        operationId,
        newSourceDocumentId,
        ledgerEntryIds: [fixture.entryIds[1]!, fixture.entryIds[2]!],
        entryDate: "2026-08-16",
      })
    ).rejects.toThrow(/identifiers do not match/i);
  });

  it("rejects moving every entry without changing the active projection", async () => {
    const fixture = await seedDocument();
    await expect(
      splitSourceDocumentAction(fixture.ledger.id, {
        sourceDocumentId: fixture.document.id,
        expectedRevisionId: fixture.revisionId,
        operationId: crypto.randomUUID(),
        newSourceDocumentId: crypto.randomUUID(),
        ledgerEntryIds: fixture.entryIds,
        entryDate: "2026-08-16",
      })
    ).rejects.toThrow(/retain at least one/i);

    const document = await fixture.db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, fixture.document.id),
    });
    expect(document?.activeRevisionId).toBe(fixture.revisionId);
    await expect(
      fixture.db.query.sourceDocumentRevisions.findMany({
        where: eq(sourceDocumentRevisions.sourceDocumentId, fixture.document.id),
      })
    ).resolves.toHaveLength(1);
  });
});

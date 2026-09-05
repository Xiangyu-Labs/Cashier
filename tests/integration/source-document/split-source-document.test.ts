import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { splitSourceDocumentAction } from "@/modules/source-document/server-actions/split";
import { ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import { getTestDb } from "../../setup";
import { activateTestSourceDocumentProjection } from "../../helpers/schema-setup";
import { createLedgerData, createSourceDocumentData } from "../../helpers/factories";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

describe("splitSourceDocumentAction", () => {
  const userId = "00000000-0000-0000-0000-000000000000";
  beforeEach(() => {
    vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue({
      user: { id: userId, email: "split@example.com" },
      expires: new Date(Date.now() + 3_600_000).toISOString(),
    });
  });

  async function seed(entryCount = 3) {
    const db = getTestDb();
    const ledger = createLedgerData({ userId, mainCurrency: "USD" });
    const document = createSourceDocumentData(ledger.id, { status: "completed", type: "manual" });
    const ids = Array.from({ length: entryCount }, () => crypto.randomUUID());
    await db.insert(ledgers).values(ledger);
    await db.insert(sourceDocuments).values(document);
    await db.insert(ledgerEntries).values(
      ids.map((id, position) => ({
        id,
        ledgerId: ledger.id,
        sourceDocumentId: document.id,
        position,
        amount: `${position + 1}0.00`,
        currency: "USD",
        itemName: `Item ${position + 1}`,
        convertedAmount: `${position + 1}0.00`,
        exchangeRate: "1",
      }))
    );
    await activateTestSourceDocumentProjection(db, document.id);
    return { db, ledger, document, ids };
  }

  it("moves live rows without changing entry IDs and versions both documents correctly", async () => {
    const fixture = await seed();
    const movedIds = [fixture.ids[0]!, fixture.ids[2]!];
    const result = await splitSourceDocumentAction(fixture.ledger.id, {
      sourceDocumentId: fixture.document.id,
      expectedVersion: 1,
      ledgerEntryIds: movedIds,
      entryDate: "2026-08-16",
    });
    expect(result).toMatchObject({
      ok: true,
      version: 2,
      data: { splitVersion: 1, movedEntryCount: 2 },
    });
    if (!result.ok) throw new Error("Expected split success");
    const live = await fixture.db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.ledgerId, fixture.ledger.id), isNull(ledgerEntries.deletedAt)));
    expect(
      live
        .filter((entry) => entry.sourceDocumentId === result.data.splitSourceDocumentId)
        .map((entry) => entry.id)
        .sort()
    ).toEqual([...movedIds].sort());
    const source = await fixture.db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, fixture.document.id),
    });
    const split = await fixture.db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.data.splitSourceDocumentId),
    });
    expect(source?.stateVersion).toBe(2);
    expect(split?.stateVersion).toBe(1);
  });

  it("returns stale on lost-response retry", async () => {
    const fixture = await seed();
    const input = {
      sourceDocumentId: fixture.document.id,
      expectedVersion: 1,
      ledgerEntryIds: [fixture.ids[0]!],
      entryDate: "2026-08-16",
    };
    await expect(splitSourceDocumentAction(fixture.ledger.id, input)).resolves.toMatchObject({
      ok: true,
    });
    await expect(splitSourceDocumentAction(fixture.ledger.id, input)).resolves.toMatchObject({
      ok: false,
      reason: "stale",
      currentVersion: 2,
    });
  });

  it("moves a 100-entry batch with contiguous positions", async () => {
    const fixture = await seed(101);
    const movedIds = fixture.ids.slice(0, 100);
    const result = await splitSourceDocumentAction(fixture.ledger.id, {
      sourceDocumentId: fixture.document.id,
      expectedVersion: 1,
      ledgerEntryIds: movedIds,
      entryDate: "2026-08-16",
    });
    expect(result).toMatchObject({ ok: true, data: { movedEntryCount: 100 } });
    if (!result.ok) throw new Error("Expected split success");

    const live = await fixture.db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.ledgerId, fixture.ledger.id), isNull(ledgerEntries.deletedAt)));
    const splitEntries = live
      .filter((entry) => entry.sourceDocumentId === result.data.splitSourceDocumentId)
      .sort((left, right) => left.position - right.position);
    const retainedEntries = live.filter((entry) => entry.sourceDocumentId === fixture.document.id);
    expect(splitEntries.map((entry) => entry.id)).toEqual(movedIds);
    expect(splitEntries.map((entry) => entry.position)).toEqual(
      Array.from({ length: 100 }, (_, index) => index)
    );
    expect(retainedEntries).toHaveLength(1);
    expect(retainedEntries[0]?.position).toBe(0);
  });
});

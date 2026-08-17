import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getLedgerDelta as getLedgerDeltaUseCase } from "@/modules/source-document/application/queries/get-stream-refresh";
import { serverComposition } from "@/application/server-composition-root";
import { ledgerChangeBatches, ledgerSyncState, ledgers, sourceDocuments } from "@/persistence";
import { createTestSourceDocument, createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";

const getLedgerDelta = (request: Parameters<typeof getLedgerDeltaUseCase>[0]) =>
  getLedgerDeltaUseCase(request, {
    documents: serverComposition.sourceDocumentReads,
    ledgerReads: serverComposition.ledgerReads,
    changes: serverComposition.ledgerChanges,
  });

describe("ledger delta", () => {
  let ledgerId: string;

  beforeEach(async () => {
    ({ ledgerId } = await createTestUserWithLedger(
      getTestDb(),
      undefined,
      undefined,
      crypto.randomUUID()
    ));
  });

  async function version(): Promise<bigint> {
    const state = await getTestDb().query.ledgerSyncState.findFirst({
      where: eq(ledgerSyncState.ledgerId, ledgerId),
    });
    return state?.version ?? BigInt(0);
  }

  it("returns a change signal for document creation and deletion", async () => {
    const documentId = await createTestSourceDocument(getTestDb(), ledgerId, {
      title: "Delta receipt",
    });
    const createdVersion = await version();

    const created = await getLedgerDelta({ ledgerId, afterVersion: "0" });
    expect(created).toMatchObject({
      protocolVersion: 3,
      resetRequired: false,
      toVersion: createdVersion.toString(),
      hasMore: false,
      changed: true,
    });

    await getTestDb()
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, documentId));
    const removed = await getLedgerDelta({
      ledgerId,
      afterVersion: createdVersion.toString(),
    });
    expect(removed).toMatchObject({ protocolVersion: 3, changed: true });
  });

  it("returns settings and stats invalidations", async () => {
    await createTestSourceDocument(getTestDb(), ledgerId);
    const beforeSettings = await version();
    await getTestDb().update(ledgers).set({ aiLanguage: "en" }).where(eq(ledgers.id, ledgerId));

    const delta = await getLedgerDelta({
      ledgerId,
      afterVersion: beforeSettings.toString(),
    });
    expect(delta.invalidations).toMatchObject({ settings: true, stats: true });
  });

  it("does not publish changes from a rolled-back transaction", async () => {
    const before = await version();
    await expect(
      getTestDb().transaction(async (tx) => {
        await tx.insert(sourceDocuments).values({ ledgerId, title: "Rolled back" });
        throw new Error("rollback");
      })
    ).rejects.toThrow("rollback");

    expect(await version()).toBe(before);
    const delta = await getLedgerDelta({ ledgerId, afterVersion: before.toString() });
    expect(delta.changed).toBe(false);
  });

  it("requires reset when the retained log has a gap", async () => {
    await createTestSourceDocument(getTestDb(), ledgerId);
    await getTestDb().update(ledgers).set({ aiLanguage: "en" }).where(eq(ledgers.id, ledgerId));
    await getTestDb().update(ledgers).set({ aiLanguage: "fr" }).where(eq(ledgers.id, ledgerId));
    await getTestDb()
      .delete(ledgerChangeBatches)
      .where(eq(ledgerChangeBatches.version, BigInt(2)));

    const delta = await getLedgerDelta({ ledgerId, afterVersion: "0" });
    expect(delta.resetRequired).toBe(true);
    expect(delta.toVersion).toBe((await version()).toString());
  });

  it("requires reset after a main-currency recalculation", async () => {
    const before = await version();
    await getTestDb().update(ledgers).set({ mainCurrency: "USD" }).where(eq(ledgers.id, ledgerId));

    const delta = await getLedgerDelta({ ledgerId, afterVersion: before.toString() });
    expect(delta.resetRequired).toBe(true);
  });

  it("reads at most 100 versions and reports more work", async () => {
    await getTestDb()
      .insert(ledgerSyncState)
      .values({ ledgerId, version: BigInt(101) });
    await getTestDb()
      .insert(ledgerChangeBatches)
      .values(
        Array.from({ length: 101 }, (_, index) => ({
          ledgerId,
          version: BigInt(index + 1),
          transactionId: BigInt(index + 1),
        }))
      );

    const delta = await getLedgerDelta({ ledgerId, afterVersion: "0" });
    expect(delta).toMatchObject({
      resetRequired: false,
      toVersion: "100",
      hasMore: true,
    });
  });
});

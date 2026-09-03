import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getStreamRefresh } from "@/modules/source-document/application/queries/get-stream-refresh";
import { serverComposition } from "@/application/server-composition-root";
import {
  ledgerChangeBatches,
  ledgerSyncState,
  ledgers,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { createTestSourceDocument, createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";

describe("ledger refresh", () => {
  let ledgerId: string;

  beforeEach(async () => {
    ({ ledgerId } = await createTestUserWithLedger(
      getTestDb(),
      undefined,
      undefined,
      crypto.randomUUID()
    ));
  });

  const refresh = (afterVersion: string) =>
    getStreamRefresh(ledgerId, { afterVersion }, serverComposition.ledgerChanges);

  async function version(): Promise<bigint> {
    const state = await getTestDb().query.ledgerSyncState.findFirst({
      where: eq(ledgerSyncState.ledgerId, ledgerId),
    });
    return state?.version ?? BigInt(0);
  }

  it("returns no change at the current version", async () => {
    const currentVersion = await version();
    await expect(refresh(currentVersion.toString())).resolves.toEqual({
      version: currentVersion.toString(),
      changed: false,
      hasTransitionalWork: false,
      invalidations: { categories: false, settings: false, stats: false },
    });
  });

  it("summarizes continuous document and settings changes", async () => {
    await createTestSourceDocument(getTestDb(), ledgerId, { title: "Refresh receipt" });
    const afterDocument = await version();
    await getTestDb().update(ledgers).set({ aiLanguage: "en" }).where(eq(ledgers.id, ledgerId));

    expect(await refresh(afterDocument.toString())).toEqual({
      version: (await version()).toString(),
      changed: true,
      hasTransitionalWork: false,
      invalidations: { categories: false, settings: true, stats: true },
    });
  });

  it("invalidates everything when the retained log has a gap", async () => {
    await createTestSourceDocument(getTestDb(), ledgerId);
    await getTestDb().update(ledgers).set({ aiLanguage: "en" }).where(eq(ledgers.id, ledgerId));
    await getTestDb().update(ledgers).set({ aiLanguage: "fr" }).where(eq(ledgers.id, ledgerId));
    await getTestDb()
      .delete(ledgerChangeBatches)
      .where(
        and(eq(ledgerChangeBatches.ledgerId, ledgerId), eq(ledgerChangeBatches.version, BigInt(1)))
      );

    expect(await refresh("0")).toMatchObject({
      changed: true,
      invalidations: { categories: true, settings: true, stats: true },
    });
  });

  it("invalidates everything after a main-currency reset", async () => {
    const before = await version();
    await getTestDb().update(ledgers).set({ mainCurrency: "USD" }).where(eq(ledgers.id, ledgerId));

    expect(await refresh(before.toString())).toMatchObject({
      changed: true,
      invalidations: { categories: true, settings: true, stats: true },
    });
  });

  it.each(["invalid", "9223372036854775808"])(
    "invalidates everything for invalid version %s",
    async (afterVersion) => {
      expect(await refresh(afterVersion)).toMatchObject({
        changed: true,
        invalidations: { categories: true, settings: true, stats: true },
      });
    }
  );

  it("invalidates everything for a future version", async () => {
    expect(await refresh("1")).toMatchObject({
      version: "0",
      changed: true,
      invalidations: { categories: true, settings: true, stats: true },
    });
  });

  it("reports processing work until the document reaches a terminal state", async () => {
    const documentId = await createTestSourceDocument(getTestDb(), ledgerId, {
      status: "processing",
    });
    const processing = await refresh("0");
    expect(processing.hasTransitionalWork).toBe(true);

    const document = await getTestDb().query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, documentId),
      columns: { pendingRevisionId: true },
    });
    const revisionId = document?.pendingRevisionId;
    if (revisionId == null) throw new Error("Expected processing revision");
    await getTestDb()
      .update(sourceDocumentRevisions)
      .set({ outcome: "completed", finalizedAt: new Date() })
      .where(eq(sourceDocumentRevisions.id, revisionId));
    await getTestDb()
      .update(sourceDocuments)
      .set({ activeRevisionId: revisionId, pendingRevisionId: null })
      .where(eq(sourceDocuments.id, documentId));
    expect((await refresh(processing.version)).hasTransitionalWork).toBe(false);
  });
});

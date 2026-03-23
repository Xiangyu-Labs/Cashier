import { beforeEach, describe, expect, it } from "vitest";
import { getPendingSourceDocumentsQuery } from "@/modules/source-document/application/queries/get-pending-source-documents";
import { sourceDocuments } from "@/persistence";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";

describe("getPendingSourceDocumentsQuery", () => {
  let ledgerId = "";

  beforeEach(async () => {
    const db = getTestDb();
    const setup = await createTestUserWithLedger(db);
    ledgerId = setup.ledgerId;
  });

  it("groups queued, processing, anomaly, and failed documents", async () => {
    const db = getTestDb();

    await db.insert(sourceDocuments).values([
      {
        ledgerId,
        text: "queued doc",
        status: "queued",
        imageUrls: [],
        entryDate: "2026-03-23",
      },
      {
        ledgerId,
        text: "processing doc",
        status: "processing",
        imageUrls: [],
        entryDate: "2026-03-22",
      },
      {
        ledgerId,
        text: "anomaly doc",
        status: "anomaly",
        imageUrls: [],
        entryDate: "2026-03-21",
      },
      {
        ledgerId,
        text: "failed doc",
        status: "failed",
        imageUrls: [],
        entryDate: "2026-03-20",
      },
      {
        ledgerId,
        text: "completed doc",
        status: "completed",
        imageUrls: [],
        entryDate: "2026-03-19",
      },
    ]);

    const result = await getPendingSourceDocumentsQuery(ledgerId);

    expect(result.groups.queued).toHaveLength(1);
    expect(result.groups.processing).toHaveLength(1);
    expect(result.groups.anomaly).toHaveLength(1);
    expect(result.groups.failed).toHaveLength(1);
    expect(result.stats.total).toBe(4);
  });
});

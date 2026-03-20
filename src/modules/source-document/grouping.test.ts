import { describe, expect, it } from "vitest";
import {
  calculatePendingTotal,
  calculateSourceDocumentStats,
  groupPendingSourceDocuments,
  groupSourceDocumentsByStatus,
} from "./grouping";

describe("grouping helpers", () => {
  const docs = [
    { id: "queued-1", status: "queued", ledgerEntries: [{ id: "entry-1" }] },
    { id: "processing-1", status: "processing" },
    { id: "anomaly-1", status: "anomaly" },
    { id: "failed-1", status: "failed" },
    { id: "completed-1", status: "completed" },
  ] as const;

  it("groups by status and preserves ledgerEntries references", () => {
    const groups = groupSourceDocumentsByStatus([...docs]);

    expect(groups.queued).toHaveLength(1);
    expect(groups.queued[0]?.sourceDocument.id).toBe("queued-1");
    expect(groups.queued[0]?.ledgerEntries).toEqual([{ id: "entry-1" }]);
    expect(groups.completed).toHaveLength(1);
  });

  it("excludes completed docs from pending groups and computes counts", () => {
    const pendingGroups = groupPendingSourceDocuments([...docs]);

    expect(pendingGroups.queued).toHaveLength(1);
    expect(pendingGroups.processing).toHaveLength(1);
    expect(pendingGroups.anomaly).toHaveLength(1);
    expect(pendingGroups.failed).toHaveLength(1);
    expect(calculateSourceDocumentStats(pendingGroups)).toEqual({
      queuedCount: 1,
      processingCount: 1,
      anomalyCount: 1,
      failedCount: 1,
    });
    expect(calculatePendingTotal(pendingGroups)).toBe(4);
  });
});

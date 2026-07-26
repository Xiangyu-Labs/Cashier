import { describe, expect, it } from "vitest";
import {
  calculatePendingTotal,
  calculateSourceDocumentStats,
  groupPendingSourceDocuments,
  groupSourceDocumentsByStatus,
} from "@/modules/source-document/grouping";

describe("grouping helpers", () => {
  const docs = [
    { id: "processing-1", status: "processing", ledgerEntries: [{ id: "entry-1" }] },
    { id: "anomaly-1", status: "anomaly" },
    { id: "failed-1", status: "failed" },
    { id: "completed-1", status: "completed" },
    { id: "deleted-1", status: "deleted" },
  ] as const;

  it("groups by status and preserves ledgerEntries references", () => {
    const groups = groupSourceDocumentsByStatus([...docs]);

    expect(groups.processing).toHaveLength(1);
    expect(groups.processing[0]?.sourceDocument.id).toBe("processing-1");
    expect(groups.processing[0]?.ledgerEntries).toEqual([{ id: "entry-1" }]);
    expect(groups.completed).toHaveLength(1);
    expect(groups.completed[0]?.ledgerEntries).toEqual([]);
    expect(
      groups.processing.concat(groups.anomaly, groups.failed, groups.completed)
    ).not.toContainEqual(
      expect.objectContaining({ sourceDocument: expect.objectContaining({ id: "deleted-1" }) })
    );
  });

  it("excludes completed docs from pending groups and computes counts", () => {
    const pendingGroups = groupPendingSourceDocuments([...docs]);

    expect(pendingGroups.processing).toHaveLength(1);
    expect(pendingGroups.anomaly).toHaveLength(1);
    expect(pendingGroups.failed).toHaveLength(1);
    expect(calculateSourceDocumentStats(pendingGroups)).toEqual({
      processingCount: 1,
      anomalyCount: 1,
      failedCount: 1,
    });
    expect(calculatePendingTotal(pendingGroups)).toBe(3);
  });

  it("groups candidate_pending documents into their own group, not failed", () => {
    const groups = groupSourceDocumentsByStatus([
      { id: "processing-1", status: "processing" as const, ledgerEntries: [] },
      { id: "failed-1", status: "failed" as const },
      { id: "candidate-1", status: "candidate_pending" as const, ledgerEntries: [] },
    ]);

    expect(groups.failed).toHaveLength(1); // only failed-1
    expect(groups.candidate_pending).toHaveLength(1); // candidate-1
    expect(groups.candidate_pending[0]?.sourceDocument.id).toBe("candidate-1");
    expect(groups.failed.some((g) => g.sourceDocument.id === "candidate-1")).toBe(false);
  });
});

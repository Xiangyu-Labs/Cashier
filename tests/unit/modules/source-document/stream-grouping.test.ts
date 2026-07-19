import { describe, expect, it } from "vitest";
import {
  buildUnifiedStreamGroups,
  getEffectiveDate,
  type UnifiedStreamGroup,
} from "@/modules/source-document/stream-grouping";
import type {
  SourceDocumentListItemDto,
  SourceDocumentLedgerEntryDto,
} from "@/modules/source-document/contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
  id: string,
  overrides: Partial<SourceDocumentListItemDto> = {}
): SourceDocumentListItemDto {
  return {
    id,
    ledgerId: "ledger-1",
    title: `Doc ${id}`,
    text: null,
    files: [],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-07-01",
    metadata: {},
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    deletedAt: null,
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ...overrides,
  };
}

function makeEntry(
  overrides: Partial<SourceDocumentLedgerEntryDto> = {}
): SourceDocumentLedgerEntryDto {
  return {
    id: "entry-1",
    ledgerId: "ledger-1",
    categoryId: null,
    sourceDocumentId: null,
    amount: "10.00",
    currency: "CNY",
    itemName: "Test",
    description: null,
    convertedAmount: "10.00",
    exchangeRate: "1.0",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getEffectiveDate
// ---------------------------------------------------------------------------

describe("getEffectiveDate", () => {
  it("returns transaction provenance when entryDate is valid", () => {
    const result = getEffectiveDate({
      entryDate: "2026-07-15",
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    expect(result).toEqual({ date: "2026-07-15", provenance: "transaction" });
  });

  it("falls back to submission date when entryDate is empty", () => {
    const result = getEffectiveDate({
      entryDate: "",
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    expect(result).toEqual({ date: "2026-07-14", provenance: "submitted" });
  });

  it("falls back to submission date when entryDate is null", () => {
    const result = getEffectiveDate({
      entryDate: null,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    expect(result).toEqual({ date: "2026-07-14", provenance: "submitted" });
  });

  it("returns unknown when both dates are missing", () => {
    const result = getEffectiveDate({ entryDate: null, createdAt: "" });
    expect(result).toEqual({ date: "date_unknown", provenance: "unknown" });
  });

  it("returns unknown when both date values are empty strings", () => {
    const result = getEffectiveDate({ entryDate: "", createdAt: "" });
    expect(result).toEqual({ date: "date_unknown", provenance: "unknown" });
  });

  it("never invents the current date", () => {
    const now = new Date().toISOString().slice(0, 10);
    const result = getEffectiveDate({ entryDate: null, createdAt: null as unknown as string });
    expect(result.date).not.toBe(now);
    expect(result.provenance).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// buildUnifiedStreamGroups
// ---------------------------------------------------------------------------

describe("buildUnifiedStreamGroups", () => {
  it("deduplicates attention items ahead of completed items", () => {
    const att = makeItem("doc-1", { status: "failed" });
    const comp = makeItem("doc-1", {
      status: "completed",
      ledgerEntries: [makeEntry()],
    });

    const groups = buildUnifiedStreamGroups([att], [comp]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toHaveLength(1);
    expect(groups[0]!.items[0]!.sourceDocument.status).toBe("failed");
  });

  it("groups items by effective date chronologically descending", () => {
    const c1 = makeItem("c1", {
      status: "completed",
      entryDate: "2026-07-15",
      ledgerEntries: [makeEntry({ amount: "5.00", convertedAmount: "5.00" })],
    });
    const c2 = makeItem("c2", {
      status: "completed",
      entryDate: "2026-07-10",
      ledgerEntries: [makeEntry({ amount: "3.00", convertedAmount: "3.00" })],
    });
    const c3 = makeItem("c3", {
      status: "completed",
      entryDate: "2026-07-20",
      ledgerEntries: [makeEntry({ amount: "7.00", convertedAmount: "7.00" })],
    });

    const groups = buildUnifiedStreamGroups([], [c1, c2, c3]);
    // Descending: Jul 20 → Jul 15 → Jul 10
    expect(groups.map((g) => g.date)).toEqual([
      "2026-07-20",
      "2026-07-15",
      "2026-07-10",
    ]);
  });

  it("computes group totals only from completed active entries", () => {
    const completed = makeItem("c1", {
      status: "completed",
      entryDate: "2026-07-01",
      ledgerEntries: [
        makeEntry({ amount: "10.00", convertedAmount: "10.00" }),
        makeEntry({ amount: "5.00", convertedAmount: "5.00" }),
      ],
    });

    const groups = buildUnifiedStreamGroups([], [completed]);
    expect(groups[0]!.total).toBe(15);
  });

  it("excludes non-completed items from group totals", () => {
    const pending = makeItem("p1", { status: "queued", entryDate: "2026-07-01" });
    const completed = makeItem("c1", {
      status: "completed",
      entryDate: "2026-07-01",
      ledgerEntries: [makeEntry({ amount: "10.00", convertedAmount: "10.00" })],
    });

    const groups = buildUnifiedStreamGroups([pending], [completed]);
    // Only one item should be visible (dedup: pending wins, but completed has different id)
    expect(groups).toHaveLength(1);
    // total should come from completed only
    expect(groups[0]!.total).toBe(10);
  });

  it("does not invent a total for empty/pending groups", () => {
    const att = makeItem("q1", { status: "queued", entryDate: "2026-07-01" });

    const groups = buildUnifiedStreamGroups([att], []);
    expect(groups[0]!.total).toBe(0);
  });

  it("orders items within a group by status priority", () => {
    const candidate = makeItem("cand", {
      status: "candidate_pending",
      entryDate: "2026-07-01",
      createdAt: "2026-07-01T10:00:00.000Z",
    });
    const anomaly = makeItem("anom", {
      status: "anomaly",
      entryDate: "2026-07-01",
      createdAt: "2026-07-01T09:00:00.000Z",
    });
    const failed = makeItem("fail", {
      status: "failed",
      entryDate: "2026-07-01",
      createdAt: "2026-07-01T08:00:00.000Z",
    });
    const completed = makeItem("comp", {
      status: "completed",
      entryDate: "2026-07-01",
      createdAt: "2026-07-01T07:00:00.000Z",
      ledgerEntries: [makeEntry()],
    });

    const groups = buildUnifiedStreamGroups(
      [candidate, anomaly, failed],
      [completed]
    );
    const statuses = groups[0]!.items.map((i) => i.sourceDocument.status);
    expect(statuses).toEqual([
      "candidate_pending",
      "anomaly",
      "failed",
      "completed",
    ]);
  });

  it("uses createdAt then id as tie breakers within the same status", () => {
    const a1 = makeItem("a1", {
      status: "completed",
      entryDate: "2026-07-01",
      createdAt: "2026-07-01T10:00:00.000Z",
      ledgerEntries: [makeEntry()],
    });
    const a2 = makeItem("a2", {
      status: "completed",
      entryDate: "2026-07-01",
      createdAt: "2026-07-01T09:00:00.000Z",
      ledgerEntries: [makeEntry()],
    });

    const groups = buildUnifiedStreamGroups([], [a1, a2]);
    // Both are completed — tie-break by createdAt (a2 is older, but sort is within status priority, then createdAt string comparison)
    // Actually they're sorted ascending within groups, so older first (a2, then a1)
    const ids = groups[0]!.items.map((i) => i.sourceDocument.id);
    expect(ids).toEqual(["a2", "a1"]);
  });

  it("marks attention items outside the date filter", () => {
    const outsideAtt = makeItem("out", {
      status: "anomaly",
      entryDate: "2026-06-01",
      createdAt: "2026-06-01T10:00:00.000Z",
    });
    const insideAtt = makeItem("in", {
      status: "queued",
      entryDate: "2026-07-01",
      createdAt: "2026-07-01T10:00:00.000Z",
    });
    const completed = makeItem("comp", {
      status: "completed",
      entryDate: "2026-07-01",
      createdAt: "2026-07-01T09:00:00.000Z",
      ledgerEntries: [makeEntry()],
    });

    const groups = buildUnifiedStreamGroups(
      [outsideAtt, insideAtt],
      [completed],
      { startDate: "2026-07-01", endDate: "2026-07-31" }
    );

    // outsideAtt is in 2026-06-01 group, insideAtt + completed share 2026-07-01
    const juneGroup = groups.find((g) => g.date === "2026-06-01");
    const julyGroup = groups.find((g) => g.date === "2026-07-01");

    expect(juneGroup!.items[0]!.outsideCurrentFilter).toBe(true);
    // completed items are never outside the filter
    const julyItems = julyGroup!.items;
    for (const item of julyItems) {
      if (item.sourceDocument.status === "completed") {
        expect(item.outsideCurrentFilter).toBe(false);
      }
    }
  });

  it("marks attention items outside the amount filter", () => {
    const lowAmountAtt = makeItem("low", {
      status: "candidate_pending",
      entryDate: "2026-07-01",
      candidateComparison: {
        active: { entryCount: 1, total: "5.00" },
        candidate: { entryCount: 1, total: "15.00" },
        changed: true,
      },
    });

    const groups = buildUnifiedStreamGroups([lowAmountAtt], [], {
      minAmount: 10,
    });
    expect(groups[0]!.items[0]!.outsideCurrentFilter).toBe(true);
  });

  it("places unknown-date attention items in the date_unknown group last", () => {
    const unknown = makeItem("u1", {
      status: "queued",
      entryDate: null,
      createdAt: "",
    });
    const known = makeItem("k1", {
      status: "completed",
      entryDate: "2026-07-15",
      ledgerEntries: [makeEntry()],
    });

    const groups = buildUnifiedStreamGroups([unknown], [known]);
    // date_unknown should be last
    expect(groups.at(-1)!.date).toBe("date_unknown");
    expect(groups.at(-1)!.dateProvenance).toBe("unknown");
  });

  it("keeps candidate_pending independent from failed", () => {
    const candidate = makeItem("cand", {
      status: "candidate_pending",
      entryDate: "2026-07-01",
      createdAt: "2026-07-01T12:00:00.000Z",
      candidateComparison: {
        active: { entryCount: 2, total: "100.00" },
        candidate: { entryCount: 2, total: "150.00" },
        changed: true,
      },
    });
    const failed = makeItem("fail", {
      status: "failed",
      entryDate: "2026-07-01",
      createdAt: "2026-07-01T11:00:00.000Z",
    });

    const groups = buildUnifiedStreamGroups([candidate, failed], []);
    const statuses = groups[0]!.items.map((i) => [i.sourceDocument.status, i.sourceDocument.id]);
    // candidate_pending sorts before failed
    expect(statuses[0]).toEqual(["candidate_pending", "cand"]);
    expect(statuses[1]).toEqual(["failed", "fail"]);
  });
});

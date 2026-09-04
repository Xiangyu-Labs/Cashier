import { act, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import type { UnifiedStreamGroup } from "@/modules/source-document/stream-grouping";
import { computeStreamListMotionDiff } from "@/modules/workspace/ui/stream-list-motion";
import { LedgerEntriesUnifiedGroups } from "@/modules/workspace/ui/UnifiedStreamGroups";

vi.mock("@/modules/source-document/ui/SourceDocumentCard", () => ({
  SourceDocumentCard: ({
    sourceDocument,
    errorCode,
  }: {
    sourceDocument: { id: string };
    errorCode?: string | null;
  }) => (
    <div data-testid={`card-${sourceDocument.id}`} data-error-code={errorCode ?? ""}>
      {sourceDocument.id}
    </div>
  ),
}));

function card(
  id: string,
  overrides: Partial<SourceDocumentListItemDto> = {}
): SourceDocumentListItemDto {
  return {
    id,
    version: 1,
    ledgerId: "ledger-1",
    title: `Doc ${id}`,
    text: null,
    status: "processing",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-07-15",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    hasImages: false,
    supportedActions: [],
    canEdit: false,
    errorCode: null,
    ...overrides,
  };
}

function groupsOf(ids: string[]): UnifiedStreamGroup[] {
  return [
    {
      date: "2026-07-15",
      dateProvenance: "transaction",
      total: "0",
      unconvertedCount: 0,
      currencyTotals: {},
      items: ids.map((id) => ({
        sourceDocument: card(id),
        ledgerEntries: [],
        effectiveDate: "2026-07-15",
        dateProvenance: "transaction",
      })),
    },
  ];
}

function renderGroups(ids: string[]) {
  return render(
    <LedgerEntriesUnifiedGroups
      streamGroups={groupsOf(ids)}
      mainCurrency="CNY"
      onViewSourceDetail={vi.fn()}
      onDeleteSourceConfirm={vi.fn()}
      isSelectionMode={false}
      selectedIds={[]}
      onToggleSelection={vi.fn()}
      noRecordsText="No records"
      getItemProps={() => ({})}
    />
  );
}

function rerenderGroups(rerender: (ui: ReactElement) => void, ids: string[]) {
  rerender(
    <LedgerEntriesUnifiedGroups
      streamGroups={groupsOf(ids)}
      mainCurrency="CNY"
      onViewSourceDetail={vi.fn()}
      onDeleteSourceConfirm={vi.fn()}
      isSelectionMode={false}
      selectedIds={[]}
      onToggleSelection={vi.fn()}
      noRecordsText="No records"
      getItemProps={() => ({})}
    />
  );
}

describe("stream list motion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes enter, exit, move, and update diffs by stable ID", () => {
    const item = (id: string, date: string, revision: string) => ({ id, date, revision });
    const diff = computeStreamListMotionDiff(
      [item("a", "2026-07-15", "v1"), item("b", "2026-07-15", "v1"), item("c", "2026-07-14", "v1")],
      [item("b", "2026-07-15", "v2"), item("a", "2026-07-15", "v1"), item("d", "2026-07-13", "v1")]
    );

    expect([...diff.entering]).toEqual(["d"]);
    expect(diff.exiting).toEqual([{ id: "c", date: "2026-07-14", index: 2 }]);
    expect([...diff.moving].sort()).toEqual(["a", "b"]);
    expect([...diff.updated]).toEqual(["b"]);
  });

  it("passes the source-document failure code to the card", () => {
    const groups = groupsOf(["doc-1"]);
    groups[0]!.items[0]!.sourceDocument = card("doc-1", {
      status: "failed",
      errorCode: "processing_timeout",
    });

    render(
      <LedgerEntriesUnifiedGroups
        streamGroups={groups}
        mainCurrency="CNY"
        onViewSourceDetail={vi.fn()}
        onDeleteSourceConfirm={vi.fn()}
        isSelectionMode={false}
        selectedIds={[]}
        onToggleSelection={vi.fn()}
        noRecordsText="No records"
        getItemProps={() => ({})}
      />
    );

    expect(screen.getByTestId("card-doc-1")).toHaveAttribute(
      "data-error-code",
      "processing_timeout"
    );
  });

  it("fades new cards in and cleans up after the entrance window", () => {
    const { rerender } = renderGroups(["doc-1"]);
    rerenderGroups(rerender, ["doc-1", "doc-2"]);

    const entering = document.querySelector('[data-stream-card-id="doc-2"]');
    expect(entering).not.toBeNull();
    expect(entering).toHaveClass("stream-card-enter");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.querySelector('[data-stream-card-id="doc-2"]')).not.toHaveClass(
      "stream-card-enter"
    );
  });

  it("keeps a brief exit copy for removed cards and removes it after the exit window", () => {
    const { rerender } = renderGroups(["doc-1", "doc-2"]);
    rerenderGroups(rerender, ["doc-1"]);

    expect(document.querySelector('[data-stream-exit-card="doc-2"]')).not.toBeNull();
    expect(screen.getByTestId("card-doc-1")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.querySelector('[data-stream-exit-card="doc-2"]')).toBeNull();
  });

  it("keeps the exit copy when the first card is removed", () => {
    const { rerender } = renderGroups(["doc-1", "doc-2"]);

    expect(() => rerenderGroups(rerender, ["doc-2"])).not.toThrow();

    expect(document.querySelector('[data-stream-exit-card="doc-1"]')).not.toBeNull();
    expect(document.querySelector('[data-stream-exit-card="doc-2"]')).toBeNull();
    expect(screen.getByTestId("card-doc-2")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.querySelector('[data-stream-exit-card="doc-1"]')).toBeNull();
  });

  it("places the exit copy between the remaining cards when a middle card is removed", () => {
    const { rerender } = renderGroups(["doc-1", "doc-2", "doc-3"]);

    expect(() => rerenderGroups(rerender, ["doc-1", "doc-3"])).not.toThrow();

    const exitCards = document.querySelectorAll("[data-stream-exit-card]");
    expect(exitCards).toHaveLength(1);
    expect(exitCards[0]).toHaveAttribute("data-stream-exit-card", "doc-2");

    const cardBefore = screen.getByTestId("card-doc-1");
    const cardAfter = screen.getByTestId("card-doc-3");
    const exit = exitCards[0] as HTMLElement;
    expect(
      cardBefore.compareDocumentPosition(exit) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(exit.compareDocumentPosition(cardAfter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders each exit placeholder exactly once when consecutive leading cards are removed", () => {
    const { rerender } = renderGroups(["doc-1", "doc-2", "doc-3"]);

    expect(() => rerenderGroups(rerender, ["doc-3"])).not.toThrow();

    const exitCards = document.querySelectorAll("[data-stream-exit-card]");
    expect(exitCards).toHaveLength(2);
    expect([...exitCards].map((node) => node.getAttribute("data-stream-exit-card"))).toEqual([
      "doc-1",
      "doc-2",
    ]);
    expect(screen.getByTestId("card-doc-3")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.querySelectorAll("[data-stream-exit-card]")).toHaveLength(0);
  });

  it("applies a FLIP transform on reorder and clears it after the animation", () => {
    const rects = new Map<string, number>();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      const id = this.getAttribute("data-stream-card-id");
      const top = id != null ? (rects.get(id) ?? 0) : 0;
      return {
        top,
        left: 0,
        right: 300,
        bottom: top + 68,
        width: 300,
        height: 68,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    });

    rects.set("doc-1", 0);
    rects.set("doc-2", 100);
    const { rerender } = renderGroups(["doc-1", "doc-2"]);

    rects.set("doc-1", 100);
    rects.set("doc-2", 0);
    rerenderGroups(rerender, ["doc-2", "doc-1"]);

    const moved = document.querySelector('[data-stream-card-id="doc-1"]') as HTMLElement;
    expect(moved.style.transform).toContain("translate(0px, -100px)");

    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(moved.style.transform).toBe("");
    expect(moved.style.transition).toContain("transform");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(moved.style.transform).toBe("");
  });

  it("skips all animation states under reduced motion", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const { rerender } = renderGroups(["doc-1"]);
    rerenderGroups(rerender, ["doc-1", "doc-2"]);

    expect(document.querySelector('[data-stream-card-id="doc-2"]')).not.toHaveClass(
      "stream-card-enter"
    );

    rerenderGroups(rerender, ["doc-1"]);
    expect(document.querySelector('[data-stream-exit-card="doc-2"]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId("card-doc-1")).toBeInTheDocument();
  });
});

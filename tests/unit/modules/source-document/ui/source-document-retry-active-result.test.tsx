import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceDocumentCardStatePanel } from "@/modules/source-document/ui/SourceDocumentCardStatePanel";

describe("SourceDocumentCardStatePanel activeResultSummary", () => {
  it("shows retention notice for anomaly with active summary", () => {
    render(
      <SourceDocumentCardStatePanel
        status="anomaly"
        activeResultSummary={{ entryCount: 3, total: "150.00" }}
        isMutationPending={false}
      />
    );

    const expectedNotice = "当前结果（3 笔 · 150.00）仍有效，待重试处理。";
    expect(screen.getByText(expectedNotice)).toBeInTheDocument();
  });

  it("shows retention notice for failed with active summary", () => {
    render(
      <SourceDocumentCardStatePanel
        status="failed"
        activeResultSummary={{ entryCount: 1, total: "25.00" }}
        isMutationPending={false}
      />
    );

    const expectedNotice = "当前结果（1 笔 · 25.00）仍有效，待重试处理。";
    expect(screen.getByText(expectedNotice)).toBeInTheDocument();
  });

  it("does not show retention notice for anomaly without active summary", () => {
    render(
      <SourceDocumentCardStatePanel
        status="anomaly"
        isMutationPending={false}
      />
    );

    // The anomaly message should still be present
    expect(screen.getByText("需要手动修正")).toBeInTheDocument();
    // But the retention notice should not appear
    expect(screen.queryByText(/当前结果/)).not.toBeInTheDocument();
  });

  it("does not show retention notice for failed without active summary (first-parse failure)", () => {
    render(
      <SourceDocumentCardStatePanel
        status="failed"
        isMutationPending={false}
      />
    );

    // The failed message should still be present
    expect(screen.getByText("处理失败")).toBeInTheDocument();
    // But the retention notice should not appear
    expect(screen.queryByText(/当前结果/)).not.toBeInTheDocument();
  });

  it("does not show retention notice for candidate_pending even with active summary", () => {
    render(
      <SourceDocumentCardStatePanel
        status="candidate_pending"
        activeResultSummary={{ entryCount: 3, total: "150.00" }}
        candidateComparison={null}
        isMutationPending={false}
      />
    );

    // Candidate pending should not show the retention notice
    expect(screen.queryByText(/当前结果/)).not.toBeInTheDocument();
  });

  it("shows retention notice exactly once for anomaly with summary", () => {
    render(
      <SourceDocumentCardStatePanel
        status="anomaly"
        activeResultSummary={{ entryCount: 2, total: "99.99" }}
        isMutationPending={false}
      />
    );

    const notices = screen.getAllByText(/当前结果/);
    expect(notices).toHaveLength(1);
  });

  it("shows retention notice exactly once for failed with summary", () => {
    render(
      <SourceDocumentCardStatePanel
        status="failed"
        activeResultSummary={{ entryCount: 2, total: "99.99" }}
        isMutationPending={false}
      />
    );

    const notices = screen.getAllByText(/当前结果/);
    expect(notices).toHaveLength(1);
  });
});

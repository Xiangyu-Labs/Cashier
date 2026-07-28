import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui/SourceDocumentCard";

vi.mock("@/modules/source-document/hooks/useSourceDocumentRecoveryMutations", () => ({
  useSourceDocumentRecoveryMutations: () => ({
    retry: vi.fn(),
    cancelProcessing: vi.fn(),
    abandonCandidate: vi.fn(),
    isRetrying: false,
    isCancelling: false,
    isAbandoning: false,
  }),
}));

const sourceDocument: SourceDocument = {
  id: "doc-1",
  ledgerId: "ledger-1",
  title: "Receipt",
  text: "Lunch",
  files: [],
  status: "completed",
  type: "ai_parsed",
  anomalyReason: null,
  entryDate: "2026-07-28",
  metadata: {},
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
  deletedAt: null,
  hasImages: false,
  supportedActions: ["retry", "edit_retry", "delete"],
  errorCode: null,
  pendingRevisionId: null,
};

describe("SourceDocumentCard interactions", () => {
  it("opens details from the card surface and only once from the header button", () => {
    const onViewDetails = vi.fn();
    render(
      <SourceDocumentCard
        sourceDocument={sourceDocument}
        ledgerEntries={[]}
        status="completed"
        onViewDetails={onViewDetails}
      />
    );

    fireEvent.click(screen.getByTestId("source-document-card-root"));
    expect(onViewDetails).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /receipt/i }));
    expect(onViewDetails).toHaveBeenCalledTimes(2);
  });

  it("does not open details when the expand control is used", () => {
    const onViewDetails = vi.fn();
    render(
      <SourceDocumentCard
        sourceDocument={sourceDocument}
        ledgerEntries={[]}
        status="completed"
        onViewDetails={onViewDetails}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /展开|expand/i }));
    expect(onViewDetails).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

const { documentState } = vi.hoisted(() => ({ documentState: { status: "candidate_pending" } }));
vi.mock("@/modules/source-document/hooks/useSourceDocumentDetailData", () => ({
  useSourceDocumentDetailData: () => ({
    sourceDocument: { id: "doc-1", version: 7, status: documentState.status, duplicateReview: {} },
    currentLedgerEntries: [],
    ledgerId: "ledger-1",
    isLoading: false,
    isLoadingImages: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/modules/source-document/hooks/useSourceDocumentDetailMutations", () => ({
  useSourceDocumentDetailMutations: () => ({}),
}));
vi.mock("@/modules/source-document/hooks/useSourceDocumentRecoveryMutations", () => ({
  useSourceDocumentRecoveryMutations: () => ({}),
}));
type ReviewProps = { open: boolean; onBack?: () => void; onExitComplete?: () => void };
vi.mock("@/modules/source-document/ui/SourceDocumentCandidateReviewDialog", () => ({
  SourceDocumentCandidateReviewDialog: ({ open, onBack, onExitComplete }: ReviewProps) => (
    <div data-testid="candidate" data-open={open}>
      <button onClick={onBack}>back</button>
      <button onClick={onExitComplete}>exit</button>
    </div>
  ),
}));
vi.mock("@/modules/source-document/ui/SourceDocumentDuplicateReviewDialog", () => ({
  SourceDocumentDuplicateReviewDialog: ({ open, onBack, onExitComplete }: ReviewProps) => (
    <div data-testid="duplicate" data-open={open}>
      <button onClick={onBack}>back</button>
      <button onClick={onExitComplete}>exit</button>
    </div>
  ),
}));
vi.mock("@/modules/source-document/ui/SourceDocumentDetailModal", () => ({
  SourceDocumentDetailModal: () => <div data-testid="detail" />,
}));

import { SourceDocumentDetailWrapper } from "@/modules/source-document/ui/SourceDocumentDetailWrapper";

describe("SourceDocumentDetailWrapper review navigation", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["candidate", "duplicate"])(
    "retains the %s review during exit and forwards back",
    (kind) => {
      documentState.status = `${kind}_pending`;
      const props: ComponentProps<typeof SourceDocumentDetailWrapper> = {
        id: "doc-1",
        ledgerId: "ledger-1",
        open: true,
        onClose: vi.fn(),
        onBack: vi.fn(),
        onExitComplete: vi.fn(),
        categories: [],
        mainCurrency: "CNY",
        preferredCurrencies: [],
      };
      const view = render(<SourceDocumentDetailWrapper {...props} />);
      expect(screen.getByTestId(kind)).toHaveAttribute("data-open", "true");
      fireEvent.click(screen.getByRole("button", { name: "back" }));
      expect(props.onBack).toHaveBeenCalledTimes(1);
      view.rerender(<SourceDocumentDetailWrapper {...props} open={false} />);
      expect(screen.getByTestId(kind)).toHaveAttribute("data-open", "false");
      expect(screen.queryByTestId("detail")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "exit" }));
      expect(props.onExitComplete).toHaveBeenCalledTimes(1);
    }
  );
});

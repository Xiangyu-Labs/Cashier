import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryState = vi.hoisted(() => ({
  data: undefined as { text: string | null; files: [] } | undefined,
  isLoading: true,
}));
const inputSpy = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => queryState,
}));

vi.mock("@/modules/source-document/ui/SourceDocumentInput", () => ({
  SourceDocumentInput: (props: { initialData: { text?: string } }) => {
    inputSpy(props);
    return <div data-testid="retry-input">{props.initialData.text}</div>;
  },
}));

import { SourceDocumentEditRetryDialog } from "@/modules/source-document/ui/SourceDocumentEditRetryDialog";

describe("SourceDocumentEditRetryDialog", () => {
  beforeEach(() => {
    queryState.data = undefined;
    queryState.isLoading = true;
    inputSpy.mockClear();
  });

  it("waits for fetched retry data before mounting the input", () => {
    const props = {
      ledgerId: "ledger-1",
      sourceDocument: { id: "doc-1", text: null, files: [], hasImages: true },
      open: true,
      onOpenChange: vi.fn(),
    };
    const { rerender } = render(<SourceDocumentEditRetryDialog {...props} />);

    expect(inputSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("retry-input")).not.toBeInTheDocument();

    queryState.data = { text: "Fetched receipt text", files: [] };
    queryState.isLoading = false;
    rerender(<SourceDocumentEditRetryDialog {...props} />);

    expect(screen.getByTestId("retry-input")).toHaveTextContent("Fetched receipt text");
    expect(inputSpy).toHaveBeenCalledTimes(1);
  });
});

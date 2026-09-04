import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSourceDocumentFullActionMock } = vi.hoisted(() => ({
  getSourceDocumentFullActionMock: vi.fn(),
}));

vi.mock("@/modules/source-document/actions", () => ({
  getSourceDocumentFullAction: getSourceDocumentFullActionMock,
}));
vi.mock("@/modules/source-document/ui/SourceDocumentInput", () => ({
  SourceDocumentInput: () => <div data-testid="retry-input" />,
}));

import { SourceDocumentEditRetryDialog } from "@/modules/source-document/ui/SourceDocumentEditRetryDialog";

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SourceDocumentEditRetryDialog
        ledgerId="ledger-1"
        sourceDocument={{
          id: "00000000-0000-4000-8000-000000000001",
          version: 1,
          text: null,
          files: [],
          hasImages: true,
        }}
        open
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe("SourceDocumentEditRetryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSourceDocumentFullActionMock.mockRejectedValue(new Error("unavailable"));
  });

  it("renders the load error and reloads without mounting an incomplete input", async () => {
    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("无法加载原始凭证");
    expect(screen.queryByTestId("retry-input")).not.toBeInTheDocument();

    getSourceDocumentFullActionMock.mockResolvedValue({ text: "receipt", files: [] });
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    await waitFor(() => expect(screen.getByTestId("retry-input")).toBeInTheDocument());
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Header } from "@/modules/workspace/ui/Header";
import { getSourceDocumentCountsAction } from "@/modules/source-document/actions";

// Mock the count action so we can control return values
vi.mock("@/modules/source-document/actions", () => ({
  getSourceDocumentCountsAction: vi.fn(),
}));

const mockGetCounts = vi.mocked(getSourceDocumentCountsAction);

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: zero counts
    mockGetCounts.mockResolvedValue({
      processingCount: 0,
      attentionCount: 0,
      totalCount: 0,
    });
  });

  it("renders new record button and no task center control", async () => {
    const onOpenInput = vi.fn();
    const user = userEvent.setup();

    renderWithQuery(<Header ledgerId="test-ledger-id" onOpenInput={onOpenInput} />);

    expect(
      screen.queryByRole("button", { name: /task center|任务中心/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /new record|记一笔|新增记录/i }));
    expect(onOpenInput).toHaveBeenCalledOnce();
  });

  it("renders badge buttons with correct accessible labels when counts are non-zero", async () => {
    const onOpenInput = vi.fn();
    const onNeedsAttention = vi.fn();
    const onInProgress = vi.fn();

    mockGetCounts.mockResolvedValue({
      processingCount: 3,
      attentionCount: 2,
      totalCount: 10,
    });

    renderWithQuery(
      <Header
        ledgerId="test-ledger-id"
        onOpenInput={onOpenInput}
        onNeedsAttention={onNeedsAttention}
        onInProgress={onInProgress}
      />
    );

    // Wait for query to resolve and badges to appear
    const processingBadge = await screen.findByRole("button", { name: /处理中|in progress/i });
    expect(processingBadge).toBeDefined();
    expect(processingBadge.textContent).toContain("3");

    const attentionBadge = await screen.findByRole("button", { name: /待处理|needing attention/i });
    expect(attentionBadge).toBeDefined();
    expect(attentionBadge.textContent).toContain("2");
  });

  it("fires onInProgress callback when processing badge is clicked", async () => {
    const onOpenInput = vi.fn();
    const onNeedsAttention = vi.fn();
    const onInProgress = vi.fn();
    const user = userEvent.setup();

    mockGetCounts.mockResolvedValue({
      processingCount: 3,
      attentionCount: 0,
      totalCount: 10,
    });

    renderWithQuery(
      <Header
        ledgerId="test-ledger-id"
        onOpenInput={onOpenInput}
        onNeedsAttention={onNeedsAttention}
        onInProgress={onInProgress}
      />
    );

    const processingBadge = await screen.findByRole("button", { name: /处理中|in progress/i });
    await user.click(processingBadge);
    expect(onInProgress).toHaveBeenCalledOnce();
  });

  it("fires onNeedsAttention callback when attention badge is clicked", async () => {
    const onOpenInput = vi.fn();
    const onNeedsAttention = vi.fn();
    const onInProgress = vi.fn();
    const user = userEvent.setup();

    mockGetCounts.mockResolvedValue({
      processingCount: 0,
      attentionCount: 2,
      totalCount: 10,
    });

    renderWithQuery(
      <Header
        ledgerId="test-ledger-id"
        onOpenInput={onOpenInput}
        onNeedsAttention={onNeedsAttention}
        onInProgress={onInProgress}
      />
    );

    const attentionBadge = await screen.findByRole("button", { name: /待处理|needing attention/i });
    await user.click(attentionBadge);
    expect(onNeedsAttention).toHaveBeenCalledOnce();
  });

  it("does not render badge buttons when counts are zero", async () => {
    const onOpenInput = vi.fn();
    const onNeedsAttention = vi.fn();
    const onInProgress = vi.fn();

    // Default mock returns zero counts
    renderWithQuery(
      <Header
        ledgerId="test-ledger-id"
        onOpenInput={onOpenInput}
        onNeedsAttention={onNeedsAttention}
        onInProgress={onInProgress}
      />
    );

    // Wait for query to settle, then check no badges
    await waitFor(() => {
      expect(mockGetCounts).toHaveBeenCalled();
    });

    expect(screen.queryByRole("button", { name: /处理中|in progress/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /待处理|needing attention/i })).not.toBeInTheDocument();
  });
});

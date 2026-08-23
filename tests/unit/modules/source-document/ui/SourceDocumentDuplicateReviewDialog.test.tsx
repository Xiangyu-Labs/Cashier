import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import type {
  SourceDocumentDuplicateReviewDetailDto,
  SourceDocumentListItemDto,
  StreamPage,
} from "@/modules/source-document/contracts";
import { SourceDocumentDuplicateReviewDialog } from "@/modules/source-document/ui/SourceDocumentDuplicateReviewDialog";

const { discardActionMock, keepActionMock, reviewActionMock, toastSuccessMock, toastErrorMock } =
  vi.hoisted(() => ({
    discardActionMock: vi.fn(),
    keepActionMock: vi.fn(),
    reviewActionMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

vi.mock("@/modules/source-document/actions", () => ({
  getSourceDocumentDuplicateReviewAction: (...args: unknown[]) => reviewActionMock(...args),
  keepDuplicateSourceDocumentAction: (...args: unknown[]) => keepActionMock(...args),
  discardDuplicateSourceDocumentAction: (...args: unknown[]) => discardActionMock(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

vi.mock("@/modules/source-document/ui/SourceDocumentImageModal", () => ({
  SourceDocumentImageModal: () => null,
}));

const LEDGER_ID = "ledger-1";
const DUPLICATE_ID = "doc-2";
const streamKey = queryKeys.sourceDocumentStream(LEDGER_ID, {});

function listItem(id: string, title: string): SourceDocumentListItemDto {
  return {
    id,
    ledgerId: LEDGER_ID,
    title,
    text: null,
    files: [],
    status: "duplicate_pending",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-07-15",
    metadata: {},
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    deletedAt: null,
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: "rev-2",
  };
}

function reviewDetail(): SourceDocumentDuplicateReviewDetailDto {
  return {
    review: {
      sourceDocumentId: DUPLICATE_ID,
      revisionId: "rev-2",
      matchedSourceDocumentId: "doc-1",
      matchedRevisionId: "rev-1",
      status: "pending",
      reason: "same amount",
      confidence: 0.98,
    },
    duplicate: {
      id: DUPLICATE_ID,
      title: "Duplicate bill",
      entryDate: "2026-07-15",
      createdAt: "2026-07-15T00:00:00.000Z",
      entries: [],
      files: [],
    },
    matched: {
      id: "doc-1",
      title: "Original bill",
      entryDate: "2026-07-15",
      createdAt: "2026-07-14T00:00:00.000Z",
      entries: [],
      files: [],
    },
    matchedState: "unchanged",
  };
}

function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  queryClient.setQueryData<InfiniteData<StreamPage>>(streamKey, {
    pages: [
      {
        items: [listItem("doc-1", "Original bill"), listItem(DUPLICATE_ID, "Duplicate bill")],
        nextCursor: null,
        generation: "1",
      },
    ],
    pageParams: [null],
  });
  return queryClient;
}

class ErrorBoundary extends Component<
  { children: ReactNode; onCaughtError: (error: Error, info: ErrorInfo) => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onCaughtError(error, info);
  }

  render() {
    if (this.state.hasError) return <div data-testid="error-boundary" />;
    return this.props.children;
  }
}

function StreamListProbe() {
  const { data } = useQuery<InfiniteData<StreamPage>>({
    queryKey: streamKey,
    queryFn: async () => {
      throw new Error("probe must read from cache only");
    },
    enabled: false,
  });
  const items = data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} data-testid="stream-item">
          {item.title}
        </li>
      ))}
    </ul>
  );
}

function renderDialog({
  queryClient,
  onOpenChange = vi.fn(),
  onCaughtError = vi.fn(),
}: {
  queryClient: QueryClient;
  onOpenChange?: (open: boolean) => void;
  onCaughtError?: (error: Error, info: ErrorInfo) => void;
}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary onCaughtError={onCaughtError}>
        <DialogHarness onOpenChange={onOpenChange} />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

function DialogHarness({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <SourceDocumentDuplicateReviewDialog
        ledgerId={LEDGER_ID}
        sourceDocumentId={DUPLICATE_ID}
        open={open}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen);
          setOpen(nextOpen);
        }}
        mainCurrency="CNY"
      />
      <StreamListProbe />
    </>
  );
}

describe("SourceDocumentDuplicateReviewDialog discard flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewActionMock.mockResolvedValue(reviewDetail());
    discardActionMock.mockResolvedValue({ status: "discarded" });
  });

  it("closes after success without synchronously patching the stream", async () => {
    const queryClient = createQueryClient();
    const onOpenChange = vi.fn();
    const onCaughtError = vi.fn();
    renderDialog({ queryClient, onOpenChange, onCaughtError });

    const discardButton = await screen.findByRole("button", { name: "删除重复" });
    await waitFor(() => expect(discardButton).not.toBeDisabled());
    expect(screen.getAllByTestId("stream-item")).toHaveLength(2);

    fireEvent.click(discardButton);
    expect(discardActionMock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "删除重复" }));

    await waitFor(() => {
      expect(discardActionMock).toHaveBeenCalledWith(
        LEDGER_ID,
        DUPLICATE_ID,
        "rev-2",
        expect.any(String)
      );
    });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("已删除重复账单"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "疑似重复账单" })).not.toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: "删除重复" })).not.toBeInTheDocument();

    // The list remains server-owned until its invalidated query refetches.
    const streamItems = screen.getAllByTestId("stream-item");
    expect(streamItems).toHaveLength(2);
    expect(streamItems[0]).toHaveTextContent("Original bill");

    expect(onCaughtError).not.toHaveBeenCalled();
    expect(screen.queryByTestId("error-boundary")).not.toBeInTheDocument();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("keeps the successful discard result when invalidation fails", async () => {
    const queryClient = createQueryClient();
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockRejectedValue(new Error("refresh failed"));
    const onOpenChange = vi.fn();
    const onCaughtError = vi.fn();
    renderDialog({ queryClient, onOpenChange, onCaughtError });

    const discardButton = await screen.findByRole("button", { name: "删除重复" });
    await waitFor(() => expect(discardButton).not.toBeDisabled());

    fireEvent.click(discardButton);
    expect(discardActionMock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "删除重复" }));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("已删除重复账单"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("已保存，但无法刷新最新数据，请重试。")
    );

    expect(invalidate).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(onCaughtError).not.toHaveBeenCalled();
    expect(screen.queryByTestId("error-boundary")).not.toBeInTheDocument();
  });

  it("shows the detection-time snapshot badge and a modified notice", async () => {
    reviewActionMock.mockResolvedValue({
      ...reviewDetail(),
      matchedState: "modified",
    });
    const queryClient = createQueryClient();
    const onCaughtError = vi.fn();
    renderDialog({ queryClient, onCaughtError });

    await screen.findByText("该账单在检测后已修改；下方仍展示检测时版本。");
    expect(screen.getByText("检测时版本")).toBeInTheDocument();
    expect(screen.getAllByText("Original bill").length).toBeGreaterThan(0);
    expect(onCaughtError).not.toHaveBeenCalled();
  });

  it("shows a deleted notice while still rendering the detection snapshot", async () => {
    reviewActionMock.mockResolvedValue({
      ...reviewDetail(),
      matchedState: "deleted",
    });
    const queryClient = createQueryClient();
    const onCaughtError = vi.fn();
    renderDialog({ queryClient, onCaughtError });

    await screen.findByText("该账单在检测后已删除；下方仍展示检测时版本。");
    expect(screen.getByText("检测时版本")).toBeInTheDocument();
    expect(screen.getAllByText("Original bill").length).toBeGreaterThan(0);

    const keepButton = await screen.findByRole("button", { name: "仍然保留" });
    expect(keepButton).not.toBeDisabled();
  });

  it("falls back to the unavailable matched message when the snapshot is missing", async () => {
    reviewActionMock.mockResolvedValue({
      ...reviewDetail(),
      matched: null,
      matchedRevisionId: null,
      matchedState: "deleted",
    });
    const queryClient = createQueryClient();
    const onCaughtError = vi.fn();
    renderDialog({ queryClient, onCaughtError });

    expect(await screen.findByText("匹配的原始账单已不可用。")).toBeInTheDocument();
    expect(screen.queryByText("检测时版本")).not.toBeInTheDocument();
    expect(screen.getAllByText("Duplicate bill").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "删除重复" })).not.toBeDisabled();
    expect(onCaughtError).not.toHaveBeenCalled();
  });
});

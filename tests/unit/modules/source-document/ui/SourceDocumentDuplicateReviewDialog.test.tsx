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
        generation: 1,
      },
    ],
    pageParams: [null],
  });
  queryClient.setQueryData(queryKeys.sourceDocumentEntities(LEDGER_ID), {
    "doc-1": listItem("doc-1", "Original bill"),
    [DUPLICATE_ID]: listItem(DUPLICATE_ID, "Duplicate bill"),
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
    discardActionMock.mockResolvedValue({
      reconciliation: {
        entity: null,
        operationId: "op-discard",
        entityVersion: "2026-07-15T00:00:00.000Z",
        countPatch: { processingDelta: 0, attentionDelta: 0 },
        status: "discarded",
        enteredWindow: false,
        exitedWindow: true,
      },
    });
  });

  it("applies the tombstone, closes the dialog, and keeps the remaining item without an error boundary", async () => {
    const queryClient = createQueryClient();
    const onOpenChange = vi.fn();
    const onCaughtError = vi.fn();
    renderDialog({ queryClient, onOpenChange, onCaughtError });

    const discardButton = await screen.findByRole("button", { name: "删除重复" });
    await waitFor(() => expect(discardButton).not.toBeDisabled());
    expect(screen.getAllByTestId("stream-item")).toHaveLength(2);

    fireEvent.click(discardButton);

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

    // Tombstone applied: the duplicate is gone from the stream and entity store.
    const streamItems = screen.getAllByTestId("stream-item");
    expect(streamItems).toHaveLength(1);
    expect(streamItems[0]).toHaveTextContent("Original bill");
    const entities = queryClient.getQueryData<Record<string, SourceDocumentListItemDto>>(
      queryKeys.sourceDocumentEntities(LEDGER_ID)
    );
    expect(entities?.[DUPLICATE_ID]).toBeUndefined();
    expect(entities?.["doc-1"]).toBeDefined();

    expect(onCaughtError).not.toHaveBeenCalled();
    expect(screen.queryByTestId("error-boundary")).not.toBeInTheDocument();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("keeps the successful discard result when the background invalidation fails", async () => {
    const queryClient = createQueryClient();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockRejectedValue(new Error("refresh failed"));
    const onOpenChange = vi.fn();
    const onCaughtError = vi.fn();
    renderDialog({ queryClient, onOpenChange, onCaughtError });

    const discardButton = await screen.findByRole("button", { name: "删除重复" });
    await waitFor(() => expect(discardButton).not.toBeDisabled());

    fireEvent.click(discardButton);

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("已删除重复账单"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastErrorMock).not.toHaveBeenCalled();

    // The failed background refresh must be logged but never flip the result.
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("background cache invalidation failed"),
        expect.objectContaining({ ledgerId: LEDGER_ID, sourceDocumentId: DUPLICATE_ID })
      );
    });
    expect(invalidate).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(onCaughtError).not.toHaveBeenCalled();
    expect(screen.queryByTestId("error-boundary")).not.toBeInTheDocument();

    const entities = queryClient.getQueryData<Record<string, SourceDocumentListItemDto>>(
      queryKeys.sourceDocumentEntities(LEDGER_ID)
    );
    expect(entities?.[DUPLICATE_ID]).toBeUndefined();
  });
});

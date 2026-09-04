import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSourceDocumentDetailData } from "@/modules/source-document/hooks/useSourceDocumentDetailData";
import { queryKeys } from "@/lib/query-keys";

const getSourceDocumentLightAction = vi.fn();

vi.mock("@/modules/source-document/server-actions/get-document-light", () => ({
  getSourceDocumentLightAction: (...args: unknown[]) => getSourceDocumentLightAction(...args),
}));

describe("useSourceDocumentDetailData", () => {
  beforeEach(() => {
    getSourceDocumentLightAction.mockReset().mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      ledgerId: "ledger-1",
      title: "Lunch",
      text: "receipt",
      files: [],
      status: "completed",
      type: "text",
      anomalyReason: null,
      entryDate: "2026-07-15",
      metadata: {},
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      deletedAt: null,
      ledgerEntries: [],
      hasImages: false,
      supportedActions: ["retry", "edit_retry", "delete"],
      errorCode: null,
    });
  });

  it("loads a detail through one bounded action request", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useSourceDocumentDetailData({
          ledgerId: "ledger-1",
          id: "11111111-1111-4111-8111-111111111111",
          open: true,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.sourceDocument?.title).toBe("Lunch"));
    expect(getSourceDocumentLightAction).toHaveBeenCalledTimes(1);
    expect(getSourceDocumentLightAction).toHaveBeenCalledWith(
      "ledger-1",
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("shows fresh cached data immediately without refetching on every open", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    queryClient.setQueryData(
      queryKeys.sourceDocument("ledger-1", "11111111-1111-4111-8111-111111111111"),
      {
        id: "11111111-1111-4111-8111-111111111111",
        ledgerId: "ledger-1",
        title: "Cached",
        text: "receipt",
        files: [],
        status: "completed",
        type: "text",
        anomalyReason: null,
        entryDate: "2026-07-28",
        createdAt: "2026-07-15T00:00:00.000Z",
        ledgerEntries: [],
        hasImages: false,
        supportedActions: [],
        errorCode: null,
        pendingRevisionId: null,
      }
    );
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useSourceDocumentDetailData({
          ledgerId: "ledger-1",
          id: "11111111-1111-4111-8111-111111111111",
          open: true,
        }),
      { wrapper }
    );

    expect(result.current.sourceDocument?.entryDate).toBe("2026-07-28");
    expect(getSourceDocumentLightAction).not.toHaveBeenCalled();
  });

  it("shows stale cached data immediately and refreshes it in the background", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    queryClient.setQueryData(
      queryKeys.sourceDocument("ledger-1", "11111111-1111-4111-8111-111111111111"),
      {
        id: "11111111-1111-4111-8111-111111111111",
        ledgerId: "ledger-1",
        title: "Cached",
        text: "receipt",
        files: [],
        status: "completed",
        type: "text",
        anomalyReason: null,
        entryDate: "2026-07-28",
        createdAt: "2026-07-15T00:00:00.000Z",
        ledgerEntries: [],
        hasImages: false,
        supportedActions: [],
        errorCode: null,
        pendingRevisionId: null,
      },
      { updatedAt: Date.now() - 2 * 60 * 1000 - 1 }
    );
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useSourceDocumentDetailData({
          ledgerId: "ledger-1",
          id: "11111111-1111-4111-8111-111111111111",
          open: true,
        }),
      { wrapper }
    );

    expect(result.current.sourceDocument?.title).toBe("Cached");
    await waitFor(() => expect(getSourceDocumentLightAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.sourceDocument?.title).toBe("Lunch"));
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSourceDocumentDetailData } from "@/modules/source-document/hooks/useSourceDocumentDetailData";

const getSourceDocumentLightAction = vi.fn();

vi.mock("@/modules/source-document/actions", () => ({
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
});

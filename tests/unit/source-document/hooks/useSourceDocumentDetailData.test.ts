import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

vi.mock("@/modules/source-document/actions", () => ({
  getSourceDocumentByIdAction: vi.fn(),
  getSourceDocumentLightAction: vi.fn(),
}));

import { useSourceDocumentDetailData } from "@/modules/source-document/hooks";

describe("useSourceDocumentDetailData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers full data over light data and builds safe document fields", () => {
    useQueryMock
      .mockReturnValueOnce({
        data: {
          id: "doc-1",
          ledgerId: "ledger-1",
          status: "processing",
          type: "ai_parsed",
          ledgerEntries: [{ id: "entry-light" }],
        },
        isLoading: false,
      })
      .mockReturnValueOnce({
        data: {
          id: "doc-1",
          ledgerId: "ledger-1",
          imageUrls: ["/api/uploads/a.jpg"],
          ledgerEntries: [{ id: "entry-full" }],
          status: undefined,
          type: undefined,
        },
        error: null,
      });

    const { result } = renderHook(() =>
      useSourceDocumentDetailData({
        id: "doc-1",
        open: true,
      })
    );

    expect(result.current.sourceDocument).toMatchObject({
      id: "doc-1",
      ledgerId: "ledger-1",
    });
    expect(result.current.currentLedgerEntries).toEqual([{ id: "entry-full" }]);
    expect(result.current.safeLedgerId).toBe("ledger-1");
    expect(result.current.safeSourceDocument).toMatchObject({
      status: "queued",
      type: "",
    });
    expect(result.current.isLoadingImages).toBe(false);
  });

  it("uses light loading state and initialLedgerEntries fallback when detail is absent", () => {
    useQueryMock
      .mockReturnValueOnce({
        data: null,
        isLoading: true,
      })
      .mockReturnValueOnce({
        data: null,
        error: new Error("missing"),
      });

    const { result } = renderHook(() =>
      useSourceDocumentDetailData({
        id: "",
        open: false,
        initialLedgerEntries: [{ id: "entry-1" }] as never,
      })
    );

    expect(useQueryMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        enabled: false,
      })
    );
    expect(useQueryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        enabled: false,
        retry: false,
      })
    );
    expect(result.current.sourceDocument).toBeNull();
    expect(result.current.currentLedgerEntries).toEqual([{ id: "entry-1" }]);
    expect(result.current.safeLedgerId).toBe("");
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isLoadingImages).toBe(true);
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

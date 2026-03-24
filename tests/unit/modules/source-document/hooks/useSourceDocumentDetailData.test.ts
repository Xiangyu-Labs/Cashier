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

  it("keeps light detail data directly usable without safe fallback objects", () => {
    useQueryMock
      .mockReturnValueOnce({
        data: {
          id: "doc-1",
          ledgerId: "ledger-1",
          imageUrls: ["/api/uploads/ledger-1/doc-1/a.jpg"],
          hasImages: true,
          ledgerEntries: [{ id: "entry-1" }],
          status: "completed",
          type: "ai_parsed",
        },
        isLoading: false,
      })
      .mockReturnValueOnce({ data: null, error: null });

    const { result } = renderHook(() =>
      useSourceDocumentDetailData({
        ledgerId: "ledger-1",
        id: "doc-1",
        open: true,
      })
    );

    expect((result.current.sourceDocument as { imageUrls?: string[] } | null)?.imageUrls).toEqual([
      "/api/uploads/ledger-1/doc-1/a.jpg",
    ]);
    expect(result.current.currentLedgerEntries).toEqual([{ id: "entry-1" }]);
    expect(result.current.ledgerId).toBe("ledger-1");
    expect(result.current.isLoadingImages).toBe(false);
    expect(result.current).not.toHaveProperty("safeSourceDocument");
    expect(result.current).not.toHaveProperty("safeLedgerId");
  });

  it("falls back to initial ledger entries only when no document data exists", () => {
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
        ledgerId: "",
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
    expect(result.current.ledgerId).toBe("");
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isLoadingImages).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current).not.toHaveProperty("safeSourceDocument");
    expect(result.current).not.toHaveProperty("safeLedgerId");
  });
});

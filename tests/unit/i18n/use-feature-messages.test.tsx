import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFeatureMessages } from "@/i18n/use-feature-messages";

describe("useFeatureMessages", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces a failed request and retries the same shared cache", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);

    const { result } = renderHook(() => useFeatureMessages("en", "stats"));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ StatsTab: { month: "Month" } }),
    } as Response);

    act(() => result.current.retry());

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });
    expect(result.current.data).toEqual({ StatsTab: { month: "Month" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

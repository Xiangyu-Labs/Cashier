import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RefreshButton } from "@/components/ui/refresh-button";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

describe("RefreshButton", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows success after the refresh resolves and clears it after 1.8 seconds", async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<RefreshButton onRefresh={onRefresh} isRefreshing={false} />);

    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await act(async () => Promise.resolve());
    expect(container.querySelector(".lucide-check")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1800));
    expect(container.querySelector(".lucide-check")).not.toBeInTheDocument();
  });

  it("reports a manual refresh failure", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("offline"));
    render(<RefreshButton onRefresh={onRefresh} isRefreshing={false} />);

    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("refreshFailed"));
  });
});

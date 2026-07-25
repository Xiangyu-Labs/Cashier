import { act, render } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

const observeMock = vi.fn();
const disconnectMock = vi.fn();

class IntersectionObserverMock {
  observe = observeMock;
  disconnect = disconnectMock;
}

function Harness({ fetchNextPage }: { fetchNextPage: () => void }) {
  const [showSentinel, setShowSentinel] = useState(false);
  const sentinelRef = useInfiniteScroll({
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage,
    rootMargin: "400px",
  });

  return (
    <>
      <button onClick={() => setShowSentinel(true)}>show</button>
      {showSentinel && <div ref={sentinelRef} data-testid="sentinel" />}
    </>
  );
}

describe("useInfiniteScroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  it("starts observing when a conditionally rendered sentinel mounts", () => {
    const { getByRole, getByTestId } = render(<Harness fetchNextPage={vi.fn()} />);

    expect(observeMock).not.toHaveBeenCalled();
    act(() => getByRole("button", { name: "show" }).click());

    expect(observeMock).toHaveBeenCalledWith(getByTestId("sentinel"));
  });

  it("loads on scroll when the sentinel is within the preload distance", () => {
    let scheduledCheck: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledCheck = callback;
      return 1;
    });
    const fetchNextPage = vi.fn();
    const { getByRole, getByTestId } = render(<Harness fetchNextPage={fetchNextPage} />);
    act(() => getByRole("button", { name: "show" }).click());
    vi.spyOn(getByTestId("sentinel"), "getBoundingClientRect").mockReturnValue({
      top: window.innerHeight + 300,
    } as DOMRect);

    act(() => {
      document.dispatchEvent(new Event("scroll"));
      scheduledCheck?.(0);
    });

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

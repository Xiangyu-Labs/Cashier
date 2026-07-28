import { describe, expect, it } from "vitest";
import { resolveSwipeDestination, shouldIgnoreTabSwipe } from "@/modules/workspace/tab-swipe";

describe("tab swipe", () => {
  it("uses distance or velocity and respects first/last boundaries", () => {
    expect(resolveSwipeDestination("details", -80, -0.1)).toBe("stats");
    expect(resolveSwipeDestination("details", 20, 0.8)).toBe("stream");
    expect(resolveSwipeDestination("details", 20, 0.1)).toBeNull();
    expect(resolveSwipeDestination("stream", 100, 1)).toBeNull();
    expect(resolveSwipeDestination("settings", -100, -1)).toBeNull();
  });

  it("ignores interactive and explicitly marked targets", () => {
    const input = document.createElement("input");
    const chart = document.createElement("div");
    chart.dataset.tabSwipeIgnore = "";
    expect(shouldIgnoreTabSwipe(input)).toBe(true);
    expect(shouldIgnoreTabSwipe(chart)).toBe(true);
    expect(shouldIgnoreTabSwipe(document.createElement("div"))).toBe(false);
  });
});

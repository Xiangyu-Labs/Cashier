import { describe, it, expect, vi } from "vitest";
import { isStandalone, isIOS } from "@/lib/pwa-utils";

function mockMatchMedia(matches: boolean) {
  return vi.fn(() => ({
    matches,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("isStandalone", () => {
  it("returns true when display-mode is standalone", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    expect(isStandalone()).toBe(true);
  });

  it("returns false when display-mode is not standalone", () => {
    vi.stubGlobal("matchMedia", mockMatchMedia(false));
    expect(isStandalone()).toBe(false);
  });

  it("returns false when window is undefined (SSR)", () => {
    const originalWindow = global.window;
    // @ts-expect-error simulate SSR
    delete global.window;
    expect(isStandalone()).toBe(false);
    global.window = originalWindow;
  });
});

describe("isIOS", () => {
  it("returns true when userAgent contains iPhone", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    });
    expect(isIOS()).toBe(true);
  });

  it("returns true when userAgent contains iPad", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)",
    });
    expect(isIOS()).toBe(true);
  });

  it("returns true when userAgent contains iPod", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X)",
    });
    expect(isIOS()).toBe(true);
  });

  it("returns false for non-iOS userAgent", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    expect(isIOS()).toBe(false);
  });

  it("returns false when navigator is undefined (SSR)", () => {
    const originalNavigator = global.navigator;
    // @ts-expect-error simulate SSR
    delete global.navigator;
    expect(isIOS()).toBe(false);
    global.navigator = originalNavigator;
  });
});

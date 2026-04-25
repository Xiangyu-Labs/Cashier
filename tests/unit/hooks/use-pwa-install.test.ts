import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

describe("usePwaInstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initial state: not standalone, not installable", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false, media: "", onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.isStandalone).toBe(false);
    expect(result.current.isInstallable).toBe(false);
    expect(result.current.isIOS).toBe(false);
    expect(result.current.isPrompting).toBe(false);
  });

  it("isInstallable becomes true after beforeinstallprompt event", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false, media: "", onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });

    const { result } = renderHook(() => usePwaInstall());

    const promptMock = vi.fn();
    const userChoiceMock = Promise.resolve({ outcome: "accepted" as const, platform: "" });

    const event = new Event("beforeinstallprompt", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "prompt", { value: promptMock, writable: false });
    Object.defineProperty(event, "userChoice", { value: userChoiceMock, writable: false });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.isInstallable).toBe(true);
    expect(result.current.isStandalone).toBe(false);
  });

  it("iOS device not installed: isInstallable is true", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false, media: "", onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    });

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.isIOS).toBe(true);
    expect(result.current.isInstallable).toBe(true);
    expect(result.current.isStandalone).toBe(false);
  });

  it("standalone mode: isInstallable is false", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query === "(display-mode: standalone)",
      media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.isStandalone).toBe(true);
    expect(result.current.isInstallable).toBe(false);
  });

  it("calling promptInstall triggers saved prompt", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false, media: "", onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });

    const { result } = renderHook(() => usePwaInstall());

    const promptMock = vi.fn();
    const userChoiceMock = Promise.resolve({ outcome: "accepted" as const, platform: "" });

    const event = new Event("beforeinstallprompt", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "prompt", { value: promptMock, writable: false });
    Object.defineProperty(event, "userChoice", { value: userChoiceMock, writable: false });

    act(() => {
      window.dispatchEvent(event);
    });

    act(() => {
      result.current.promptInstall();
    });

    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(result.current.isPrompting).toBe(true);

    await act(async () => {
      await userChoiceMock;
    });
  });

  it("appinstalled event makes isInstallable false", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false, media: "", onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });

    const { result } = renderHook(() => usePwaInstall());

    const promptMock = vi.fn();
    const userChoiceMock = Promise.resolve({ outcome: "accepted" as const, platform: "" });
    const event = new Event("beforeinstallprompt", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "prompt", { value: promptMock, writable: false });
    Object.defineProperty(event, "userChoice", { value: userChoiceMock, writable: false });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.isInstallable).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current.isInstallable).toBe(false);
    expect(result.current.isStandalone).toBe(true);
  });
});

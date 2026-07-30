import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTabScrollRestoration } from "@/modules/workspace/hooks/useTabScrollRestoration";
import type { LedgerTab } from "@/modules/workspace/tabs";

function Harness({ ledgerId, tab }: { ledgerId: string; tab: LedgerTab }) {
  useTabScrollRestoration(ledgerId, tab);
  return <div />;
}

describe("useTabScrollRestoration", () => {
  let scrollY = 0;

  beforeEach(() => {
    scrollY = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 3000,
    });
    vi.spyOn(window, "scrollTo").mockImplementation((...args: unknown[]) => {
      const options = args[0];
      if (typeof options === "object" && options != null && "top" in options) {
        scrollY = Number(options.top ?? 0);
      }
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  it("remembers an independent vertical position for every tab", () => {
    const view = render(<Harness ledgerId="ledger-1" tab="stream" />);
    scrollY = 640;

    act(() => view.rerender(<Harness ledgerId="ledger-1" tab="details" />));
    expect(scrollY).toBe(0);
    scrollY = 220;

    act(() => view.rerender(<Harness ledgerId="ledger-1" tab="stream" />));
    expect(scrollY).toBe(640);

    act(() => view.rerender(<Harness ledgerId="ledger-1" tab="details" />));
    expect(scrollY).toBe(220);
  });

  it("clears remembered positions when the ledger changes", () => {
    const view = render(<Harness ledgerId="ledger-1" tab="stream" />);
    scrollY = 500;
    act(() => view.rerender(<Harness ledgerId="ledger-1" tab="stats" />));
    act(() => view.rerender(<Harness ledgerId="ledger-2" tab="stream" />));

    expect(scrollY).toBe(0);
  });
});

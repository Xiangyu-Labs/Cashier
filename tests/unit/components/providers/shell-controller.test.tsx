import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ShellControllerProvider,
  useShellController,
} from "@/components/providers/shell-controller";

describe("ShellControllerProvider", () => {
  it("updates readiness while keeping registered callbacks stable", () => {
    const handler = vi.fn();
    const renderCount = vi.fn();

    function Consumer() {
      const controller = useShellController();
      renderCount();
      return (
        <button disabled={!controller.ready} onClick={controller.onOpenInput}>
          Open
        </button>
      );
    }

    function Registrar() {
      const { registerOpenInput } = useShellController();
      useEffect(() => registerOpenInput(handler), [registerOpenInput]);
      return null;
    }

    render(
      <ShellControllerProvider>
        <Consumer />
        <Registrar />
      </ShellControllerProvider>
    );

    expect(renderCount).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Open" })).toBeEnabled();
    screen.getByRole("button", { name: "Open" }).click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("clears readiness on unregister and ignores stale cleanup", () => {
    let controller!: ReturnType<typeof useShellController>;
    function Consumer() {
      const value = useShellController();
      useEffect(() => {
        controller = value;
      }, [value]);
      return null;
    }
    render(
      <ShellControllerProvider>
        <Consumer />
      </ShellControllerProvider>
    );
    expect(controller.ready).toBe(false);
    const open = controller.onOpenInput;
    const first = vi.fn();
    const second = vi.fn();
    let unregisterFirst!: () => void;
    let unregisterSecond!: () => void;
    act(() => {
      unregisterFirst = controller.registerOpenInput(first);
    });
    act(() => {
      unregisterSecond = controller.registerOpenInput(second);
    });
    act(() => unregisterFirst());
    expect(controller.ready).toBe(true);
    expect(controller.onOpenInput).toBe(open);
    open();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    act(() => unregisterSecond());
    expect(controller.ready).toBe(false);
    open();
    expect(second).toHaveBeenCalledOnce();
  });
});

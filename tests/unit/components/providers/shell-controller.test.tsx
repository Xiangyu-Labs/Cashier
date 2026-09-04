import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ShellControllerProvider,
  useShellController,
} from "@/components/providers/shell-controller";

describe("ShellControllerProvider", () => {
  it("registers handlers without rerendering context consumers", () => {
    const handler = vi.fn();
    const renderCount = vi.fn();

    function Consumer() {
      const controller = useShellController();
      renderCount();
      return <button onClick={controller.onOpenInput}>Open</button>;
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

    expect(renderCount).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Open" }).click();
    expect(handler).toHaveBeenCalledOnce();
  });
});

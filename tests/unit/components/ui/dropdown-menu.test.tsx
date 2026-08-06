import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function TestDropdownMenu({
  triggerProps,
  onOpenChange,
}: {
  triggerProps?: React.ComponentPropsWithoutRef<typeof DropdownMenuTrigger>;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DropdownMenu {...(onOpenChange == null ? {} : { onOpenChange })}>
      <DropdownMenuTrigger {...triggerProps}>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Menu item</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ControlledTestDropdownMenu({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        setOpen(nextOpen);
      }}
    >
      <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Menu item</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("does not open during pointerdown or after a drag is canceled", () => {
    render(<TestDropdownMenu />);
    const trigger = screen.getByRole("button", { name: "Open menu" });

    fireEvent.pointerDown(trigger, {
      button: 0,
      pointerId: 1,
      pointerType: "touch",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.pointerUp(document, {
      button: 0,
      pointerId: 1,
      pointerType: "touch",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.pointerDown(trigger, {
      button: 0,
      pointerId: 2,
      pointerType: "touch",
    });
    fireEvent.pointerCancel(trigger, {
      button: 0,
      pointerId: 2,
      pointerType: "touch",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens and closes after complete mouse and touch clicks", async () => {
    const user = userEvent.setup();
    render(<TestDropdownMenu />);
    const trigger = screen.getByRole("button", { name: "Open menu" });

    await user.click(trigger);
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    fireEvent.pointerDown(trigger, { button: 0, pointerType: "touch", pointerId: 3 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.pointerUp(trigger, { button: 0, pointerType: "touch", pointerId: 3 });
    fireEvent.click(trigger);
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("opens touch taps on pointerup and ignores a follow-up compatibility click", async () => {
    const onOpenChange = vi.fn();
    render(<TestDropdownMenu onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole("button", { name: "Open menu" });

    fireEvent.pointerDown(trigger, { button: 0, pointerType: "touch", pointerId: 4 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.pointerUp(trigger, { pointerType: "touch", pointerId: 4 });
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledTimes(1);

    fireEvent.click(trigger, { button: 0, detail: 1 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it("opens once for Enter and Space and restores trigger focus after Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TestDropdownMenu onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole("button", { name: "Open menu" });

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(onOpenChange).toHaveBeenCalledTimes(2);

    await user.keyboard(" ");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledTimes(3);
  });

  it("calls onOpenChange once in uncontrolled and controlled modes", async () => {
    const user = userEvent.setup();
    const uncontrolledOnOpenChange = vi.fn();
    const controlledOnOpenChange = vi.fn();

    const uncontrolledView = render(<TestDropdownMenu onOpenChange={uncontrolledOnOpenChange} />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(uncontrolledOnOpenChange).toHaveBeenCalledTimes(1);
    uncontrolledView.unmount();

    render(<ControlledTestDropdownMenu onOpenChange={controlledOnOpenChange} />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(controlledOnOpenChange).toHaveBeenCalledTimes(1);
  });

  it("does not open for non-primary, modified, or disabled triggers", () => {
    const { rerender } = render(<TestDropdownMenu />);
    let trigger = screen.getByRole("button", { name: "Open menu" });

    fireEvent.pointerDown(trigger, { button: 2 });
    fireEvent.click(trigger, { button: 2 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: true });
    fireEvent.click(trigger, { button: 0, ctrlKey: true });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    rerender(<TestDropdownMenu triggerProps={{ disabled: true }} />);
    trigger = screen.getByRole("button", { name: "Open menu" });
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not toggle when a caller prevents the activation event", () => {
    const onPointerDown = vi.fn((event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
    });
    render(<TestDropdownMenu triggerProps={{ onPointerDown }} />);
    const trigger = screen.getByRole("button", { name: "Open menu" });

    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger, { button: 0, detail: 1 });

    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

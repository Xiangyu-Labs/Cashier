import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

describe("Popover", () => {
  it("closes when its trigger is detached", async () => {
    const onOpenChange = vi.fn();
    const view = render(
      <Popover defaultOpen onOpenChange={onOpenChange}>
        <PopoverTrigger>Open menu</PopoverTrigger>
        <PopoverContent>Menu</PopoverContent>
      </Popover>
    );
    expect(screen.getByText("Menu")).toBeInTheDocument();

    view.rerender(
      <Popover defaultOpen onOpenChange={onOpenChange}>
        <PopoverContent>Menu</PopoverContent>
      </Popover>
    );

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

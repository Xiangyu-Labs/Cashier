import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const { dialogFooterSpy } = vi.hoisted(() => ({
  dialogFooterSpy: vi.fn(
    ({ children, className }: { children?: ReactNode; className?: string }) => (
      <div data-class-name={className ?? ""}>{children}</div>
    )
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: dialogFooterSpy,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

describe("ConfirmDialog", () => {
  beforeEach(() => {
    dialogFooterSpy.mockClear();
  });

  it("passes layout className only for the three-button layout", () => {
    render(
      <ConfirmDialog
        title="Unsaved changes"
        description="Choose what to do"
        onConfirm={() => {}}
        onSave={() => {}}
      />
    );

    const footerProps = dialogFooterSpy.mock.calls[0]?.[0] as { className?: string } | undefined;

    expect(footerProps?.className).toBe("justify-between sm:justify-between");
  });

  it("stays open and disables its action until an async confirmation succeeds", async () => {
    let resolveConfirmation!: () => void;
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirmation = resolve;
        })
    );
    render(
      <ConfirmDialog
        title="Delete"
        description="Delete this item"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />
    );

    const confirmButton = screen.getByRole("button", { name: "confirm" });
    fireEvent.click(confirmButton);
    await waitFor(() => expect(confirmButton).toBeDisabled());
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveConfirmation();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("stays open when saving unsaved changes fails", async () => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn(async () => false);

    render(
      <ConfirmDialog
        title="Unsaved changes"
        description="Choose what to do"
        onConfirm={() => {}}
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

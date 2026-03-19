import { render } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const { dialogSpy, dialogFooterSpy } = vi.hoisted(() => ({
  dialogSpy: vi.fn(({ children }: { children?: ReactNode }) => <div>{children}</div>),
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
  Dialog: dialogSpy,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: dialogFooterSpy,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

describe("ConfirmDialog", () => {
  beforeEach(() => {
    dialogSpy.mockClear();
    dialogFooterSpy.mockClear();
  });

  it("omits optional Dialog props when they are not provided", () => {
    render(<ConfirmDialog title="Delete entry" description="Are you sure?" onConfirm={() => {}} />);

    const dialogProps = dialogSpy.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const footerProps = dialogFooterSpy.mock.calls[0]?.[0] as Record<string, unknown> | undefined;

    expect(dialogProps).toBeDefined();
    expect(Object.hasOwn(dialogProps ?? {}, "open")).toBe(false);
    expect(Object.hasOwn(dialogProps ?? {}, "onOpenChange")).toBe(false);
    expect(footerProps).toBeDefined();
    expect(Object.hasOwn(footerProps ?? {}, "className")).toBe(false);
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
});

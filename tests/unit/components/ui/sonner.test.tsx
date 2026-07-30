import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";

const sonnerSpy = vi.fn((_props: Record<string, unknown>) => <div data-testid="sonner" />);

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => sonnerSpy(props),
}));

describe("Toaster", () => {
  it("follows the app theme and maps every toast type to semantic tokens", () => {
    render(<Toaster position="top-center" richColors />);

    expect(sonnerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "dark",
        position: "top-center",
        richColors: true,
        style: expect.objectContaining({
          "--normal-bg": "var(--popover)",
          "--success-bg": "var(--toast-success-bg)",
          "--info-bg": "var(--toast-info-bg)",
          "--warning-bg": "var(--toast-warning-bg)",
          "--error-bg": "var(--toast-error-bg)",
        }),
      })
    );
  });
});

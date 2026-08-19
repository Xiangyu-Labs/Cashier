import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OTPInput } from "@/modules/auth/ui/otp-input";

describe("OTPInput", () => {
  it("labels every digit with a localized 1-based position", () => {
    const getDigitLabel = vi.fn(
      (position: number, length: number) => `Digit ${position} of ${length}`
    );

    render(<OTPInput value="" onChange={vi.fn()} length={4} getDigitLabel={getDigitLabel} />);

    for (let position = 1; position <= 4; position += 1) {
      expect(screen.getByRole("textbox", { name: `Digit ${position} of 4` })).toBeInTheDocument();
    }
    for (let position = 1; position <= 4; position += 1) {
      expect(getDigitLabel).toHaveBeenCalledWith(position, 4);
    }
  });

  it("uses a six-column responsive layout without fixed-width digits", () => {
    const { container } = render(
      <OTPInput
        value=""
        onChange={vi.fn()}
        getDigitLabel={(position, length) => `Digit ${position} of ${length}`}
      />
    );

    expect(container.firstChild).toHaveClass("grid-cols-6");
    expect(screen.getByRole("textbox", { name: "Digit 1 of 6" })).toHaveClass("w-full");
  });
});

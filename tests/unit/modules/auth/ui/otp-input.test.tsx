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
    expect(getDigitLabel.mock.calls).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });
});

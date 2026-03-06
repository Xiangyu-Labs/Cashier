import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OTPInput } from "@/components/auth/otp-input";

describe("OTPInput", () => {
    it("should render correct number of input fields", () => {
        render(<OTPInput value="" onChange={() => {}} length={6} />);
        const inputs = screen.getAllByRole("textbox");
        expect(inputs.length).toBe(6);
    });

    it("should display value in input fields", () => {
        render(<OTPInput value="123456" onChange={() => {}} length={6} />);
        const inputs = screen.getAllByRole("textbox");
        expect(inputs[0].getAttribute("value")).toBe("1");
        expect(inputs[1].getAttribute("value")).toBe("2");
        expect(inputs[5].getAttribute("value")).toBe("6");
    });

    it("should call onChange when input changes", () => {
        const handleChange = vi.fn();
        render(<OTPInput value="" onChange={handleChange} length={6} />);
        const inputs = screen.getAllByRole("textbox");

        fireEvent.change(inputs[0], { target: { value: "5" } });
        expect(handleChange).toHaveBeenCalledWith("5");
    });

    it("should only accept numeric input", () => {
        const handleChange = vi.fn();
        render(<OTPInput value="" onChange={handleChange} length={6} />);
        const inputs = screen.getAllByRole("textbox");

        fireEvent.change(inputs[0], { target: { value: "a" } });
        expect(handleChange).not.toHaveBeenCalled();
    });

    it("should handle backspace on empty input", () => {
        const handleChange = vi.fn();
        render(<OTPInput value="12" onChange={handleChange} length={6} />);
        const inputs = screen.getAllByRole("textbox");

        fireEvent.keyDown(inputs[2], { key: "Backspace" });
        expect(handleChange).toHaveBeenCalledWith("1");
    });

    it("should handle arrow key navigation", () => {
        render(<OTPInput value="123" onChange={() => {}} length={6} />);
        const inputs = screen.getAllByRole("textbox");

        fireEvent.keyDown(inputs[1], { key: "ArrowLeft" });
        expect(document.activeElement === inputs[0]).toBe(true);

        fireEvent.keyDown(inputs[1], { key: "ArrowRight" });
        expect(document.activeElement === inputs[2]).toBe(true);
    });

    it("should handle paste event", () => {
        const handleChange = vi.fn();
        render(<OTPInput value="" onChange={handleChange} length={6} />);
        const inputs = screen.getAllByRole("textbox");

        fireEvent.paste(inputs[0], {
            clipboardData: {
                getData: () => "123456",
            },
        });

        expect(handleChange).toHaveBeenCalledWith("123456");
    });

    it("should sanitize pasted content", () => {
        const handleChange = vi.fn();
        render(<OTPInput value="" onChange={handleChange} length={6} />);
        const inputs = screen.getAllByRole("textbox");

        fireEvent.paste(inputs[0], {
            clipboardData: {
                getData: () => "12abc345",
            },
        });

        expect(handleChange).toHaveBeenCalledWith("12345");
    });

    it("should disable inputs when disabled prop is true", () => {
        render(<OTPInput value="" onChange={() => {}} length={6} disabled />);
        const inputs = screen.getAllByRole("textbox");

        inputs.forEach(input => {
            expect(input.hasAttribute("disabled")).toBe(true);
        });
    });

    it("should have correct aria labels", () => {
        render(<OTPInput value="" onChange={() => {}} length={6} />);

        expect(screen.getByLabelText("Digit 1 of 6") !== null).toBe(true);
        expect(screen.getByLabelText("Digit 6 of 6") !== null).toBe(true);
    });
});

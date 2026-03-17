"use client";

import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  className?: string;
}

export function OTPInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  className,
}: OTPInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const digits = value.padEnd(length, " ").slice(0, length).split("");

  const handleChange = (index: number, digit: string) => {
    if (disabled) return;

    // Only allow digits
    const sanitized = digit.replace(/\D/g, "");
    if (sanitized === "" && digit !== "") return;

    const newDigits = [...digits];
    newDigits[index] = sanitized.slice(0, 1);
    const newValue = newDigits.join("").trim();
    onChange(newValue);

    // Auto-focus next input
    if (sanitized !== "" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "Backspace") {
      if (digits[index] === " " || digits[index] === "") {
        // If current input is empty, focus previous and delete its value
        if (index > 0) {
          const newDigits = [...digits];
          newDigits[index - 1] = " ";
          onChange(newDigits.join("").trim());
          inputRefs.current[index - 1]?.focus();
        }
      } else {
        // Delete current digit
        const newDigits = [...digits];
        newDigits[index] = " ";
        onChange(newDigits.join("").trim());
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
      e.preventDefault();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    e.preventDefault();
    const pastedData = e.clipboardData.getData("text/plain");
    const sanitized = pastedData.replace(/\D/g, "").slice(0, length);

    if (sanitized !== "") {
      onChange(sanitized);
      // Focus the last filled input or the next empty one
      const nextIndex = Math.min(sanitized.length, length - 1);
      setTimeout(() => {
        inputRefs.current[nextIndex]?.focus();
      }, 0);
    }
  };

  const handleFocus = (index: number) => {
    setFocusedIndex(index);
    // Select the content when focused
    inputRefs.current[index]?.select();
  };

  const handleBlur = () => {
    setFocusedIndex(null);
  };

  return (
    <div className={cn("flex gap-2 justify-center", className)}>
      {digits.map((digit, index) => (
        <Input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          value={digit === " " ? "" : digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={() => handleFocus(index)}
          onBlur={handleBlur}
          disabled={disabled}
          className={cn(
            "w-12 h-14 text-center text-2xl font-bold",
            "transition-all duration-200",
            focusedIndex === index && "ring-2 ring-ring ring-offset-2",
            digit !== " " && "border-primary"
          )}
          aria-label={`Digit ${index + 1} of ${length}`}
        />
      ))}
    </div>
  );
}

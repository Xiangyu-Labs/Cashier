"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

export interface AmountInputProps extends Omit<
  React.ComponentPropsWithoutRef<typeof Input>,
  "type" | "value" | "onChange"
> {
  value: string;
  onChange: (value: string) => void;
  /** Maximum digits allowed after the decimal separator. */
  maxDecimals?: number;
}

/**
 * Plain-text amount field with numeric-keyboard affordance (`inputMode="decimal"`) instead of
 * `type="number"`, which allows scientific notation, silently reformats on blur per the
 * browser's locale, and offers no control over decimal precision.
 */
export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  ({ value, onChange, maxDecimals = 2, ...props }, ref) => {
    const decimalPattern = React.useMemo(
      () => new RegExp(`^\\d*(?:\\.\\d{0,${maxDecimals}})?$`),
      [maxDecimals]
    );

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        pattern={`[0-9]*[.,]?[0-9]{0,${maxDecimals}}`}
        value={value}
        onChange={(event) => {
          const next = event.target.value.replace(",", ".");
          if (decimalPattern.test(next)) onChange(next);
        }}
        {...props}
      />
    );
  }
);
AmountInput.displayName = "AmountInput";

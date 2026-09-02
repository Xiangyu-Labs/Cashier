"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Delete, Check, Equal, Calculator } from "lucide-react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import {
  amountToMinorUnitDigits,
  digitsToAmount,
  digitsToMinorUnitDisplay,
  useCalculatorState,
} from "./use-calculator-state";

interface CalculatorInputProps {
  value: number;
  onChange: (value: number) => void;
  displayClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
  inlineInputMode?: "decimal" | "minor-unit";
}

type EditMode = "display" | "input" | "calculator";

export function CalculatorInput({
  value,
  onChange,
  displayClassName,
  ariaLabel: externalAriaLabel,
  disabled = false,
  inlineInputMode = "decimal",
}: CalculatorInputProps) {
  const t = useTranslations("Calculator");
  const ariaLabel = externalAriaLabel ?? t("amountAriaLabel");
  const [mode, setMode] = React.useState<EditMode>("display");
  const [inputValue, setInputValue] = React.useState<string>("");
  const [inputError, setInputError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const originalInputValueRef = React.useRef("");
  const committedRef = React.useRef(false);

  const calculator = useCalculatorState({
    value,
    onConfirm: (nextValue) => {
      onChange(nextValue);
      setInputError(null);
      setMode("display");
    },
    onInvalid: () => setInputError(t("invalidValue")),
  });

  // Focus input when entering input mode
  React.useEffect(() => {
    if (mode === "input" && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  const confirmInputValue = React.useCallback((): boolean => {
    if (committedRef.current) return true;
    if (inlineInputMode === "minor-unit") {
      onChange(digitsToAmount(inputValue));
      committedRef.current = true;
      setInputError(null);
      setMode("display");
      return true;
    }

    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue) && inputValue.trim() !== "") {
      onChange(parseFloat(numValue.toFixed(2)));
      committedRef.current = true;
      setInputError(null);
      setMode("display");
      return true;
    }

    setInputError(t("invalidValue"));
    return false;
  }, [inlineInputMode, inputValue, onChange, t]);

  React.useEffect(() => {
    if (mode !== "input") return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node) === false) {
        const didCommit = confirmInputValue();
        if (!didCommit) {
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [confirmInputValue, mode]);

  const handleStartInput = () => {
    committedRef.current = false;
    const nextInputValue =
      inlineInputMode === "minor-unit"
        ? value === 0
          ? ""
          : amountToMinorUnitDigits(value)
        : value === 0
          ? ""
          : value.toFixed(2);
    originalInputValueRef.current = nextInputValue;
    setInputValue(nextInputValue);
    setInputError(null);
    setMode("input");
  };

  const handleOpenCalculator = () => {
    calculator.reset();
    setMode("calculator");
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmInputValue();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInputValue(originalInputValueRef.current);
      setInputError(null);
      setMode("display");
    }
  };

  const handleInputBlur = () => {
    const didCommit = confirmInputValue();
    if (!didCommit) requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (inlineInputMode === "minor-unit") {
      const nextDigits = e.target.value.replace(/\D/g, "");
      if (nextDigits === "" && e.target.value !== "") {
        return;
      }
      setInputValue(nextDigits);
      setInputError(null);
      return;
    }

    const newValue = e.target.value;
    if (newValue === "" || /^\d*\.?\d{0,2}$/.test(newValue)) {
      setInputValue(newValue);
      setInputError(null);
    }
  };

  const buttonBase =
    "h-12 rounded-lg font-medium transition-[color,background-color,border-color,opacity,transform] duration-[var(--motion-press)] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
  const numberBtn = cn(buttonBase, "bg-surface2 hover:bg-surface2/80 text-text");
  const operatorBtn = cn(
    buttonBase,
    "bg-primary/10 hover:bg-primary/20 text-primary font-semibold"
  );
  const functionBtn = cn(buttonBase, "bg-muted/10 hover:bg-muted/20 text-muted-foreground");
  const confirmBtn = cn(buttonBase, "bg-primary hover:bg-primary/90 text-white");

  // Display mode: clickable amount
  if (mode === "display") {
    return (
      <button
        type="button"
        className={cn(
          "cursor-pointer hover:opacity-80 transition-opacity",
          displayClassName,
          disabled && "pointer-events-none opacity-50"
        )}
        disabled={disabled}
        onClick={handleStartInput}
        aria-label={ariaLabel}
      >
        <span className="font-mono">{value.toFixed(2)}</span>
      </button>
    );
  }

  // Input mode: inline input with calculator button
  if (mode === "input") {
    return (
      <div ref={containerRef}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            inputMode={inlineInputMode === "minor-unit" ? "numeric" : "decimal"}
            value={
              inlineInputMode === "minor-unit" ? digitsToMinorUnitDisplay(inputValue) : inputValue
            }
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            aria-label={ariaLabel}
            aria-invalid={inputError !== null}
            aria-describedby={inputError === null ? undefined : "calculator-input-error"}
            className={cn(
              "w-32 border-0 bg-transparent p-0 text-center font-mono shadow-none outline-none focus-visible:ring-0",
              displayClassName
            )}
          />
          <button
            type="button"
            onClick={handleOpenCalculator}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
            title={t("openCalculator")}
            aria-label={t("openCalculator")}
          >
            <Calculator className="h-4 w-4" />
          </button>
        </div>
        {inputError === null ? null : (
          <p id="calculator-input-error" role="alert" className="mt-1 text-xs text-destructive">
            {inputError}
          </p>
        )}
      </div>
    );
  }

  // Calculator mode: dialog with calculator
  return (
    <Dialog open={mode === "calculator"} onOpenChange={(open) => !open && setMode("display")}>
      <DialogContent
        variant="modal"
        className="w-72 max-w-[calc(100vw-2rem)] p-4 gap-0 [&>button:last-child]:hidden"
        aria-describedby={undefined}
        onKeyDown={calculator.handleKeyDown}
      >
        <VisuallyHidden.Root>
          <DialogTitle>{t("title")}</DialogTitle>
        </VisuallyHidden.Root>

        {/* Expression Display */}
        <div className="mb-2 h-6 text-right">
          {calculator.expression !== "" && (
            <span className="text-sm text-muted-foreground font-mono truncate block">
              {calculator.expression}
            </span>
          )}
        </div>

        {/* Result Display */}
        <div className="mb-4 text-right">
          <span
            className={cn(
              "text-3xl font-bold font-mono",
              calculator.state.hasResult ? "text-primary" : "text-text"
            )}
          >
            {calculator.state.displayValue}
          </span>
          {inputError === null ? null : (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {inputError}
            </p>
          )}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-4 gap-2">
          <button type="button" onClick={calculator.handleClear} className={functionBtn}>
            AC
          </button>
          <button
            type="button"
            onClick={calculator.handleDelete}
            className={cn(functionBtn, "col-span-2")}
          >
            <Delete className="h-5 w-5 mx-auto" />
          </button>
          <button
            type="button"
            onClick={() => calculator.handleOperator("÷")}
            className={operatorBtn}
          >
            ÷
          </button>

          <button type="button" onClick={() => calculator.handleNumber("7")} className={numberBtn}>
            7
          </button>
          <button type="button" onClick={() => calculator.handleNumber("8")} className={numberBtn}>
            8
          </button>
          <button type="button" onClick={() => calculator.handleNumber("9")} className={numberBtn}>
            9
          </button>
          <button
            type="button"
            onClick={() => calculator.handleOperator("×")}
            className={operatorBtn}
          >
            ×
          </button>

          <button type="button" onClick={() => calculator.handleNumber("4")} className={numberBtn}>
            4
          </button>
          <button type="button" onClick={() => calculator.handleNumber("5")} className={numberBtn}>
            5
          </button>
          <button type="button" onClick={() => calculator.handleNumber("6")} className={numberBtn}>
            6
          </button>
          <button
            type="button"
            onClick={() => calculator.handleOperator("-")}
            className={operatorBtn}
          >
            −
          </button>

          <button type="button" onClick={() => calculator.handleNumber("1")} className={numberBtn}>
            1
          </button>
          <button type="button" onClick={() => calculator.handleNumber("2")} className={numberBtn}>
            2
          </button>
          <button type="button" onClick={() => calculator.handleNumber("3")} className={numberBtn}>
            3
          </button>
          <button
            type="button"
            onClick={() => calculator.handleOperator("+")}
            className={operatorBtn}
          >
            +
          </button>

          <button
            type="button"
            onClick={() => calculator.handleNumber("0")}
            className={cn(numberBtn, "col-span-2")}
          >
            0
          </button>
          <button type="button" onClick={calculator.handleDecimal} className={numberBtn}>
            .
          </button>
          {calculator.showEqualsButton ? (
            <button type="button" onClick={calculator.handleEquals} className={confirmBtn}>
              <Equal className="h-5 w-5 mx-auto" />
            </button>
          ) : (
            <button type="button" onClick={calculator.handleConfirm} className={confirmBtn}>
              <Check className="h-5 w-5 mx-auto" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

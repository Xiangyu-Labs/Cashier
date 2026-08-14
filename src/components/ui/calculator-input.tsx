"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Delete, Check, Equal, Calculator } from "lucide-react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

interface CalculatorInputProps {
  value: number;
  onChange: (value: number) => void;
  displayClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
  inlineInputMode?: "decimal" | "minor-unit";
}

type EditMode = "display" | "input" | "calculator";
type Operator = "+" | "-" | "×" | "÷" | null;

interface CalculatorState {
  displayValue: string;
  operator: Operator;
  operand: string;
  hasResult: boolean;
}

function amountToMinorUnitDigits(value: number): string {
  return Math.max(0, Math.round(value * 100)).toString();
}

function digitsToMinorUnitDisplay(digits: string): string {
  const normalized = digits.replace(/\D/g, "");
  const padded = normalized.padStart(3, "0");
  const rawUnits = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const units = rawUnits === "" ? "0" : rawUnits;
  const cents = padded.slice(-2);
  return `${units}.${cents}`;
}

function digitsToAmount(digits: string): number {
  const normalized = digits.replace(/\D/g, "");
  if (normalized === "") return 0;
  return Number.parseFloat((Number.parseInt(normalized, 10) / 100).toFixed(2));
}

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

  const [calcState, setCalcState] = React.useState<CalculatorState>({
    displayValue: value === 0 ? "0" : value.toFixed(2),
    operator: null,
    operand: "",
    hasResult: false,
  });

  // Focus input when entering input mode
  React.useEffect(() => {
    if (mode === "input" && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  const confirmInputValue = React.useCallback((): boolean => {
    if (inlineInputMode === "minor-unit") {
      onChange(digitsToAmount(inputValue));
      setInputError(null);
      setMode("display");
      return true;
    }

    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue) && inputValue.trim() !== "") {
      onChange(parseFloat(numValue.toFixed(2)));
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
    setCalcState({
      displayValue: value === 0 ? "0" : value.toFixed(2),
      operator: null,
      operand: "",
      hasResult: false,
    });
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

  // Calculator functions
  const formatDisplay = (num: number): string => {
    const fixed = num.toFixed(2);
    if (fixed.includes(".")) {
      return parseFloat(fixed).toString();
    }
    return fixed;
  };

  const calculate = (a: number, op: Operator, b: number): number | null => {
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "×":
        return a * b;
      case "÷":
        return b !== 0 ? a / b : null;
      default:
        return null;
    }
  };

  const handleNumber = (digit: string) => {
    setCalcState((prev) => {
      if (prev.hasResult === true) {
        return { displayValue: digit, operator: null, operand: "", hasResult: false };
      }
      if (prev.operator === null) {
        const newDisplay = prev.displayValue === "0" ? digit : prev.displayValue + digit;
        return { ...prev, displayValue: newDisplay };
      } else {
        const newOperand =
          prev.operand === "" || prev.operand === "0" ? digit : prev.operand + digit;
        return { ...prev, operand: newOperand };
      }
    });
  };

  const handleDecimal = () => {
    setCalcState((prev) => {
      if (prev.hasResult === true) {
        return { displayValue: "0.", operator: null, operand: "", hasResult: false };
      }
      if (prev.operator === null) {
        if (!prev.displayValue.includes(".")) {
          return { ...prev, displayValue: prev.displayValue + "." };
        }
      } else {
        if (!prev.operand.includes(".")) {
          const newOperand = prev.operand === "" ? "0." : prev.operand + ".";
          return { ...prev, operand: newOperand };
        }
      }
      return prev;
    });
  };

  const handleOperator = (op: Operator) => {
    setCalcState((prev) => {
      if (prev.hasResult) {
        return { ...prev, operator: op, operand: "", hasResult: false };
      }
      if (prev.operator !== null && prev.operand !== "") {
        const a = parseFloat(prev.displayValue);
        const b = parseFloat(prev.operand);
        const result = calculate(a, prev.operator, b);
        if (result !== null) {
          return {
            displayValue: formatDisplay(result),
            operator: op,
            operand: "",
            hasResult: false,
          };
        }
      }
      return { ...prev, operator: op, operand: "" };
    });
  };

  const handleEquals = () => {
    setCalcState((prev) => {
      if (prev.operator === null || prev.operand === "") return prev;
      const a = parseFloat(prev.displayValue);
      const b = parseFloat(prev.operand);
      const result = calculate(a, prev.operator, b);
      if (result !== null) {
        return {
          displayValue: formatDisplay(result),
          operator: null,
          operand: "",
          hasResult: true,
        };
      }
      return { displayValue: "Error", operator: null, operand: "", hasResult: true };
    });
  };

  const handleClear = () => {
    setCalcState({ displayValue: "0", operator: null, operand: "", hasResult: false });
  };

  const handleDelete = () => {
    setCalcState((prev) => {
      if (prev.hasResult === true) {
        return {
          displayValue: value === 0 ? "0" : value.toFixed(2),
          operator: null,
          operand: "",
          hasResult: false,
        };
      }
      if (prev.operator === null) {
        const sliced = prev.displayValue.slice(0, -1);
        const newDisplay = sliced === "" || sliced === "." ? "0" : sliced;
        return { ...prev, displayValue: newDisplay };
      } else if (prev.operand !== "") {
        return { ...prev, operand: prev.operand.slice(0, -1) };
      } else {
        return { ...prev, operator: null };
      }
    });
  };

  const handleConfirmCalculator = () => {
    const resultValue = parseFloat(calcState.displayValue);
    if (!isNaN(resultValue) && calcState.displayValue !== "Error") {
      onChange(parseFloat(resultValue.toFixed(2)));
      setInputError(null);
      setMode("display");
      return;
    }
    setInputError(t("invalidValue"));
  };

  const handleSubmitCalculator = () => {
    if (calcState.operator !== null) {
      if (calcState.operand === "") {
        setInputError(t("invalidValue"));
        return;
      }

      const result = calculate(
        parseFloat(calcState.displayValue),
        calcState.operator,
        parseFloat(calcState.operand)
      );
      if (result === null || !Number.isFinite(result)) {
        setCalcState({
          displayValue: "Error",
          operator: null,
          operand: "",
          hasResult: true,
        });
        setInputError(t("invalidValue"));
        return;
      }

      onChange(parseFloat(result.toFixed(2)));
      setInputError(null);
      setMode("display");
      return;
    }

    handleConfirmCalculator();
  };

  const handleCalculatorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLButtonElement) return;

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      handleNumber(event.key);
    } else if (event.key === ".") {
      event.preventDefault();
      handleDecimal();
    } else if (["+", "-", "*", "/"].includes(event.key)) {
      event.preventDefault();
      const operators: Record<string, Exclude<Operator, null>> = {
        "+": "+",
        "-": "-",
        "*": "×",
        "/": "÷",
      };
      handleOperator(operators[event.key]!);
    } else if (event.key === "Backspace") {
      event.preventDefault();
      handleDelete();
    } else if (event.key === "Delete") {
      event.preventDefault();
      handleClear();
    } else if (event.key === "Enter") {
      event.preventDefault();
      handleSubmitCalculator();
    }
  };

  const getExpression = (): string => {
    if (calcState.operator !== null && calcState.operand !== "") {
      return `${calcState.displayValue} ${calcState.operator} ${calcState.operand}`;
    } else if (calcState.operator !== null) {
      return `${calcState.displayValue} ${calcState.operator}`;
    }
    return "";
  };

  const expression = getExpression();
  const hasCompleteExpression = calcState.operator !== null && calcState.operand !== "";
  const showEqualsButton = hasCompleteExpression && calcState.hasResult === false;

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
        onKeyDown={handleCalculatorKeyDown}
      >
        <VisuallyHidden.Root>
          <DialogTitle>{t("title")}</DialogTitle>
        </VisuallyHidden.Root>

        {/* Expression Display */}
        <div className="mb-2 h-6 text-right">
          {expression !== "" && (
            <span className="text-sm text-muted-foreground font-mono truncate block">
              {expression}
            </span>
          )}
        </div>

        {/* Result Display */}
        <div className="mb-4 text-right">
          <span
            className={cn(
              "text-3xl font-bold font-mono",
              calcState.hasResult ? "text-primary" : "text-text"
            )}
          >
            {calcState.displayValue}
          </span>
          {inputError === null ? null : (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {inputError}
            </p>
          )}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-4 gap-2">
          <button type="button" onClick={handleClear} className={functionBtn}>
            AC
          </button>
          <button type="button" onClick={handleDelete} className={cn(functionBtn, "col-span-2")}>
            <Delete className="h-5 w-5 mx-auto" />
          </button>
          <button type="button" onClick={() => handleOperator("÷")} className={operatorBtn}>
            ÷
          </button>

          <button type="button" onClick={() => handleNumber("7")} className={numberBtn}>
            7
          </button>
          <button type="button" onClick={() => handleNumber("8")} className={numberBtn}>
            8
          </button>
          <button type="button" onClick={() => handleNumber("9")} className={numberBtn}>
            9
          </button>
          <button type="button" onClick={() => handleOperator("×")} className={operatorBtn}>
            ×
          </button>

          <button type="button" onClick={() => handleNumber("4")} className={numberBtn}>
            4
          </button>
          <button type="button" onClick={() => handleNumber("5")} className={numberBtn}>
            5
          </button>
          <button type="button" onClick={() => handleNumber("6")} className={numberBtn}>
            6
          </button>
          <button type="button" onClick={() => handleOperator("-")} className={operatorBtn}>
            −
          </button>

          <button type="button" onClick={() => handleNumber("1")} className={numberBtn}>
            1
          </button>
          <button type="button" onClick={() => handleNumber("2")} className={numberBtn}>
            2
          </button>
          <button type="button" onClick={() => handleNumber("3")} className={numberBtn}>
            3
          </button>
          <button type="button" onClick={() => handleOperator("+")} className={operatorBtn}>
            +
          </button>

          <button
            type="button"
            onClick={() => handleNumber("0")}
            className={cn(numberBtn, "col-span-2")}
          >
            0
          </button>
          <button type="button" onClick={handleDecimal} className={numberBtn}>
            .
          </button>
          {showEqualsButton ? (
            <button type="button" onClick={handleEquals} className={confirmBtn}>
              <Equal className="h-5 w-5 mx-auto" />
            </button>
          ) : (
            <button type="button" onClick={handleConfirmCalculator} className={confirmBtn}>
              <Check className="h-5 w-5 mx-auto" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

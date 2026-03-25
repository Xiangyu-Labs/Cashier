"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Delete, Check, Equal, Calculator } from "lucide-react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

interface CalculatorInputProps {
  value: number;
  onChange: (value: number) => void;
  displayClassName?: string;
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
  disabled = false,
  inlineInputMode = "decimal",
}: CalculatorInputProps) {
  const [mode, setMode] = React.useState<EditMode>("display");
  const [inputValue, setInputValue] = React.useState<string>("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

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

  // Initialize input value when entering input mode
  React.useEffect(() => {
    if (mode === "input") {
      if (inlineInputMode === "minor-unit") {
        setInputValue(value === 0 ? "" : amountToMinorUnitDigits(value));
      } else {
        setInputValue(value === 0 ? "" : value.toFixed(2));
      }
    }
  }, [inlineInputMode, mode, value]);

  // Reset calculator state when opening calculator
  React.useEffect(() => {
    if (mode === "calculator") {
      setCalcState({
        displayValue: value === 0 ? "0" : value.toFixed(2),
        operator: null,
        operand: "",
        hasResult: false,
      });
    }
  }, [mode, value]);

  // Handle click outside to cancel input mode
  React.useEffect(() => {
    if (mode !== "input") return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMode("display");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mode]);

  const confirmInputValue = () => {
    if (inlineInputMode === "minor-unit") {
      onChange(digitsToAmount(inputValue));
      setMode("display");
      return;
    }

    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue) && inputValue.trim() !== "") {
      onChange(parseFloat(numValue.toFixed(2)));
    }
    setMode("display");
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      confirmInputValue();
    } else if (e.key === "Escape") {
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
      return;
    }

    const newValue = e.target.value;
    if (newValue === "" || /^\d*\.?\d{0,2}$/.test(newValue)) {
      setInputValue(newValue);
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
        const newDisplay = prev.displayValue.slice(0, -1) ?? "0";
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
    }
    setMode("display");
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
    "h-12 rounded-lg font-medium transition-all duration-100 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
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
        className={cn(
          "cursor-pointer hover:opacity-80 transition-opacity",
          displayClassName,
          disabled && "pointer-events-none opacity-50"
        )}
        disabled={disabled}
        onClick={() => setMode("input")}
      >
        <span className="font-mono">{value.toFixed(2)}</span>
      </button>
    );
  }

  // Input mode: inline input with calculator button
  if (mode === "input") {
    return (
      <div ref={containerRef} className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          inputMode={inlineInputMode === "minor-unit" ? "numeric" : "decimal"}
          value={
            inlineInputMode === "minor-unit" ? digitsToMinorUnitDisplay(inputValue) : inputValue
          }
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          className={cn(
            "w-32 border-0 bg-transparent p-0 text-center font-mono shadow-none outline-none focus-visible:ring-0",
            displayClassName
          )}
        />
        <button
          onClick={() => setMode("calculator")}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
          title="Open calculator"
        >
          <Calculator className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Calculator mode: dialog with calculator
  return (
    <Dialog open={mode === "calculator"} onOpenChange={(open) => !open && setMode("display")}>
      <DialogContent
        className="w-72 max-w-[calc(100vw-2rem)] p-4 gap-0 [&>button:last-child]:hidden"
        aria-describedby={undefined}
      >
        <VisuallyHidden.Root>
          <DialogTitle>Calculator</DialogTitle>
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
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-4 gap-2">
          <button onClick={handleClear} className={functionBtn}>
            AC
          </button>
          <button onClick={handleDelete} className={cn(functionBtn, "col-span-2")}>
            <Delete className="h-5 w-5 mx-auto" />
          </button>
          <button onClick={() => handleOperator("÷")} className={operatorBtn}>
            ÷
          </button>

          <button onClick={() => handleNumber("7")} className={numberBtn}>
            7
          </button>
          <button onClick={() => handleNumber("8")} className={numberBtn}>
            8
          </button>
          <button onClick={() => handleNumber("9")} className={numberBtn}>
            9
          </button>
          <button onClick={() => handleOperator("×")} className={operatorBtn}>
            ×
          </button>

          <button onClick={() => handleNumber("4")} className={numberBtn}>
            4
          </button>
          <button onClick={() => handleNumber("5")} className={numberBtn}>
            5
          </button>
          <button onClick={() => handleNumber("6")} className={numberBtn}>
            6
          </button>
          <button onClick={() => handleOperator("-")} className={operatorBtn}>
            −
          </button>

          <button onClick={() => handleNumber("1")} className={numberBtn}>
            1
          </button>
          <button onClick={() => handleNumber("2")} className={numberBtn}>
            2
          </button>
          <button onClick={() => handleNumber("3")} className={numberBtn}>
            3
          </button>
          <button onClick={() => handleOperator("+")} className={operatorBtn}>
            +
          </button>

          <button onClick={() => handleNumber("0")} className={cn(numberBtn, "col-span-2")}>
            0
          </button>
          <button onClick={handleDecimal} className={numberBtn}>
            .
          </button>
          {showEqualsButton ? (
            <button onClick={handleEquals} className={confirmBtn}>
              <Equal className="h-5 w-5 mx-auto" />
            </button>
          ) : (
            <button onClick={handleConfirmCalculator} className={confirmBtn}>
              <Check className="h-5 w-5 mx-auto" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

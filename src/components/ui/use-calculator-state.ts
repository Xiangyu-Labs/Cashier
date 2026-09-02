"use client";

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";

type Operator = "+" | "-" | "×" | "÷" | null;

interface CalculatorState {
  displayValue: string;
  operator: Operator;
  operand: string;
  hasResult: boolean;
}

interface UseCalculatorStateOptions {
  value: number;
  onConfirm: (value: number) => void;
  onInvalid: () => void;
}

export function amountToMinorUnitDigits(value: number): string {
  return Math.max(0, Math.round(value * 100)).toString();
}

export function digitsToMinorUnitDisplay(digits: string): string {
  const normalized = digits.replace(/\D/g, "");
  const padded = normalized.padStart(3, "0");
  const rawUnits = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const units = rawUnits === "" ? "0" : rawUnits;
  const cents = padded.slice(-2);
  return `${units}.${cents}`;
}

export function digitsToAmount(digits: string): number {
  const normalized = digits.replace(/\D/g, "");
  if (normalized === "") return 0;
  return Number.parseFloat((Number.parseInt(normalized, 10) / 100).toFixed(2));
}

function initialCalculatorState(value: number): CalculatorState {
  return {
    displayValue: value === 0 ? "0" : value.toFixed(2),
    operator: null,
    operand: "",
    hasResult: false,
  };
}

function formatDisplay(value: number): string {
  return Number.parseFloat(value.toFixed(2)).toString();
}

function calculate(a: number, operator: Operator, b: number): number | null {
  switch (operator) {
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
}

export function useCalculatorState({ value, onConfirm, onInvalid }: UseCalculatorStateOptions) {
  const [state, setState] = useState<CalculatorState>(() => initialCalculatorState(value));

  const reset = useCallback(() => {
    setState(initialCalculatorState(value));
  }, [value]);

  const handleNumber = useCallback((digit: string) => {
    setState((previous) => {
      if (previous.hasResult) {
        return { displayValue: digit, operator: null, operand: "", hasResult: false };
      }
      if (previous.operator === null) {
        const displayValue = previous.displayValue === "0" ? digit : previous.displayValue + digit;
        return { ...previous, displayValue };
      }
      const operand =
        previous.operand === "" || previous.operand === "0" ? digit : previous.operand + digit;
      return { ...previous, operand };
    });
  }, []);

  const handleDecimal = useCallback(() => {
    setState((previous) => {
      if (previous.hasResult) {
        return { displayValue: "0.", operator: null, operand: "", hasResult: false };
      }
      if (previous.operator === null && !previous.displayValue.includes(".")) {
        return { ...previous, displayValue: `${previous.displayValue}.` };
      }
      if (previous.operator !== null && !previous.operand.includes(".")) {
        return {
          ...previous,
          operand: previous.operand === "" ? "0." : `${previous.operand}.`,
        };
      }
      return previous;
    });
  }, []);

  const handleOperator = useCallback((operator: Exclude<Operator, null>) => {
    setState((previous) => {
      if (previous.hasResult) {
        return { ...previous, operator, operand: "", hasResult: false };
      }
      if (previous.operator !== null && previous.operand !== "") {
        const result = calculate(
          Number.parseFloat(previous.displayValue),
          previous.operator,
          Number.parseFloat(previous.operand)
        );
        if (result !== null) {
          return {
            displayValue: formatDisplay(result),
            operator,
            operand: "",
            hasResult: false,
          };
        }
      }
      return { ...previous, operator, operand: "" };
    });
  }, []);

  const handleEquals = useCallback(() => {
    setState((previous) => {
      if (previous.operator === null || previous.operand === "") return previous;
      const result = calculate(
        Number.parseFloat(previous.displayValue),
        previous.operator,
        Number.parseFloat(previous.operand)
      );
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
  }, []);

  const handleClear = useCallback(() => {
    setState({ displayValue: "0", operator: null, operand: "", hasResult: false });
  }, []);

  const handleDelete = useCallback(() => {
    setState((previous) => {
      if (previous.hasResult) return initialCalculatorState(value);
      if (previous.operator === null) {
        const sliced = previous.displayValue.slice(0, -1);
        const displayValue = sliced === "" || sliced === "." ? "0" : sliced;
        return { ...previous, displayValue };
      }
      if (previous.operand !== "") {
        return { ...previous, operand: previous.operand.slice(0, -1) };
      }
      return { ...previous, operator: null };
    });
  }, [value]);

  const handleConfirm = useCallback(() => {
    const resultValue = Number.parseFloat(state.displayValue);
    if (Number.isNaN(resultValue) || state.displayValue === "Error") {
      onInvalid();
      return;
    }
    onConfirm(Number.parseFloat(resultValue.toFixed(2)));
  }, [onConfirm, onInvalid, state.displayValue]);

  const handleSubmit = useCallback(() => {
    if (state.operator === null) {
      handleConfirm();
      return;
    }
    if (state.operand === "") {
      onInvalid();
      return;
    }
    const result = calculate(
      Number.parseFloat(state.displayValue),
      state.operator,
      Number.parseFloat(state.operand)
    );
    if (result === null || !Number.isFinite(result)) {
      setState({ displayValue: "Error", operator: null, operand: "", hasResult: true });
      onInvalid();
      return;
    }
    onConfirm(Number.parseFloat(result.toFixed(2)));
  }, [handleConfirm, onConfirm, onInvalid, state.displayValue, state.operand, state.operator]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
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
        handleSubmit();
      }
    },
    [handleClear, handleDecimal, handleDelete, handleNumber, handleOperator, handleSubmit]
  );

  const expression = useMemo(() => {
    if (state.operator !== null && state.operand !== "") {
      return `${state.displayValue} ${state.operator} ${state.operand}`;
    }
    if (state.operator !== null) return `${state.displayValue} ${state.operator}`;
    return "";
  }, [state.displayValue, state.operand, state.operator]);

  return {
    state,
    expression,
    showEqualsButton: state.operator !== null && state.operand !== "" && !state.hasResult,
    reset,
    handleNumber,
    handleDecimal,
    handleOperator,
    handleEquals,
    handleClear,
    handleDelete,
    handleConfirm,
    handleKeyDown,
  };
}

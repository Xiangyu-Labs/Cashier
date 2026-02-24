"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Delete, Check, Equal } from "lucide-react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

interface CalculatorInputProps {
    value: number;
    onChange: (value: number) => void;
    displayClassName?: string;
    disabled?: boolean;
}

type Operator = "+" | "-" | "×" | "÷" | null;

interface CalculatorState {
    displayValue: string;
    operator: Operator;
    operand: string;
    hasResult: boolean;
}

export function CalculatorInput({
    value,
    onChange,
    displayClassName,
    disabled = false,
}: CalculatorInputProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [state, setState] = React.useState<CalculatorState>({
        displayValue: value === 0 ? "0" : value.toFixed(2),
        operator: null,
        operand: "",
        hasResult: false,
    });

    // Reset state when opening with new value
    React.useEffect(() => {
        if (isOpen) {
            setState({
                displayValue: value === 0 ? "0" : value.toFixed(2),
                operator: null,
                operand: "",
                hasResult: false,
            });
        }
    }, [isOpen, value]);

    const formatDisplay = (num: number): string => {
        const fixed = num.toFixed(2);
        if (fixed.includes(".")) {
            return parseFloat(fixed).toString();
        }
        return fixed;
    };

    const calculate = (a: number, op: Operator, b: number): number | null => {
        switch (op) {
            case "+": return a + b;
            case "-": return a - b;
            case "×": return a * b;
            case "÷": return b !== 0 ? a / b : null;
            default: return null;
        }
    };

    const handleNumber = (digit: string) => {
        setState(prev => {
            if (prev.hasResult) {
                return { displayValue: digit, operator: null, operand: "", hasResult: false };
            }
            if (!prev.operator) {
                const newDisplay = prev.displayValue === "0" ? digit : prev.displayValue + digit;
                return { ...prev, displayValue: newDisplay };
            } else {
                const newOperand = prev.operand === "" || prev.operand === "0" ? digit : prev.operand + digit;
                return { ...prev, operand: newOperand };
            }
        });
    };

    const handleDecimal = () => {
        setState(prev => {
            if (prev.hasResult) {
                return { displayValue: "0.", operator: null, operand: "", hasResult: false };
            }
            if (!prev.operator) {
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
        setState(prev => {
            if (prev.hasResult) {
                return { ...prev, operator: op, operand: "", hasResult: false };
            }
            if (prev.operator && prev.operand) {
                const a = parseFloat(prev.displayValue);
                const b = parseFloat(prev.operand);
                const result = calculate(a, prev.operator, b);
                if (result !== null) {
                    return { displayValue: formatDisplay(result), operator: op, operand: "", hasResult: false };
                }
            }
            return { ...prev, operator: op, operand: "" };
        });
    };

    const handleEquals = () => {
        setState(prev => {
            if (!prev.operator || !prev.operand) return prev;
            const a = parseFloat(prev.displayValue);
            const b = parseFloat(prev.operand);
            const result = calculate(a, prev.operator, b);
            if (result !== null) {
                return { displayValue: formatDisplay(result), operator: null, operand: "", hasResult: true };
            }
            return { displayValue: "Error", operator: null, operand: "", hasResult: true };
        });
    };

    const handleClear = () => {
        setState({ displayValue: "0", operator: null, operand: "", hasResult: false });
    };

    const handleDelete = () => {
        setState(prev => {
            if (prev.hasResult) {
                return { displayValue: value === 0 ? "0" : value.toFixed(2), operator: null, operand: "", hasResult: false };
            }
            if (!prev.operator) {
                const newDisplay = prev.displayValue.slice(0, -1) || "0";
                return { ...prev, displayValue: newDisplay };
            } else if (prev.operand) {
                return { ...prev, operand: prev.operand.slice(0, -1) };
            } else {
                return { ...prev, operator: null };
            }
        });
    };

    const handleConfirm = () => {
        const resultValue = parseFloat(state.displayValue);
        if (!isNaN(resultValue) && state.displayValue !== "Error") {
            onChange(parseFloat(resultValue.toFixed(2)));
        }
        setIsOpen(false);
    };

    const getExpression = (): string => {
        if (state.operator && state.operand) {
            return `${state.displayValue} ${state.operator} ${state.operand}`;
        } else if (state.operator) {
            return `${state.displayValue} ${state.operator}`;
        }
        return "";
    };

    const expression = getExpression();
    const hasCompleteExpression = state.operator !== null && state.operand !== "";
    const showEqualsButton = hasCompleteExpression && !state.hasResult;

    const buttonBase = "h-12 rounded-lg font-medium transition-all duration-100 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
    const numberBtn = cn(buttonBase, "bg-surface2 hover:bg-surface2/80 text-text");
    const operatorBtn = cn(buttonBase, "bg-primary/10 hover:bg-primary/20 text-primary font-semibold");
    const functionBtn = cn(buttonBase, "bg-muted/10 hover:bg-muted/20 text-muted-foreground");
    const confirmBtn = cn(buttonBase, "bg-primary hover:bg-primary/90 text-white");

    return (
        <>
            <button
                className={cn(
                    "cursor-pointer hover:opacity-80 transition-opacity",
                    displayClassName,
                    disabled && "pointer-events-none opacity-50"
                )}
                disabled={disabled}
                onClick={() => setIsOpen(true)}
            >
                <span className="font-mono">{value.toFixed(2)}</span>
            </button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="w-72 max-w-[calc(100vw-2rem)] p-4 gap-0 [&>button:last-child]:hidden" aria-describedby={undefined}>
                    <VisuallyHidden.Root>
                        <DialogTitle>Calculator</DialogTitle>
                    </VisuallyHidden.Root>

                    {/* Expression Display */}
                    <div className="mb-2 h-6 text-right">
                        {expression && (
                            <span className="text-sm text-muted-foreground font-mono truncate block">
                                {expression}
                            </span>
                        )}
                    </div>

                    {/* Result Display */}
                    <div className="mb-4 text-right">
                        <span className={cn(
                            "text-3xl font-bold font-mono",
                            state.hasResult ? "text-primary" : "text-text"
                        )}>
                            {state.displayValue}
                        </span>
                    </div>

                    {/* Keypad */}
                    <div className="grid grid-cols-4 gap-2">
                        <button onClick={handleClear} className={functionBtn}>AC</button>
                        <button onClick={handleDelete} className={cn(functionBtn, "col-span-2")}>
                            <Delete className="h-5 w-5 mx-auto" />
                        </button>
                        <button onClick={() => handleOperator("÷")} className={operatorBtn}>÷</button>

                        <button onClick={() => handleNumber("7")} className={numberBtn}>7</button>
                        <button onClick={() => handleNumber("8")} className={numberBtn}>8</button>
                        <button onClick={() => handleNumber("9")} className={numberBtn}>9</button>
                        <button onClick={() => handleOperator("×")} className={operatorBtn}>×</button>

                        <button onClick={() => handleNumber("4")} className={numberBtn}>4</button>
                        <button onClick={() => handleNumber("5")} className={numberBtn}>5</button>
                        <button onClick={() => handleNumber("6")} className={numberBtn}>6</button>
                        <button onClick={() => handleOperator("-")} className={operatorBtn}>−</button>

                        <button onClick={() => handleNumber("1")} className={numberBtn}>1</button>
                        <button onClick={() => handleNumber("2")} className={numberBtn}>2</button>
                        <button onClick={() => handleNumber("3")} className={numberBtn}>3</button>
                        <button onClick={() => handleOperator("+")} className={operatorBtn}>+</button>

                        <button onClick={() => handleNumber("0")} className={cn(numberBtn, "col-span-2")}>0</button>
                        <button onClick={handleDecimal} className={numberBtn}>.</button>
                        {showEqualsButton ? (
                            <button onClick={handleEquals} className={confirmBtn}>
                                <Equal className="h-5 w-5 mx-auto" />
                            </button>
                        ) : (
                            <button onClick={handleConfirm} className={confirmBtn}>
                                <Check className="h-5 w-5 mx-auto" />
                            </button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

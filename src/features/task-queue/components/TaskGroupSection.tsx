"use client";

import { type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface TaskGroupSectionProps {
    title: string;
    count: number;
    color: "muted" | "primary" | "red" | "amber" | "green";
    collapsed: boolean;
    onToggle: () => void;
    actions?: ReactNode;
    children: ReactNode;
}

const colorClasses = {
    muted: {
        dot: "bg-muted-foreground",
        text: "text-muted-foreground",
        icon: "text-muted-foreground",
    },
    primary: {
        dot: "bg-primary animate-pulse",
        text: "text-primary",
        icon: "text-primary",
    },
    red: {
        dot: "bg-red-500",
        text: "text-red-500",
        icon: "text-red-500",
    },
    amber: {
        dot: "bg-amber-500",
        text: "text-amber-600",
        icon: "text-amber-600",
    },
    green: {
        dot: "bg-green-500",
        text: "text-green-600",
        icon: "text-green-600",
    },
};

export function TaskGroupSection({
    title,
    count,
    color,
    collapsed,
    onToggle,
    actions,
    children,
}: TaskGroupSectionProps) {
    const colors = colorClasses[color];

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
                <div
                    className="flex items-center gap-2 cursor-pointer select-none"
                    onClick={onToggle}
                >
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className={`text-sm font-medium ${colors.text}`}>
                        {title} ({count})
                    </span>
                    <motion.div
                        animate={{ rotate: collapsed ? -90 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <ChevronDown className={`w-3.5 h-3.5 ${colors.icon}`} />
                    </motion.div>
                </div>

                {!collapsed && actions && (
                    <div className="flex items-center gap-1">
                        {actions}
                    </div>
                )}
            </div>

            <AnimatePresence>
                {!collapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="space-y-2 overflow-hidden"
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

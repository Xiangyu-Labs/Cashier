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
    dot: "bg-danger",
    text: "text-danger",
    icon: "text-danger",
  },
  amber: {
    dot: "bg-warning",
    text: "text-warning",
    icon: "text-warning",
  },
  green: {
    dot: "bg-success",
    text: "text-success",
    icon: "text-success",
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
        <div className="flex cursor-pointer select-none items-center gap-2" onClick={onToggle}>
          <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
          <span className={`text-sm font-medium ${colors.text}`}>
            {title} ({count})
          </span>
          <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className={`h-3.5 w-3.5 ${colors.icon}`} />
          </motion.div>
        </div>

        {!collapsed && actions !== undefined && (
          <div className="flex items-center gap-1">{actions}</div>
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

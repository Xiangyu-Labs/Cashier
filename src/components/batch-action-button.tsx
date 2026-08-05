"use client";

import type { ComponentType, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BatchActionButtonProps extends Omit<ButtonProps, "children"> {
  icon: ComponentType<{ className?: string }>;
  loading?: boolean;
  children: ReactNode;
}

/**
 * Shared visual contract for batch actions across stream, details, and
 * source-document detail views.
 */
export function BatchActionButton({
  icon: Icon,
  loading = false,
  children,
  className,
  disabled,
  ...props
}: BatchActionButtonProps) {
  return (
    <Button
      size="sm"
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn("h-9 gap-1.5 px-3 text-sm", className)}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      <span>{children}</span>
    </Button>
  );
}

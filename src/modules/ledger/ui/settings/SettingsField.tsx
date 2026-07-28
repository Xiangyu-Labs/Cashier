import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsFieldProps {
  title: string;
  description?: string;
  stacked?: boolean;
  children: ReactNode;
}

export function SettingsField({
  title,
  description,
  stacked = false,
  children,
}: SettingsFieldProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        !stacked && "sm:flex-row sm:items-center sm:justify-between"
      )}
    >
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-text">{title}</h3>
        {description != null && description !== "" && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className={cn(stacked ? "w-full" : "sm:max-w-md")}>{children}</div>
    </div>
  );
}

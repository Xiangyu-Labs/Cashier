import type { ReactNode } from "react";

interface SettingsFieldProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsField({ title, description, children }: SettingsFieldProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-text">{title}</h3>
        {description != null && description !== "" && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="sm:max-w-md">{children}</div>
    </div>
  );
}

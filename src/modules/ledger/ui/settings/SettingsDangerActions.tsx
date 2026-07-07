import type { ReactNode } from "react";

interface SettingsDangerActionsProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function SettingsDangerActions({
  title,
  description,
  children,
}: SettingsDangerActionsProps) {
  return (
    <div className="rounded-lg border border-danger/30 bg-surface p-4">
      <div>
        <h3 className="text-sm font-semibold text-danger">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

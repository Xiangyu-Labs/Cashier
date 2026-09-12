import type { ReactNode } from "react";
import { textRoleClassName } from "@/components/typography";

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className={textRoleClassName("sectionTitle")}>{title}</h2>
        {description != null && description !== "" && (
          <p className={textRoleClassName("bodyMuted", "mt-1")}>{description}</p>
        )}
      </div>
      <div className="[&>*+*]:mt-4 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-4">
        {children}
      </div>
    </section>
  );
}

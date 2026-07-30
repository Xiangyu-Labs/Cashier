"use client";

import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const toasterStyle = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--success-bg": "var(--toast-success-bg)",
  "--success-border": "var(--toast-success-border)",
  "--success-text": "var(--toast-success-text)",
  "--info-bg": "var(--toast-info-bg)",
  "--info-border": "var(--toast-info-border)",
  "--info-text": "var(--toast-info-text)",
  "--warning-bg": "var(--toast-warning-bg)",
  "--warning-border": "var(--toast-warning-border)",
  "--warning-text": "var(--toast-warning-text)",
  "--error-bg": "var(--toast-error-bg)",
  "--error-border": "var(--toast-error-border)",
  "--error-text": "var(--toast-error-text)",
  "--border-radius": "var(--radius-lg)",
} as CSSProperties;

export function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();
  const toasterTheme = theme as NonNullable<ToasterProps["theme"]>;

  return <Sonner theme={toasterTheme} className="toaster" style={toasterStyle} {...props} />;
}

"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function AdminShell(props: {
  kicker: string;
  title: string;
  description: string;
  navItems: Array<{ href: string; label: string }>;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm font-medium text-primary">{props.kicker}</p>
          <h1 className="mt-2 text-2xl font-semibold text-text">{props.title}</h1>
          <p className="mt-2 text-sm text-muted">{props.description}</p>
        </header>

        <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-border bg-surface p-2">
          {props.navItems.map((item) => {
            const isActive = pathname === item.href || pathname.endsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-white" : "text-text hover:bg-surface2"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {props.children}
      </div>
    </div>
  );
}

import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";

export function AdminUnauthorizedState(props: {
  title: string;
  description: string;
  ctaLabel: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning/10 text-warning">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="mt-6 space-y-2">
          <h2 className="text-xl font-semibold text-text">{props.title}</h2>
          <p className="text-sm leading-6 text-muted">{props.description}</p>
        </div>
        <Button variant="outline" className="mt-6 w-full" asChild>
          <Link href="/">{props.ctaLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

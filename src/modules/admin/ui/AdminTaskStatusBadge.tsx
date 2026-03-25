import { Badge } from "@/components/ui/badge";
import type { AdminTaskStatus } from "@/modules/admin/contracts";

const variantByStatus: Record<AdminTaskStatus, "default" | "warning" | "info" | "error" | "outline"> = {
  failed: "error",
  running: "info",
  pending: "warning",
  completed: "default",
  cancelled: "outline",
};

export function AdminTaskStatusBadge(props: { status: AdminTaskStatus; label: string }) {
  return (
    <Badge variant={variantByStatus[props.status]} size="sm">
      {props.label}
    </Badge>
  );
}

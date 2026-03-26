import { Badge } from "@/components/ui/badge";
import type { AdminSourceDocumentStatus } from "@/modules/admin/contracts";

const variantByStatus: Record<
  AdminSourceDocumentStatus,
  "default" | "success" | "warning" | "info" | "error" | "outline"
> = {
  queued: "warning",
  processing: "info",
  completed: "success",
  anomaly: "outline",
  failed: "error",
  deleted: "outline",
};

export function AdminSourceDocumentStatusBadge(props: {
  status: AdminSourceDocumentStatus;
  label: string;
}) {
  return (
    <Badge variant={variantByStatus[props.status]} size="sm">
      {props.label}
    </Badge>
  );
}

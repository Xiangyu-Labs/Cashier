import { Clock, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { QueueItemStatus } from "@/modules/task-queue/contracts";

interface StatusIconProps {
  status: QueueItemStatus;
}

export function StatusIcon({ status }: StatusIconProps) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-danger" />;
    case "anomaly":
      return <AlertTriangle className="h-3.5 w-3.5 text-warning" />;
    case "pending":
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

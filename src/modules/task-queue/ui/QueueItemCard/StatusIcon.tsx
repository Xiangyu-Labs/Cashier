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
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case "anomaly":
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    case "pending":
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

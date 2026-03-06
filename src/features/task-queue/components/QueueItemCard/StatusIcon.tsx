/**
 * Status Icon Component
 *
 * Displays the appropriate icon for a queue item status.
 */

import { Clock, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { QueueItemStatus } from "../../types";

interface StatusIconProps {
  status: QueueItemStatus;
}

export function StatusIcon({ status }: StatusIconProps) {
  switch (status) {
    case "running":
      return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
    case "completed":
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case "failed":
      return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    case "anomaly":
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
    case "pending":
    default:
      return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

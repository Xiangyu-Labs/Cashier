"use client";

import type { EntryFilters } from "@/modules/ledger/ui";
import type { LedgerTab } from "@/modules/workspace/tabs";
import { EntriesTabSkeleton } from "@/components/skeletons/TabSkeletons";
import { OfflineLedgerView } from "./OfflineLedgerView";
import { useConnectionState } from "./connection-state";

interface ConnectionAwareLedgerFallbackProps {
  snapshotKey: string;
  activeTab: LedgerTab;
  initialFilters: EntryFilters;
}

export function ConnectionAwareLedgerFallback(props: ConnectionAwareLedgerFallbackProps) {
  const { networkStatus } = useConnectionState();
  return networkStatus === "offline" ? <OfflineLedgerView {...props} /> : <EntriesTabSkeleton />;
}

import { useMemo } from "react";
import { InteractiveUnifiedGroups, StaticUnifiedGroups } from "./unified-stream/renderers";
import type { UnifiedStreamGroupProps } from "./unified-stream/types";

export type { UnifiedStreamGroupProps } from "./unified-stream/types";

export function LedgerEntriesUnifiedGroups({
  readOnly = false,
  disableUnselected = false,
  collapseEntriesDefault = false,
  ...props
}: UnifiedStreamGroupProps) {
  const selectedIdSet = useMemo(() => new Set(props.selectedIds), [props.selectedIds]);
  if (props.streamGroups.length === 0) {
    return (
      <div className="space-y-6 pt-2">
        <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
          <span>{props.noRecordsText}</span>
        </div>
      </div>
    );
  }

  const rendererProps = {
    ...props,
    selectedIdSet,
    disableUnselected,
    collapseEntriesDefault,
  };

  if (readOnly) {
    return <StaticUnifiedGroups {...rendererProps} readOnly />;
  }
  return <InteractiveUnifiedGroups {...rendererProps} />;
}

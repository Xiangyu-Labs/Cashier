"use client";

import { useCallback, useState } from "react";
import { INITIAL_TASK_QUEUE_COLLAPSED_STATE } from "./taskQueueModal.types";

type TaskQueueSection = keyof typeof INITIAL_TASK_QUEUE_COLLAPSED_STATE;

export function useTaskQueueSectionState() {
  const [collapsedSections, setCollapsedSections] = useState(INITIAL_TASK_QUEUE_COLLAPSED_STATE);

  const setSectionCollapsed = useCallback((section: TaskQueueSection, value: boolean) => {
    setCollapsedSections((previous) => ({ ...previous, [section]: value }));
  }, []);

  return {
    isPendingCollapsed: collapsedSections.pending,
    isRunningCollapsed: collapsedSections.running,
    isFailedCollapsed: collapsedSections.failed,
    isAnomalyCollapsed: collapsedSections.anomaly,
    isCompletedCollapsed: collapsedSections.completed,
    setIsPendingCollapsed: (value: boolean) => setSectionCollapsed("pending", value),
    setIsRunningCollapsed: (value: boolean) => setSectionCollapsed("running", value),
    setIsFailedCollapsed: (value: boolean) => setSectionCollapsed("failed", value),
    setIsAnomalyCollapsed: (value: boolean) => setSectionCollapsed("anomaly", value),
    setIsCompletedCollapsed: (value: boolean) => setSectionCollapsed("completed", value),
  };
}

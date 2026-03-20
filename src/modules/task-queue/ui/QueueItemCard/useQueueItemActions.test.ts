import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "@/modules/task-queue/contracts";
import { useQueueItemActions } from "./useQueueItemActions";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `translated:${key}`,
}));

function createItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "item-1",
    kind: "task",
    status: "failed",
    title: "Default title",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("useQueueItemActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses translated task type title for non-completed parse tasks", () => {
    const item = createItem({
      status: "running",
      taskType: "parse_source_document",
      title: "Original",
    });
    const { result } = renderHook(() =>
      useQueueItemActions({
        item,
        onCancel: vi.fn(),
      })
    );

    expect(result.current.displayTitle).toBe("translated:taskType_parse_source_document");
  });

  it("keeps original title for completed parse_source_document tasks", () => {
    const item = createItem({
      status: "completed",
      taskType: "parse_source_document",
      title: "Completed Title",
    });
    const { result } = renderHook(() =>
      useQueueItemActions({
        item,
        onViewDetails: vi.fn(),
      })
    );

    expect(result.current.displayTitle).toBe("Completed Title");
    expect(result.current.useSpecialInteraction).toBe(true);
  });

  it("computes action visibility flags from item status and handlers", () => {
    const item = createItem({
      status: "running",
      taskType: "parse_source_document",
      entityType: undefined,
      entityId: undefined,
      subtitle: "running subtitle",
      progress: "50%",
    });
    const { result } = renderHook(() =>
      useQueueItemActions({
        item,
        onCancel: vi.fn(),
        onRetry: vi.fn(),
        onDelete: vi.fn(),
        onDismiss: vi.fn(),
      })
    );

    expect(result.current.canCancel).toBe(true);
    expect(result.current.showDirectCancel).toBe(true);
    expect(result.current.showDropdown).toBe(true);
    expect(result.current.canExpand).toBe(false);
    expect(result.current.showSubtitleInline).toBe(true);
    expect(result.current.showProgressInline).toBe(true);
  });

  it("handles async retry and dismiss loading states", async () => {
    let resolveRetry: (() => void) | null = null;
    let resolveDismiss: (() => void) | null = null;

    const onRetry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        })
    );
    const onDismiss = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDismiss = resolve;
        })
    );
    const item = createItem({
      status: "failed",
      taskType: "parse_source_document",
      entityType: undefined,
      entityId: undefined,
    });

    const { result } = renderHook(() =>
      useQueueItemActions({
        item,
        onRetry,
        onDismiss,
      })
    );

    const retryPromise = result.current.handleRetry();
    await waitFor(() => expect(result.current.isRetrying).toBe(true));
    resolveRetry?.();
    await act(async () => {
      await retryPromise;
    });
    await waitFor(() => expect(result.current.isRetrying).toBe(false));

    const dismissPromise = result.current.handleDismiss();
    await waitFor(() => expect(result.current.isDismissing).toBe(true));
    resolveDismiss?.();
    await act(async () => {
      await dismissPromise;
    });
    await waitFor(() => expect(result.current.isDismissing).toBe(false));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

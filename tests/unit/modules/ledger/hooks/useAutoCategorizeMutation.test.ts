import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { queryKeys } from "@/lib/query-keys";

const {
  invalidateQueriesMock,
  submitAutoCategorizeActionMock,
  useLedgerMutationMock,
} = vi.hoisted(() => {
  const invalidateQueriesMock = vi.fn().mockResolvedValue(undefined);
  const submitAutoCategorizeActionMock = vi
    .fn()
    .mockResolvedValue({ submittedCount: 3, skippedCount: 1 });

  return {
    invalidateQueriesMock,
    submitAutoCategorizeActionMock,
    useLedgerMutationMock: vi.fn(
      (_ledgerId: string, options: Record<string, unknown>) =>
        ({
          mutateAsync: async () => {
            const data = await (
              options.mutationFn as () => Promise<{ submittedCount: number; skippedCount: number }>
            )();
            await (
              options.onSettledExtra as (
                queryClient: { invalidateQueries: typeof invalidateQueriesMock },
                variables: void,
                data: { submittedCount: number; skippedCount: number },
                error: Error | null
              ) => Promise<void>
            )(
              { invalidateQueries: invalidateQueriesMock },
              undefined,
              data,
              null
            );
            return data;
          },
          isPending: false,
        }) satisfies { mutateAsync: () => Promise<unknown>; isPending: boolean }
    ),
  };
});

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/mutations/use-ledger-mutation", () => ({
  useLedgerMutation: useLedgerMutationMock,
}));

vi.mock("@/modules/ledger/actions", () => ({
  submitAutoCategorizeAction: submitAutoCategorizeActionMock,
}));

import { useAutoCategorizeMutation } from "@/modules/ledger/hooks/useAutoCategorizeMutation";

describe("useAutoCategorizeMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitAutoCategorizeActionMock.mockResolvedValue({ submittedCount: 3, skippedCount: 1 });
  });

  it("invalidates uncategorized count and task queue in onSettled", async () => {
    const { result } = renderHook(() => useAutoCategorizeMutation("ledger-1"));

    await result.current.mutateAsync();

    expect(submitAutoCategorizeActionMock).toHaveBeenCalledWith("ledger-1");
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.uncategorizedCount("ledger-1"),
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.taskQueue("ledger-1"),
    });
  });
});

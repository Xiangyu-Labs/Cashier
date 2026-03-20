import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { queryKeys } from "@/lib/query-keys";
import type { EntryCategoryWithCount, Ledger } from "@/types/api";

const {
  fireAndForgetMock,
  getEntryCategoriesActionMock,
  getLedgerActionMock,
  getLedgerSettingsActionMock,
  mutationOptions,
  useLedgerMutationMock,
  useQueryMock,
} = vi.hoisted(() => ({
  fireAndForgetMock: vi.fn(),
  getEntryCategoriesActionMock: vi.fn(),
  getLedgerActionMock: vi.fn(),
  getLedgerSettingsActionMock: vi.fn(),
  mutationOptions: [] as Array<Record<string, unknown>>,
  useLedgerMutationMock: vi.fn((_ledgerId: string, options: Record<string, unknown>) => {
    mutationOptions.push(options);
    return { mutate: vi.fn(), isPending: false };
  }),
  useQueryMock: vi.fn(),
}));

const cache = new Map<string, unknown>();
const invalidateQueriesMock = vi.fn().mockResolvedValue(undefined);
const queryClientMock = {
  getQueryData: vi.fn((key: readonly unknown[]) => cache.get(JSON.stringify(key))),
  getQueriesData: vi.fn(({ queryKey }: { queryKey: readonly unknown[] }) => {
    const value = cache.get(JSON.stringify(queryKey));
    return value === undefined ? [] : [[queryKey, value]];
  }),
  setQueryData: vi.fn((key: readonly unknown[], updater: unknown) => {
    const cacheKey = JSON.stringify(key);
    const current = cache.get(cacheKey);
    cache.set(
      cacheKey,
      typeof updater === "function" ? (updater as (old: unknown) => unknown)(current) : updater
    );
  }),
  invalidateQueries: invalidateQueriesMock,
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
  useQueryClient: () => queryClientMock,
}));

vi.mock("@/lib/mutations/use-ledger-mutation", () => ({
  useLedgerMutation: useLedgerMutationMock,
}));

vi.mock("@/modules/ledger/actions", () => ({
  updateLedgerAction: vi.fn(),
  getLedgerAction: getLedgerActionMock,
  getLedgerSettingsAction: getLedgerSettingsActionMock,
  getEntryCategoriesAction: getEntryCategoriesActionMock,
}));

vi.mock("@/lib/safe-async", () => ({
  fireAndForget: fireAndForgetMock,
}));

import { useLedgerSettings } from "./useLedgerSettings";

function getOption(index: number) {
  const option = mutationOptions[index];
  if (option == null) {
    throw new Error(`Missing mutation option ${index}`);
  }
  return option;
}

describe("useLedgerSettings", () => {
  const ledgerId = "ledger-1";
  const initialLedger: Ledger = {
    id: ledgerId,
    userId: "user-1",
    metadata: { settings: { mainCurrency: "CNY", currencies: ["CNY"] } },
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    deletedAt: null,
  };
  const initialCategories: EntryCategoryWithCount[] = [
    {
      id: "cat-1",
      ledgerId,
      name: "餐饮",
      description: null,
      icon: null,
      sortOrder: 1,
      isEditable: true,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      deletedAt: null,
      entryCount: 1,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mutationOptions.length = 0;
    cache.clear();
    cache.set(JSON.stringify(queryKeys.ledger(ledgerId)), initialLedger);
    useQueryMock.mockImplementation(({ queryKey, initialData }: { queryKey: readonly unknown[]; initialData?: unknown }) => {
      if (queryKey[0] === "ledgerSettings") {
        return {
          data: {
            uncategorizedCount: 2,
            credentials: [{ id: "cred-1", name: "API", ledgerId, key: "sk_1", createdAt: "2026-03-01T00:00:00.000Z", deletedAt: null, lastUsedAt: null }],
          },
          isLoading: false,
        };
      }
      return { data: initialData, isLoading: false };
    });
  });

  it("returns initial ledger/categories and settings data", () => {
    const { result } = renderHook(() =>
      useLedgerSettings({
        ledgerId,
        ledger: initialLedger,
        initialCategories,
      })
    );

    expect(result.current.ledger.id).toBe(ledgerId);
    expect(result.current.categories).toEqual(initialCategories);
    expect(result.current.uncategorizedCount).toBe(2);
    expect(result.current.credentials).toHaveLength(1);
  });

  it("refetches categories only while metadata is incomplete", () => {
    renderHook(() =>
      useLedgerSettings({
        ledgerId,
        ledger: initialLedger,
        initialCategories,
      })
    );

    const categoriesQuery = useQueryMock.mock.calls[1]?.[0];
    expect(
      categoriesQuery.refetchInterval({
        state: {
          data: [{ icon: null, description: "x" }],
        },
      })
    ).toBe(3000);
    expect(
      categoriesQuery.refetchInterval({
        state: {
          data: [{ icon: "icon", description: "desc" }],
        },
      })
    ).toBe(false);
  });

  it("optimistically updates ledger settings cache and invalidates settings on settle", () => {
    renderHook(() =>
      useLedgerSettings({
        ledgerId,
        ledger: initialLedger,
        initialCategories,
      })
    );

    const updateLedgerMutation = getOption(0);
    (updateLedgerMutation.onOptimisticUpdate as (
      qc: typeof queryClientMock,
      newData: {
        mainCurrency?: string;
        preferredCurrencies?: string[];
        collapseEntriesDefault?: boolean;
      }
    ) => unknown)(queryClientMock, {
      mainCurrency: "USD",
      preferredCurrencies: ["USD", "CNY"],
      collapseEntriesDefault: true,
    });

    const updated = cache.get(JSON.stringify(queryKeys.ledger(ledgerId))) as Ledger;
    expect(updated.metadata?.settings).toEqual({
      mainCurrency: "USD",
      currencies: ["USD", "CNY"],
      collapseEntriesDefault: true,
    });

    (updateLedgerMutation.onSuccessExtra as (data: Ledger) => void)({
      ...initialLedger,
      metadata: { settings: { mainCurrency: "JPY" } },
    });

    const afterSuccess = cache.get(JSON.stringify(queryKeys.ledger(ledgerId))) as Ledger;
    expect(afterSuccess.metadata?.settings?.mainCurrency).toBe("JPY");

    (updateLedgerMutation.onSettledExtra as (
      qc: typeof queryClientMock,
      variables: unknown,
      data: unknown,
      error: Error | null
    ) => void)(queryClientMock, {}, undefined, null);

    expect(fireAndForgetMock).toHaveBeenCalled();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      predicate: expect.any(Function),
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { queryKeys } from "@/lib/query-keys";
import type { ServiceCredentialDto as ServiceCredential } from "@/modules/ledger/contracts";

const {
  createServiceCredentialActionMock,
  deleteServiceCredentialActionMock,
  mutationOptions,
  useLedgerMutationMock,
} = vi.hoisted(() => ({
  createServiceCredentialActionMock: vi.fn(),
  deleteServiceCredentialActionMock: vi.fn(),
  mutationOptions: [] as Array<Record<string, unknown>>,
  useLedgerMutationMock: vi.fn((_ledgerId: string, options: Record<string, unknown>) => {
    mutationOptions.push(options);
    return { mutate: vi.fn(), isPending: false };
  }),
}));

const cache = new Map<string, unknown>();
const queryClientMock = {
  getQueryData: vi.fn((key: readonly unknown[]) => cache.get(JSON.stringify(key))),
  setQueryData: vi.fn((key: readonly unknown[], value: unknown) => {
    const cacheKey = JSON.stringify(key);
    const current = cache.get(cacheKey);
    cache.set(cacheKey, typeof value === "function" ? (value as (old: unknown) => unknown)(current) : value);
  }),
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClientMock,
}));

vi.mock("@/lib/mutations/use-ledger-mutation", () => ({
  useLedgerMutation: useLedgerMutationMock,
}));

vi.mock("@/modules/ledger/actions", () => ({
  createServiceCredentialAction: createServiceCredentialActionMock,
  deleteServiceCredentialAction: deleteServiceCredentialActionMock,
}));

import { useCredentialMutations } from "./useCredentialMutations";

function getOption(index: number) {
  const option = mutationOptions[index];
  if (option == null) {
    throw new Error(`Missing option ${index}`);
  }
  return option;
}

describe("useCredentialMutations", () => {
  const ledgerId = "ledger-1";
  const queryKey = queryKeys.ledgerSettings(ledgerId);

  beforeEach(() => {
    vi.clearAllMocks();
    mutationOptions.length = 0;
    cache.clear();
    cache.set(
      JSON.stringify(queryKey),
      {
        uncategorizedCount: 0,
        credentials: [
          {
            id: "cred-1",
            ledgerId,
            name: "Existing",
            key: "sk_existing",
            createdAt: "2026-03-01T00:00:00.000Z",
            deletedAt: null,
            lastUsedAt: null,
          },
        ] satisfies ServiceCredential[],
      }
    );
  });

  it("optimistically appends a temp credential and replaces it on success", () => {
    renderHook(() => useCredentialMutations(ledgerId));
    const createCredential = getOption(0);

    const context = (createCredential.onOptimisticUpdate as (qc: typeof queryClientMock, name: string) => {
      prevData: { uncategorizedCount: number; credentials: ServiceCredential[] } | undefined;
      tempId: string;
    })(queryClientMock, "New Credential");

    const optimistic = queryClientMock.getQueryData(queryKey) as {
      uncategorizedCount: number;
      credentials: ServiceCredential[];
    };
    expect(optimistic.credentials).toHaveLength(2);
    expect(optimistic.credentials[1]?.name).toBe("New Credential");

    (createCredential.onSuccessExtra as (
      data: ServiceCredential,
      variables: string,
      context: { tempId: string } | undefined
    ) => void)(
      {
        id: "cred-2",
        ledgerId,
        name: "New Credential",
        key: "sk_new",
        createdAt: "2026-03-02T00:00:00.000Z",
        deletedAt: null,
        lastUsedAt: null,
      },
      "New Credential",
      context
    );

    const updated = queryClientMock.getQueryData(queryKey) as {
      uncategorizedCount: number;
      credentials: ServiceCredential[];
    };
    expect(updated.credentials.map((credential) => credential.id)).toEqual(["cred-1", "cred-2"]);
  });

  it("rolls back create and delete optimistic updates", () => {
    renderHook(() => useCredentialMutations(ledgerId));
    const createCredential = getOption(0);
    const deleteCredential = getOption(1);

    const createContext = (createCredential.onOptimisticUpdate as (qc: typeof queryClientMock, name: string) => {
      prevData: { uncategorizedCount: number; credentials: ServiceCredential[] } | undefined;
    })(queryClientMock, "temp");
    const createRollbackContext = createContext.prevData ? { prevData: createContext.prevData } : {};

    (createCredential.onRollback as (
      qc: typeof queryClientMock,
      context: { prevData?: { uncategorizedCount: number; credentials: ServiceCredential[] } }
    ) => void)(queryClientMock, createRollbackContext);

    expect((queryClientMock.getQueryData(queryKey) as { credentials: ServiceCredential[] }).credentials).toHaveLength(1);

    const deleteContext = (deleteCredential.onOptimisticUpdate as (
      qc: typeof queryClientMock,
      id: string
    ) => {
      prevData: { uncategorizedCount: number; credentials: ServiceCredential[] } | undefined;
    })(queryClientMock, "cred-1");
    const deleteRollbackContext = deleteContext.prevData ? { prevData: deleteContext.prevData } : {};

    expect((queryClientMock.getQueryData(queryKey) as { credentials: ServiceCredential[] }).credentials).toHaveLength(0);

    (deleteCredential.onRollback as (
      qc: typeof queryClientMock,
      context: { prevData?: { uncategorizedCount: number; credentials: ServiceCredential[] } }
    ) => void)(queryClientMock, deleteRollbackContext);

    expect((queryClientMock.getQueryData(queryKey) as { credentials: ServiceCredential[] }).credentials).toHaveLength(1);
  });
});

import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import { LEDGER } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
import type { CategoryPort, ServiceCredentialPort } from "@/application/contracts";
import type { LedgerDto, EntryCategoryWithCountDto } from "@/modules/ledger/contracts";
import { requireLedgerAccess } from "@/modules/ledger/access";
import { listEntryCategories } from "@/modules/ledger/application/queries/list-entry-categories";
import { getLedgerSettingsView } from "@/modules/ledger/application/queries/get-ledger-settings-view";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";

export interface GetLedgerSettingsBootstrapInput {
  ledgerId: string;
  /** Optional pre-authorized ledger DTO to avoid a second access check. */
  ledgerDto?: LedgerDto;
}

export interface LedgerSettingsBootstrapResult {
  dehydratedState: DehydratedState;
  initialCategories: EntryCategoryWithCountDto[];
}

export async function getLedgerSettingsBootstrap(
  input: GetLedgerSettingsBootstrapInput,
  dependencies: {
    categories: CategoryPort;
    credentials: ServiceCredentialPort;
  }
): Promise<LedgerSettingsBootstrapResult | null> {
  let ledgerDto: LedgerDto;

  if (input.ledgerDto != null) {
    if (input.ledgerDto.id !== input.ledgerId) return null;
    ledgerDto = input.ledgerDto;
  } else {
    try {
      const { ledger } = await requireLedgerAccess(input.ledgerId);
      ledgerDto = {
        id: ledger.id,
        userId: ledger.userId,
        settings: ledger.settings,
        createdAt: ledger.createdAt,
        updatedAt: ledger.updatedAt,
      };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) return null;
      throw error;
    }
  }

  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.ledger(input.ledgerId), ledgerDto);

  const categoriesPromise = queryClient.fetchQuery({
    queryKey: queryKeys.entryCategories(input.ledgerId),
    queryFn: () => listEntryCategories(input.ledgerId, dependencies.categories),
    staleTime: LEDGER.STALE_TIME_MS,
  });
  await Promise.all([
    categoriesPromise,
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgerSettings(input.ledgerId),
      queryFn: () =>
        getLedgerSettingsView(input.ledgerId, {
          categories: dependencies.categories,
          credentials: dependencies.credentials,
        }),
      staleTime: LEDGER.STALE_TIME_MS,
    }),
  ]);

  return {
    dehydratedState: dehydrate(queryClient),
    initialCategories: await categoriesPromise,
  };
}

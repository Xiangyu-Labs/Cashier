import type { LedgerSettingsViewDto } from "@/modules/ledger/contracts";
import { getUncategorizedEntryCount } from "./get-uncategorized-entry-count";
import { hasActiveEntries } from "./has-active-entries";
import { listServiceCredentials } from "./list-service-credentials";

export async function getLedgerSettingsView(ledgerId: string): Promise<LedgerSettingsViewDto> {
  const [uncategorizedCount, credentials, activeEntriesExist] = await Promise.all([
    getUncategorizedEntryCount(ledgerId),
    listServiceCredentials(ledgerId),
    hasActiveEntries(ledgerId),
  ]);

  return {
    uncategorizedCount,
    credentials,
    mainCurrencyMutable: !activeEntriesExist,
  };
}

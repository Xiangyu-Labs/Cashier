import type { LedgerPageBootstrapDto } from "@/modules/workspace/contracts";
import { prepareLedgerPageData } from "@/features/ledger/server/page-data";
import type { LedgerTab } from "@/features/ledger";
import type { PeriodParams } from "@/lib/period-utils";

export async function getLedgerPageBootstrap(input: {
  ledgerId: string;
  initialTab: LedgerTab;
  periodParams: PeriodParams;
}): Promise<LedgerPageBootstrapDto | null> {
  return prepareLedgerPageData(input) as Promise<LedgerPageBootstrapDto | null>;
}

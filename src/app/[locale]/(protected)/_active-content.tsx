import { LedgerPageClient } from "@/modules/workspace/ui/LedgerPageClient";
import type { LedgerTab } from "@/lib/ledger-tabs";
import type { LedgerDto } from "@/modules/ledger/contracts";
import type { EntryCategoryWithCount } from "@/modules/ledger/contracts";
import type { PeriodParams } from "@/lib/period-utils";
import type { InterfaceLanguage } from "@/modules/auth/contracts";
import type { LedgerAdvancedFilters } from "@/modules/workspace/initial-query-state";

interface ActiveContentProps {
  ledgerId: string;
  ledgerDto: LedgerDto;
  initialTab: LedgerTab;
  periodParams: PeriodParams;
  advancedFilters: LedgerAdvancedFilters;
  userEmail?: string;
  hasPassword?: boolean;
  passwordUpdatedAt?: string | null;
  interfaceLanguage?: InterfaceLanguage;
  locale?: string;
  initialCategories?: EntryCategoryWithCount[];
  initialStatsDate?: Date;
}

export function ActiveContent({
  ledgerId,
  ledgerDto,
  initialTab,
  periodParams,
  advancedFilters: _advancedFilters,
  userEmail,
  hasPassword,
  passwordUpdatedAt,
  interfaceLanguage,
  initialCategories,
  initialStatsDate,
}: ActiveContentProps) {
  return (
    <LedgerPageClient
      ledgerId={ledgerId}
      initialLedger={ledgerDto}
      initialTab={initialTab}
      initialPeriod={periodParams}
      {...(initialCategories !== undefined ? { initialCategories } : {})}
      {...(initialStatsDate !== undefined ? { initialStatsDate } : {})}
      {...(userEmail !== undefined ? { userEmail } : {})}
      {...(hasPassword !== undefined ? { hasPassword } : {})}
      {...(passwordUpdatedAt !== undefined ? { passwordUpdatedAt } : {})}
      {...(interfaceLanguage !== undefined ? { interfaceLanguage } : {})}
    />
  );
}

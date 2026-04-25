import type { ListAdminCurrencyRatesInput, ListAdminCurrencyRatesResult } from "@/modules/admin/contracts";

export async function listAdminCurrencyRates(_input?: ListAdminCurrencyRatesInput): Promise<ListAdminCurrencyRatesResult> {
  return { items: [], nextCursor: null, hasAnyCurrencyRates: false };
}

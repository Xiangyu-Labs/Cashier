"use server";
import { withLedgerAccess } from "@/lib/auth-actions";
import { calculateLedgerStats } from "@/modules/ledger/application/queries/calculate-ledger-stats";

export const getLedgerStatsAction = withLedgerAccess(calculateLedgerStats);

"use server";
import { withLedgerAccess } from "../access";
import { calculateLedgerStats } from "@/modules/ledger/application/queries/calculate-ledger-stats";

export const getLedgerStatsAction = withLedgerAccess(calculateLedgerStats);

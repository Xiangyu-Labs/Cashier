"use server";

import { withAuth } from "@/lib/auth-actions";
import { getLedger, getLedgers } from "@/modules/ledger/queries";

export const getLedgerAction = withAuth(
  async (userId: string, id: string) => getLedger({ ledgerId: id, userId })
);

export const getLedgersAction = withAuth(async (userId: string) => getLedgers(userId));

"use server";
import { withAuth } from "@/lib/auth-actions";
import { getLedger } from "@/modules/ledger/application/queries/get-ledger";
import { getLedgers } from "@/modules/ledger/application/queries/list-ledgers";

export const getLedgerAction = withAuth(async (userId: string, id: string) =>
  getLedger({ ledgerId: id, userId })
);

export const getLedgersAction = withAuth(async (userId: string) => getLedgers(userId));

"use server";
import { withAuth } from "@/lib/auth-actions";
import { getLedger } from "@/modules/ledger/application/queries/get-ledger";
import { getLedgers } from "@/modules/ledger/application/queries/list-ledgers";
import { serverComposition } from "@/application/server-composition-root";
import { parseLedgerId } from "@/modules/ledger/contract-schemas";

export const getLedgerAction = withAuth(async (userId: string, id: string) =>
  getLedger({ ledgerId: parseLedgerId(id), userId }, serverComposition.ledgers)
);

export const getLedgersAction = withAuth(async (userId: string) =>
  getLedgers(userId, serverComposition.ledgers)
);

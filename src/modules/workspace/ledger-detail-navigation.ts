"use client";

import type { ModalItem } from "@/lib/store/modal-stack";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { pushLedgerUrl, replaceLedgerUrl } from "./ledger-url-navigation";
import { setLedgerDetailSearchParams } from "./ledger-url-params";

export function openLedgerDetail(item: ModalItem): void {
  useModalStackStore.getState().push(item);
  const params = setLedgerDetailSearchParams(new URLSearchParams(window.location.search), {
    detailType: item.type,
    detailId: item.id,
  });
  pushLedgerUrl(window.location.pathname, params, "detail");
}

export function closeLedgerDetail(): void {
  const state = window.history.state as {
    cashier?: { ledgerNavigation?: boolean; kind?: string };
  } | null;
  if (state?.cashier?.ledgerNavigation === true && state.cashier.kind === "detail") {
    window.history.back();
    return;
  }

  const modalState = useModalStackStore.getState();
  const previous = modalState.stack.at(-2);
  const params = setLedgerDetailSearchParams(
    new URLSearchParams(window.location.search),
    previous == null
      ? null
      : {
          detailType: previous.type,
          detailId: previous.id,
        }
  );
  replaceLedgerUrl(window.location.pathname, params);
  if (previous == null) modalState.closeAll();
  else modalState.pop();
}

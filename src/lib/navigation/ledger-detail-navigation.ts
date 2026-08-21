"use client";

import type { ModalItem } from "@/lib/store/modal-stack";
import { useModalStackStore } from "@/lib/store/modal-stack";

function setDetailParams(detail: { type: ModalItem["type"]; id: string } | null): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  if (detail == null) {
    params.delete("detailType");
    params.delete("detailId");
  } else {
    params.set("detailType", detail.type);
    params.set("detailId", detail.id);
  }
  return params;
}

function detailUrl(params: URLSearchParams): string {
  const query = params.toString();
  return query === "" ? window.location.pathname : `${window.location.pathname}?${query}`;
}

export function openLedgerDetail(item: ModalItem): void {
  useModalStackStore.getState().push(item);
  window.history.pushState(
    {
      ...(typeof window.history.state === "object" && window.history.state !== null
        ? window.history.state
        : {}),
      cashier: { ledgerNavigation: true, kind: "detail" },
    },
    "",
    detailUrl(setDetailParams({ type: item.type, id: item.id }))
  );
}

export function closeLedgerDetail(): void {
  const modalState = useModalStackStore.getState();
  const previous = modalState.stack.at(-2);
  const params =
    previous == null
      ? setDetailParams(null)
      : setDetailParams({ type: previous.type, id: previous.id });
  window.history.replaceState(
    typeof window.history.state === "object" && window.history.state !== null
      ? window.history.state
      : {},
    "",
    detailUrl(params)
  );
  if (previous == null) modalState.closeAll();
  else modalState.pop();
}

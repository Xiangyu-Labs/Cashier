"use client";

import { useEffect, useRef } from "react";
import {
  migrateLegacyLedgerSearchParams,
  normalizeLedgerUrlSearchParams,
  readLedgerDetailSearchParams,
  type LedgerFilterScope,
} from "../ledger-url-params";
import { replaceLedgerUrl } from "../ledger-url-navigation";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { useUnsavedChangesStore, type UnsavedChangesLeaveGuard } from "@/lib/store/unsaved-changes";

interface UseLedgerHistorySyncOptions {
  pathname: string;
  searchParams: URLSearchParams;
  legacyScope: LedgerFilterScope;
  ledgerId: string;
}

export function useLedgerHistorySync({
  pathname,
  searchParams,
  legacyScope,
  ledgerId,
}: UseLedgerHistorySyncOptions): void {
  const blockSyncRef = useRef(false);
  const restoringRef = useRef(false);
  const bypassRef = useRef(false);
  const pendingGuardRef = useRef<UnsavedChangesLeaveGuard | null>(null);

  useEffect(() => {
    const migrated = migrateLegacyLedgerSearchParams(searchParams, legacyScope);
    const normalized = normalizeLedgerUrlSearchParams(migrated ?? searchParams);
    const next = normalized ?? migrated;
    if (next != null && next.toString() !== searchParams.toString()) {
      replaceLedgerUrl(pathname, next);
    }
  }, [legacyScope, pathname, searchParams]);

  useEffect(() => {
    if (blockSyncRef.current) return;
    const detail = readLedgerDetailSearchParams(searchParams);
    useModalStackStore.getState().syncToDetail(
      detail == null
        ? null
        : {
            type: detail.detailType,
            id: detail.detailId,
            ledgerId,
          }
    );
  }, [ledgerId, searchParams]);

  useEffect(() => {
    const handlePopState = () => {
      if (bypassRef.current) {
        bypassRef.current = false;
        return;
      }

      if (restoringRef.current) {
        restoringRef.current = false;
        blockSyncRef.current = false;
        const guard = pendingGuardRef.current;
        pendingGuardRef.current = null;
        guard?.requestLeave(() => {
          bypassRef.current = true;
          window.history.back();
        });
        return;
      }

      const top = useModalStackStore.getState().stack.at(-1);
      if (top == null) return;
      const destination = readLedgerDetailSearchParams(new URLSearchParams(window.location.search));
      if (destination?.detailType === top.type && destination.detailId === top.id) {
        return;
      }

      const guardKey = `${top.type}-detail:${top.ledgerId}:${top.id}`;
      const guard = useUnsavedChangesStore.getState().getLeaveGuard(guardKey);
      if (guard == null) return;

      blockSyncRef.current = true;
      restoringRef.current = true;
      pendingGuardRef.current = guard;
      window.history.go(1);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
}

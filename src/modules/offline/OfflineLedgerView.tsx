"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui/SourceDocumentCard";
import {
  getActiveOfflineSnapshotKey,
  readOfflineImages,
  readOfflineSnapshot,
  type OfflineLedgerSnapshot,
} from "./offline-store";

function searchable(item: SourceDocumentListItemDto) {
  return [
    item.title,
    item.entryDate,
    ...(item.ledgerEntries ?? []).flatMap((entry) => [
      entry.itemName,
      entry.description,
      entry.amount,
      entry.currency,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function OfflineLedgerView() {
  const [snapshot, setSnapshot] = useState<OfflineLedgerSnapshot | null>(null);
  const [items, setItems] = useState<SourceDocumentListItemDto[]>([]);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SourceDocumentListItemDto | null>(null);

  useEffect(() => {
    let disposed = false;
    const urls: string[] = [];
    const load = async () => {
      const key = getActiveOfflineSnapshotKey();
      if (key == null) return;
      const [nextSnapshot, images] = await Promise.all([
        readOfflineSnapshot(key),
        readOfflineImages(key),
      ]);
      if (disposed || nextSnapshot == null) return;
      const seen = new Set<string>();
      setSnapshot(nextSnapshot);
      setItems(
        [...nextSnapshot.items, ...nextSnapshot.viewedItems].filter(
          (item) => !seen.has(item.id) && seen.add(item.id)
        )
      );
      const mapped = new Map<string, string>();
      for (const image of images) {
        const url = URL.createObjectURL(image.blob);
        urls.push(url);
        mapped.set(image.fileId, url);
      }
      setImageUrls(mapped);
    };
    void load();
    return () => {
      disposed = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized === "" ? items : items.filter((item) => searchable(item).includes(normalized));
  }, [items, query]);
  const zh = (snapshot?.locale ?? navigator.language).startsWith("zh");
  const mainCurrency = snapshot?.mainCurrency ?? "CNY";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={zh ? "搜索账单" : "Search transactions"}
          className="h-11 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          {zh ? "暂无已缓存账单" : "No cached transactions"}
        </div>
      ) : (
        filtered.map((item) => (
          <SourceDocumentCard
            key={item.id}
            sourceDocument={item}
            ledgerEntries={(item.ledgerEntries ?? []) as LedgerEntry[]}
            mainCurrency={mainCurrency}
            status={item.status}
            anomalyReason={item.anomalyReason}
            errorCode={item.errorCode}
            defaultExpanded={!(snapshot?.ledgerSettings?.collapseEntriesDefault ?? false)}
            onViewDetails={() => setSelected(item)}
            readOnly
          />
        ))
      )}

      {selected != null && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-bg/95 p-4 backdrop-blur-sm">
          <div className="mx-auto max-w-2xl space-y-4 pt-[env(safe-area-inset-top)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{selected.title ?? (zh ? "账单详情" : "Details")}</h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface"
                aria-label={zh ? "关闭" : "Close"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {selected.files.flatMap((file, index) => {
                const url = imageUrls.get(file.id);
                return url == null
                  ? []
                  : [
                      <a key={file.id} href={url} target="_blank" rel="noreferrer">
                        {/* Cached Blob URLs intentionally bypass Next image optimization. */}
                        <img
                          src={url}
                          alt={`${zh ? "账单图片" : "Receipt image"} ${index + 1}`}
                          className="aspect-square w-full rounded-md border border-border object-cover"
                        />
                      </a>,
                    ];
              })}
            </div>
            <SourceDocumentCard
              sourceDocument={selected}
              ledgerEntries={(selected.ledgerEntries ?? []) as LedgerEntry[]}
              mainCurrency={mainCurrency}
              status={selected.status}
              anomalyReason={selected.anomalyReason}
              errorCode={selected.errorCode}
              defaultExpanded
              readOnly
            />
          </div>
        </div>
      )}
    </div>
  );
}

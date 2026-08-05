"use client";

import { useEffect, useRef, useState } from "react";
import type { SourceDocumentStoredFileDto } from "@/modules/source-document/contracts";
import { cacheImage, readCachedImagesForFiles } from "@/modules/source-document/image-cache";

function revokeUrls(urls: Iterable<string>) {
  for (const url of urls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore malformed or already-revoked URLs.
    }
  }
}

/**
 * Reads existing image blobs from the startup cache for a document. Never
 * issues network requests; used by read-only startup previews.
 */
export function useCachedImageUrls(
  snapshotKey: string,
  fileIds: readonly string[]
): Map<string, string> {
  const fileIdsKey = fileIds.join("|");
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const urlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let disposed = false;
    const activeUrls: string[] = [];
    if (snapshotKey === "" || fileIds.length === 0) {
      urlsRef.current = new Map();
      setUrls(new Map());
      return;
    }
    void readCachedImagesForFiles(snapshotKey, fileIds)
      .then((records) => {
        if (disposed) return;
        const next = new Map<string, string>();
        const wanted = new Set(fileIds);
        for (const record of records) {
          if (!wanted.has(record.fileId)) continue;
          const url = URL.createObjectURL(record.blob);
          activeUrls.push(url);
          next.set(record.fileId, url);
        }
        urlsRef.current = next;
        setUrls(next);
      })
      .catch(() => {
        if (!disposed) {
          urlsRef.current = new Map();
          setUrls(new Map());
        }
      });
    return () => {
      disposed = true;
      revokeUrls(activeUrls);
      urlsRef.current = new Map();
    };
    // fileIdsKey is the stable identity of the file list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileIdsKey, snapshotKey]);

  return urls;
}

/**
 * On-demand image cache for an open document detail. Reads cached blobs
 * first and issues exactly one authenticated request per missing file.
 */
export function useCachedSourceImages({
  snapshotKey,
  files,
  documentId,
  documentTimestamp,
  enabled,
}: {
  snapshotKey: string | null;
  files: SourceDocumentStoredFileDto[];
  documentId: string;
  documentTimestamp: string;
  enabled: boolean;
}) {
  const fileIdsKey = files.map((file) => file.id).join("|");
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const urlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let disposed = false;
    const activeUrls: string[] = [];
    if (!enabled || snapshotKey == null || files.length === 0) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const fileById = new Map(files.map((file) => [file.id, file]));
    void (async () => {
      const existing = await readCachedImagesForFiles(
        snapshotKey,
        files.map((file) => file.id)
      ).catch(() => []);
      if (disposed) return;
      const next = new Map<string, string>();
      const existingByFile = new Map(existing.map((record) => [record.fileId, record]));
      const missing: SourceDocumentStoredFileDto[] = [];
      for (const file of files) {
        const record = existingByFile.get(file.id);
        if (record != null) {
          const url = URL.createObjectURL(record.blob);
          activeUrls.push(url);
          next.set(file.id, url);
        } else {
          missing.push(file);
        }
      }
      urlsRef.current = next;
      setImageUrls(new Map(next));

      if (missing.length > 0) {
        const results = await Promise.all(
          missing.map((file) =>
            cacheImage({
              snapshotKey,
              documentId,
              documentTimestamp,
              file,
            }).catch(() => null)
          )
        );
        if (disposed) return;
        for (let index = 0; index < missing.length; index += 1) {
          const record = results[index];
          if (record == null) continue;
          const file = fileById.get(record.fileId);
          if (file == null || next.has(file.id)) continue;
          const url = URL.createObjectURL(record.blob);
          activeUrls.push(url);
          next.set(file.id, url);
        }
        urlsRef.current = next;
        setImageUrls(new Map(next));
      }
      if (!disposed) setIsLoading(false);
    })();
    return () => {
      disposed = true;
      revokeUrls(activeUrls);
      urlsRef.current = new Map();
    };
    // fileIdsKey is the stable identity of the file list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, documentTimestamp, enabled, fileIdsKey, snapshotKey]);

  return { imageUrls, isLoading };
}

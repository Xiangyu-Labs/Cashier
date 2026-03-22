import { inferImageMimeType } from "@/lib/storage/utils";
import { getLocalStorage } from "@/lib/storage/local";
import { ValidationError } from "@/lib/errors";

export interface RehomeLocalUploadUrlsInput {
  ledgerId: string;
  sourceDocumentId: string;
  imageUrls: string[];
}

function buildTargetKey(ledgerId: string, sourceDocumentId: string, key: string): string {
  const parts = key.split("/");
  const filename = parts.slice(2).join("/");
  return `${ledgerId}/${sourceDocumentId}/${filename}`;
}

export async function rehomeLocalUploadUrls({
  ledgerId,
  sourceDocumentId,
  imageUrls,
}: RehomeLocalUploadUrlsInput): Promise<string[]> {
  const storage = getLocalStorage();

  return Promise.all(
    imageUrls.map(async (url) => {
      if (!url.startsWith("/api/uploads/")) {
        return url;
      }

      const key = storage.extractKeyFromUrl(url);
      if (key == null) {
        return url;
      }

      const parts = key.split("/");
      if (parts.length < 3) {
        return url;
      }

      const currentLedgerId = parts[0];
      const currentDocId = parts[1];
      if (currentLedgerId == null || currentLedgerId === "") {
        return url;
      }

      if (currentDocId == null || currentDocId === "") {
        return url;
      }

      if (currentLedgerId !== ledgerId) {
        throw new ValidationError("Cross-ledger local upload URLs are not allowed", {
          imageUrl: url,
          currentLedgerId,
          ledgerId,
        });
      }

      if (currentLedgerId === ledgerId && currentDocId === sourceDocumentId) {
        return url;
      }

      const targetKey = buildTargetKey(ledgerId, sourceDocumentId, key);
      const buffer = await storage.download(key);
      const mimeType = inferImageMimeType(key);
      return storage.upload(targetKey, buffer, mimeType);
    })
  );
}

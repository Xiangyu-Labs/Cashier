import { inferImageMimeType } from "@/lib/storage/utils";
import { getLocalStorage } from "@/lib/storage/local";
import { ValidationError } from "@/lib/errors";

export interface RehomeLocalUploadUrlsInput {
  ledgerId: string;
  sourceDocumentId: string;
  imageUrls: string[];
}

interface KeepAction {
  type: "keep";
  url: string;
}

interface RehomeAction {
  type: "rehome";
  key: string;
  targetKey: string;
}

function buildTargetKey(ledgerId: string, sourceDocumentId: string, key: string): string {
  const parts = key.split("/");
  const filename = parts.slice(2).join("/");
  return `${ledgerId}/${sourceDocumentId}/${filename}`;
}

function buildAction(
  ledgerId: string,
  sourceDocumentId: string,
  url: string,
  key: string
): KeepAction | RehomeAction {
  const parts = key.split("/");
  if (parts.length < 3) {
    return { type: "keep", url };
  }

  const currentLedgerId = parts[0];
  const currentDocId = parts[1];
  if (currentLedgerId == null || currentLedgerId === "") {
    return { type: "keep", url };
  }

  if (currentDocId == null || currentDocId === "") {
    return { type: "keep", url };
  }

  if (currentLedgerId !== ledgerId) {
    throw new ValidationError("Cross-ledger local upload URLs are not allowed", {
      imageUrl: url,
      currentLedgerId,
      ledgerId,
    });
  }

  if (currentDocId === sourceDocumentId) {
    return { type: "keep", url };
  }

  return {
    type: "rehome",
    key,
    targetKey: buildTargetKey(ledgerId, sourceDocumentId, key),
  };
}

export async function rehomeLocalUploadUrls({
  ledgerId,
  sourceDocumentId,
  imageUrls,
}: RehomeLocalUploadUrlsInput): Promise<string[]> {
  const storage = getLocalStorage();
  const actions = imageUrls.map((url): KeepAction | RehomeAction => {
    if (!url.startsWith("/api/uploads/")) {
      return { type: "keep", url };
    }

    const key = storage.extractKeyFromUrl(url);
    if (key == null) {
      return { type: "keep", url };
    }

    return buildAction(ledgerId, sourceDocumentId, url, key);
  });

  return Promise.all(
    actions.map(async (action) => {
      if (action.type === "keep") {
        return action.url;
      }

      const { key, targetKey } = action;
      const buffer = await storage.download(key);
      const mimeType = inferImageMimeType(key);
      return storage.upload(targetKey, buffer, mimeType);
    })
  );
}

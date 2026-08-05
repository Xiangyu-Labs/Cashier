import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceDocumentStoredFileDto } from "@/modules/source-document/contracts";

const imageCache = vi.hoisted(() => ({
  readCachedImagesForFiles: vi.fn(),
  cacheImage: vi.fn(),
}));

vi.mock("@/modules/source-document/image-cache", () => ({
  readCachedImagesForFiles: imageCache.readCachedImagesForFiles,
  cacheImage: imageCache.cacheImage,
}));

import {
  useCachedImageUrls,
  useCachedSourceImages,
} from "@/modules/source-document/hooks/use-cached-source-images";

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

function file(id: string): SourceDocumentStoredFileDto {
  return { id, contentType: "image/png", byteSize: 100, originalFilename: `${id}.png` };
}

function CachedImagesProbe({
  snapshotKey,
  files,
}: {
  snapshotKey: string;
  files: SourceDocumentStoredFileDto[];
}) {
  const urls = useCachedImageUrls(
    snapshotKey,
    files.map((item) => item.id)
  );
  return <div data-testid="urls">{JSON.stringify([...urls.entries()])}</div>;
}

function OnlineImagesProbe({
  files,
  snapshotKey = "user:ledger",
}: {
  files: SourceDocumentStoredFileDto[];
  snapshotKey?: string | null;
}) {
  const { imageUrls, isLoading } = useCachedSourceImages({
    snapshotKey,
    files,
    documentId: "doc-1",
    documentTimestamp: "2026-08-01",
    enabled: true,
  });
  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="urls">{JSON.stringify([...imageUrls.entries()])}</div>
    </div>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  createObjectURL.mockReset();
  revokeObjectURL.mockReset();
});

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
});

describe("useCachedImageUrls", () => {
  it("only reads existing blobs and never issues a fetch", async () => {
    createObjectURL.mockReturnValue("blob:preview-1");
    imageCache.readCachedImagesForFiles.mockResolvedValue([
      {
        key: "user:ledger:file-1",
        snapshotKey: "user:ledger",
        userId: "user",
        fileId: "file-1",
        documentId: "doc-1",
        contentType: "image/png",
        byteSize: 100,
        blob: new Blob(["x"]),
        lastAccessedAt: 1,
      },
    ]);
    render(<CachedImagesProbe snapshotKey="user:ledger" files={[file("file-1")]} />);
    await screen.findByText('[["file-1","blob:preview-1"]]');
    expect(imageCache.readCachedImagesForFiles).toHaveBeenCalledWith("user:ledger", ["file-1"]);
    expect(imageCache.cacheImage).not.toHaveBeenCalled();
  });
});

describe("useCachedSourceImages", () => {
  it("issues exactly one cache request per missing file and shows the blob URL", async () => {
    createObjectURL.mockReturnValue("blob:online-1");
    imageCache.readCachedImagesForFiles.mockResolvedValue([]);
    imageCache.cacheImage.mockResolvedValue({
      key: "user:ledger:file-1",
      snapshotKey: "user:ledger",
      userId: "user",
      fileId: "file-1",
      documentId: "doc-1",
      contentType: "image/png",
      byteSize: 100,
      blob: new Blob(["x"]),
      lastAccessedAt: 1,
    });
    render(<OnlineImagesProbe files={[file("file-1"), file("file-2")]} />);
    await screen.findByText(/blob:online-1/);
    expect(imageCache.cacheImage).toHaveBeenCalledTimes(2);
    expect(imageCache.cacheImage).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ id: "file-1" }),
        snapshotKey: "user:ledger",
      })
    );
  });

  it("does not fetch files that are already cached", async () => {
    createObjectURL.mockReturnValue("blob:cached");
    imageCache.readCachedImagesForFiles.mockResolvedValue([
      {
        key: "user:ledger:file-1",
        snapshotKey: "user:ledger",
        userId: "user",
        fileId: "file-1",
        documentId: "doc-1",
        contentType: "image/png",
        byteSize: 100,
        blob: new Blob(["x"]),
        lastAccessedAt: 1,
      },
    ]);
    render(<OnlineImagesProbe files={[file("file-1")]} />);
    await screen.findByText('[["file-1","blob:cached"]]');
    expect(imageCache.cacheImage).not.toHaveBeenCalled();
  });

  it("revokes blob URLs on unmount", async () => {
    createObjectURL.mockReturnValue("blob:cleanup");
    imageCache.readCachedImagesForFiles.mockResolvedValue([]);
    imageCache.cacheImage.mockResolvedValue({
      key: "user:ledger:file-1",
      snapshotKey: "user:ledger",
      userId: "user",
      fileId: "file-1",
      documentId: "doc-1",
      contentType: "image/png",
      byteSize: 100,
      blob: new Blob(["x"]),
      lastAccessedAt: 1,
    });
    const { unmount } = render(<OnlineImagesProbe files={[file("file-1")]} />);
    await act(async () => {});
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cleanup");
  });
});

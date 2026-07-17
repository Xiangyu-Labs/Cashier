import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { R2StorageProvider } from "@/lib/storage/r2";

function provider(send: ReturnType<typeof vi.fn>): R2StorageProvider {
  return new R2StorageProvider({ send } as unknown as Pick<S3Client, "send">, "cashier-images");
}

describe("R2StorageProvider", () => {
  it("puts, gets, and idempotently deletes private objects", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: { transformToByteArray: vi.fn(async () => new Uint8Array([1, 2, 3])) },
      })
      .mockResolvedValueOnce({});
    const storage = provider(send);

    await expect(
      storage.upload("ledger/stored/file", Buffer.from([1, 2, 3]), "image/png")
    ).resolves.toBeUndefined();
    await expect(storage.download("ledger/stored/file")).resolves.toEqual(Buffer.from([1, 2, 3]));
    await expect(storage.delete("ledger/stored/file")).resolves.toMatchObject({ success: true });

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it("maps missing objects and SDK failures to controlled errors", async () => {
    const missing = Object.assign(new Error("not found"), {
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });
    await expect(
      provider(vi.fn().mockRejectedValue(missing)).download("ledger/stored/file")
    ).rejects.toMatchObject({ code: "FILE_NOT_FOUND", statusCode: 404 });

    await expect(
      provider(vi.fn().mockRejectedValue(new Error("network"))).upload(
        "ledger/stored/file",
        Buffer.from("x"),
        "image/jpeg"
      )
    ).rejects.toMatchObject({ code: "R2_UPLOAD_FAILED", statusCode: 503 });
  });

  it("rejects unsafe object keys before calling R2", async () => {
    const send = vi.fn();
    const storage = provider(send);

    for (const key of ["/absolute", "../escape", "a\\b", "a//b", "a/./b"]) {
      await expect(storage.download(key)).rejects.toThrow("Invalid storage key");
    }
    expect(send).not.toHaveBeenCalled();
  });
});

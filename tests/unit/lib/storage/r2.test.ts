import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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

  it("signs scoped uploads, inspects metadata, and copies within the bucket", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ContentLength: 3,
        ContentType: "image/png",
        Metadata: { sha256: "a".repeat(64) },
      })
      .mockResolvedValueOnce({});
    const signer = vi.fn().mockResolvedValue("https://signed.example/upload");
    const storage = new R2StorageProvider(
      { send } as unknown as Pick<S3Client, "send">,
      "cashier-images",
      signer as never
    );

    await expect(
      storage.presignUpload("temporary/ledger/session/target", "image/png", "a".repeat(64), 900)
    ).resolves.toEqual({
      url: "https://signed.example/upload",
      requiredHeaders: {
        "Content-Type": "image/png",
        "x-amz-meta-sha256": "a".repeat(64),
      },
    });
    await expect(storage.head("temporary/ledger/session/target")).resolves.toEqual({
      byteSize: 3,
      contentType: "image/png",
      metadata: { sha256: "a".repeat(64) },
    });
    await expect(
      storage.copy("temporary/ledger/session/target", "ledger/stored/target")
    ).resolves.toBeUndefined();

    expect(signer).toHaveBeenCalledWith(expect.anything(), expect.any(PutObjectCommand), {
      expiresIn: 900,
      signableHeaders: new Set(["content-type"]),
      unhoistableHeaders: new Set(["x-amz-meta-sha256"]),
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(CopyObjectCommand);
    expect(send.mock.calls[1]?.[0].input.CopySource).toBe(
      "cashier-images/temporary/ledger/session/target"
    );
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

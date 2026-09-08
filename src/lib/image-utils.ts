/**
 * Compresses an image file on the client side.
 * Uses Web Worker with OffscreenCanvas when available for non-blocking compression.
 * @param file The image file to compress
 * @param maxWidth The maximum width of the resulting image
 * @param maxHeight The maximum height of the resulting image
 * @param quality The quality of the JPEG compression (0.0 to 1.0)
 * @returns A promise that resolves to the compressed file and mime type
 */
import { fitImageDimensions } from "./image-dimensions";

interface CompressionResult {
  file: File;
  mimeType: string;
}

class WorkerPool {
  private maxWorkers: number;
  private queue: Array<{
    task: () => Promise<CompressionResult>;
    resolve: (value: CompressionResult) => void;
    reject: (reason: unknown) => void;
  }> = [];
  private activeWorkers = 0;

  constructor(maxWorkers = 3) {
    this.maxWorkers = maxWorkers;
  }

  async execute(task: () => Promise<CompressionResult>): Promise<CompressionResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.activeWorkers >= this.maxWorkers || this.queue.length === 0) {
      return;
    }

    const { task, resolve, reject } = this.queue.shift()!;
    this.activeWorkers++;

    task()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        this.activeWorkers--;
        this.processQueue();
      });
  }
}

// Create pool instance
const workerPool = new WorkerPool(3);

function createWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (typeof OffscreenCanvas === "undefined") return null;

  try {
    return new Worker(new URL("./workers/image-compress.worker.ts", import.meta.url));
  } catch {
    // Worker creation failed, fall back to sync
    return null;
  }
}

export async function compressImage(
  file: File,
  maxWidth = 1080,
  maxHeight = 1080,
  quality = 0.8,
  signal?: AbortSignal
): Promise<CompressionResult> {
  return workerPool.execute(async () => {
    if (signal?.aborted === true)
      throw new DOMException("Image compression was cancelled", "AbortError");
    const worker = createWorker();

    // Use Web Worker if available (non-blocking)
    if (worker) {
      const arrayBuffer = await file.arrayBuffer();

      return new Promise((resolve, reject) => {
        const cleanup = () => {
          worker.removeEventListener("message", handleMessage);
          worker.removeEventListener("error", handleError);
          signal?.removeEventListener("abort", handleAbort);
          worker.terminate();
        };
        const fail = (error: Error) => {
          cleanup();
          reject(error);
        };
        const handleMessage = (e: MessageEvent) => {
          if (e.data.success === true) {
            cleanup();
            resolve({
              file: new File([e.data.data], file.name, { type: "image/jpeg" }),
              mimeType: "image/jpeg",
            });
          } else {
            fail(new Error(e.data.error));
          }
        };
        const handleError = (event: ErrorEvent) =>
          fail(event.error instanceof Error ? event.error : new Error(event.message));
        const handleAbort = () =>
          fail(new DOMException("Image compression was cancelled", "AbortError"));

        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError);
        signal?.addEventListener("abort", handleAbort, { once: true });
        worker.postMessage({ imageData: arrayBuffer, maxWidth, maxHeight, quality }, [arrayBuffer]);
      });
    }

    // Fallback to synchronous compression (main thread)
    return compressImageSync(file, maxWidth, maxHeight, quality);
  });
}

/**
 * Synchronous image compression (fallback when Web Worker not available)
 */
function compressImageSync(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const { width, height } = fitImageDimensions(img.width, img.height, maxWidth, maxHeight);

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob == null) {
              reject(new Error("Failed to encode image"));
              return;
            }
            resolve({
              file: new File([blob], file.name, { type: "image/jpeg" }),
              mimeType: "image/jpeg",
            });
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

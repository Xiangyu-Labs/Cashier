/**
 * Web Worker for image compression
 * Uses OffscreenCanvas to avoid blocking the main thread
 */
import { fitImageDimensions } from "../image-dimensions";

self.onmessage = async (
  e: MessageEvent<{
    imageData: ArrayBuffer;
    maxWidth: number;
    maxHeight: number;
    quality: number;
  }>
) => {
  const { imageData, maxWidth, maxHeight, quality } = e.data;

  let bitmap: ImageBitmap | null = null;
  try {
    const blob = new Blob([imageData]);
    bitmap = await createImageBitmap(blob);
    const { width, height } = fitImageDimensions(bitmap.width, bitmap.height, maxWidth, maxHeight);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new TypeError("Failed to get canvas context");

    ctx.drawImage(bitmap, 0, 0, width, height);

    const resultBlob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality,
    });

    const arrayBuffer = await resultBlob.arrayBuffer();

    self.postMessage({ success: true, data: arrayBuffer }, { transfer: [arrayBuffer] });
  } catch (error) {
    self.postMessage({ success: false, error: String(error) });
  } finally {
    bitmap?.close();
  }
};

export {};

/**
 * Web Worker for image compression
 * Uses OffscreenCanvas to avoid blocking the main thread
 */

self.onmessage = async (
  e: MessageEvent<{
    imageData: ArrayBuffer;
    maxWidth: number;
    maxHeight: number;
    quality: number;
  }>
) => {
  const { imageData, maxWidth, maxHeight, quality } = e.data;

  try {
    const blob = new Blob([imageData]);
    const bitmap = await createImageBitmap(blob);

    let width = bitmap.width;
    let height = bitmap.height;

    // Calculate dimensions maintaining aspect ratio
    if (width > height) {
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");

    ctx.drawImage(bitmap, 0, 0, width, height);

    const resultBlob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality,
    });

    const arrayBuffer = await resultBlob.arrayBuffer();

    self.postMessage({ success: true, data: arrayBuffer }, { transfer: [arrayBuffer] });
  } catch (error) {
    self.postMessage({ success: false, error: String(error) });
  }
};

export {};

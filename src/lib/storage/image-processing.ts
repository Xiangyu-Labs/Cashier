/**
 * Image Processing Utilities
 *
 * Provides image compression, resizing, and format optimization using sharp.
 */

import sharp from "sharp";
import { logger } from "@/lib/logger";

/**
 * Image processing options
 */
export interface ImageProcessingOptions {
  /** Maximum width/height in pixels (default: 2048) */
  maxDimension?: number;
  /** JPEG/WebP quality 1-100 (default: 85) */
  quality?: number;
  /** Output format (default: auto - keep original or convert to WebP) */
  format?: "jpeg" | "png" | "webp" | "avif" | "auto";
  /** Whether to strip metadata (default: true) */
  stripMetadata?: boolean;
}

/**
 * Default processing options optimized for receipt/invoice images
 */
export const DEFAULT_IMAGE_OPTIONS: Required<ImageProcessingOptions> = {
  maxDimension: 2048,
  quality: 85,
  format: "auto",
  stripMetadata: true,
};

/**
 * Maximum output file size (5MB after compression)
 */
const MAX_OUTPUT_SIZE = 5 * 1024 * 1024;

/**
 * Process and compress an image buffer
 *
 * @param buffer - Input image buffer
 * @param mimeType - Input MIME type
 * @param options - Processing options
 * @returns Processed buffer and output MIME type
 */
export async function processImage(
  buffer: Buffer,
  mimeType: string,
  options: ImageProcessingOptions = {}
): Promise<{ buffer: Buffer; mimeType: string }> {
  const opts = { ...DEFAULT_IMAGE_OPTIONS, ...options };

  try {
    let pipeline = sharp(buffer, {
      // Limit input dimensions to prevent memory issues
      limitInputPixels: 100_000_000, // ~10k x 10k
    });

    // Get image metadata
    const metadata = await pipeline.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // Resize if dimensions exceed max
    const maxDim = opts.maxDimension;
    if (width > maxDim || height > maxDim) {
      pipeline = pipeline.resize(maxDim, maxDim, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Strip metadata to reduce file size
    if (opts.stripMetadata) {
      pipeline = pipeline.withMetadata({});
    }

    // Determine output format
    let outputFormat = opts.format;
    if (outputFormat === "auto") {
      // Convert to WebP for better compression, except for PNGs that might need transparency
      outputFormat = mimeType === "image/png" ? "png" : "webp";
    }

    // Apply format-specific compression
    let outputBuffer: Buffer;
    let outputMimeType: string;

    switch (outputFormat) {
      case "jpeg":
      case "jpg":
        outputBuffer = await pipeline.jpeg({
          quality: opts.quality,
          progressive: true,
          mozjpeg: true,
        }).toBuffer();
        outputMimeType = "image/jpeg";
        break;

      case "png":
        // PNG uses lossless compression, quality option is ignored by sharp
        outputBuffer = await pipeline.png({
          compressionLevel: 9,
          progressive: true,
        }).toBuffer();
        outputMimeType = "image/png";
        break;

      case "webp":
        outputBuffer = await pipeline.webp({
          quality: opts.quality,
          effort: 6, // Compression effort 0-6
        }).toBuffer();
        outputMimeType = "image/webp";
        break;

      case "avif":
        outputBuffer = await pipeline.avif({
          quality: opts.quality,
          effort: 4, // Compression effort 0-9
        }).toBuffer();
        outputMimeType = "image/avif";
        break;

      default:
        // Keep original format with compression
        if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
          outputBuffer = await pipeline.jpeg({
            quality: opts.quality,
            progressive: true,
            mozjpeg: true,
          }).toBuffer();
          outputMimeType = mimeType;
        } else if (mimeType === "image/png") {
          // PNG uses lossless compression, quality option is ignored by sharp
          outputBuffer = await pipeline.png({
            compressionLevel: 9,
            progressive: true,
          }).toBuffer();
          outputMimeType = mimeType;
        } else if (mimeType === "image/webp") {
          outputBuffer = await pipeline.webp({
            quality: opts.quality,
            effort: 6,
          }).toBuffer();
          outputMimeType = mimeType;
        } else {
          // Default to JPEG for unknown formats
          outputBuffer = await pipeline.jpeg({
            quality: opts.quality,
            progressive: true,
          }).toBuffer();
          outputMimeType = "image/jpeg";
        }
    }

    // Check if compression actually reduced the size
    if (outputBuffer.length > buffer.length && opts.format === "auto") {
      // If processed image is larger, use original
      logger.debug(
        { originalSize: buffer.length, processedSize: outputBuffer.length },
        "Processed image larger than original, using original"
      );
      return { buffer, mimeType };
    }

    // Final size check
    if (outputBuffer.length > MAX_OUTPUT_SIZE) {
      logger.warn(
        { size: outputBuffer.length, maxSize: MAX_OUTPUT_SIZE },
        "Processed image still exceeds max size"
      );
      // Attempt one more pass with lower quality
      return processImage(buffer, mimeType, {
        ...opts,
        quality: Math.max(60, opts.quality - 15),
      });
    }

    logger.debug(
      {
        originalSize: buffer.length,
        processedSize: outputBuffer.length,
        originalMime: mimeType,
        outputMime: outputMimeType,
        width,
        height,
      },
      "Image processed successfully"
    );

    return { buffer: outputBuffer, mimeType: outputMimeType };
  } catch (error) {
    logger.error({ error, mimeType }, "Image processing failed, returning original");
    // Return original buffer on error
    return { buffer, mimeType };
  }
}

/**
 * Check if a MIME type is a supported image format
 */
export function isSupportedImageFormat(mimeType: string): boolean {
  const supportedFormats = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "image/avif",
    "image/tiff",
  ];
  return supportedFormats.includes(mimeType.toLowerCase());
}

/**
 * Get image dimensions without loading the full image
 */
export async function getImageDimensions(
  buffer: Buffer
): Promise<{ width: number; height: number } | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
    return null;
  } catch (error) {
    logger.error({ error }, "Failed to get image dimensions");
    return null;
  }
}

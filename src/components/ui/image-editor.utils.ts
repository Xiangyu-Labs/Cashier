"use client";

import { centerCrop, type Crop, type PixelCrop } from "react-image-crop";

const DEFAULT_CROP_PERCENT = 80;

interface CropImageLike {
  naturalWidth: number;
  naturalHeight: number;
  width: number;
  height: number;
}

interface PointerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PointerMappingInput {
  clientX: number;
  clientY: number;
  rect: PointerRect;
  canvasWidth: number;
  canvasHeight: number;
}

export function createCenteredCropSelection(
  mediaWidth: number,
  mediaHeight: number
): Crop {
  return centerCrop(
    {
      unit: "%",
      width: DEFAULT_CROP_PERCENT,
      height: DEFAULT_CROP_PERCENT,
    },
    mediaWidth,
    mediaHeight
  );
}

export function scaleCropToImagePixels(
  image: CropImageLike,
  crop: PixelCrop
): PixelCrop {
  const renderedWidth =
    image.width > 0 ? image.width : image.naturalWidth > 0 ? image.naturalWidth : 1;
  const renderedHeight =
    image.height > 0 ? image.height : image.naturalHeight > 0 ? image.naturalHeight : 1;
  const scaleX = image.naturalWidth / renderedWidth;
  const scaleY = image.naturalHeight / renderedHeight;

  const x = Math.max(0, Math.round(crop.x * scaleX));
  const y = Math.max(0, Math.round(crop.y * scaleY));
  const width = Math.min(
    image.naturalWidth - x,
    Math.max(1, Math.round(crop.width * scaleX))
  );
  const height = Math.min(
    image.naturalHeight - y,
    Math.max(1, Math.round(crop.height * scaleY))
  );

  return {
    unit: "px",
    x,
    y,
    width,
    height,
  };
}

export function mapPointerToCanvasPosition({
  clientX,
  clientY,
  rect,
  canvasWidth,
  canvasHeight,
}: PointerMappingInput) {
  const safeRectWidth = rect.width > 0 ? rect.width : 1;
  const safeRectHeight = rect.height > 0 ? rect.height : 1;
  const scaleX = canvasWidth / safeRectWidth;
  const scaleY = canvasHeight / safeRectHeight;

  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;

  return {
    x: Math.min(canvasWidth, Math.max(0, x)),
    y: Math.min(canvasHeight, Math.max(0, y)),
  };
}

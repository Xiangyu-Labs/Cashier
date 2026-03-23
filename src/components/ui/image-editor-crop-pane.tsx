"use client";
import type { RefObject } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { createCenteredCropSelection } from "./image-editor.utils";

interface ImageEditorCropPaneProps {
  image: string;
  crop: Crop | undefined;
  imageRef: RefObject<HTMLImageElement | null>;
  onCropChange: (nextCrop: PixelCrop) => void;
  onInitializeCrop: (nextCrop: Crop) => void;
}

export function ImageEditorCropPane({
  image,
  crop,
  imageRef,
  onCropChange,
  onInitializeCrop,
}: ImageEditorCropPaneProps) {
  return (
    <div data-testid="image-editor-crop-pane">
      <ReactCrop
        {...(crop != null ? { crop } : {})}
        onChange={onCropChange}
        keepSelection
        className="max-h-full max-w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={image}
          alt="Edit"
          data-testid="crop-editor-image"
          className="max-h-[calc(90vh-220px)] max-w-full object-contain"
          onLoad={(event) => {
            onInitializeCrop(
              createCenteredCropSelection(
                event.currentTarget.naturalWidth,
                event.currentTarget.naturalHeight
              )
            );
          }}
        />
      </ReactCrop>
    </div>
  );
}

"use client";
import type { PointerEvent, RefObject } from "react";
import { cn } from "@/lib/utils";

interface ImageEditorDrawPaneProps {
  image: string;
  imageRef: RefObject<HTMLImageElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onInitializeCanvas: () => void;
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event?: PointerEvent<HTMLCanvasElement>) => void;
}

export function ImageEditorDrawPane({
  image,
  imageRef,
  canvasRef,
  onInitializeCanvas,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: ImageEditorDrawPaneProps) {
  return (
    <div data-testid="image-editor-draw-pane" className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={image}
        alt="Edit"
        data-testid="draw-editor-image"
        className="hidden"
        onLoad={onInitializeCanvas}
      />
      <canvas
        ref={canvasRef}
        data-testid="draw-editor-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn("max-h-[calc(90vh-220px)] max-w-full border shadow-sm cursor-crosshair")}
      />
    </div>
  );
}

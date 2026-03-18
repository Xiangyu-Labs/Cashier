"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Crop as CropIcon, Pencil, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createCenteredCropSelection,
  mapPointerToCanvasPosition,
  scaleCropToImagePixels,
} from "./image-editor.utils";

interface ImageEditorProps {
  image: string; // base64 data URL
  onChange: (editedImage: { data: string; mimeType: string }) => void;
}

type EditorTab = "crop" | "draw";

const EXPORT_MIME_TYPE = "image/jpeg";
const EXPORT_QUALITY = 0.9;

function getMimeTypeFromDataUrl(dataUrl: string) {
  return dataUrl.match(/^data:([^;]+);base64,/)?.[1] ?? EXPORT_MIME_TYPE;
}

function exportCanvasAsDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL(EXPORT_MIME_TYPE, EXPORT_QUALITY);
}

export function ImageEditor({ image, onChange }: ImageEditorProps) {
  const t = useTranslations("ImageEditor");
  const [activeTab, setActiveTab] = useState<EditorTab>("crop");
  const [draftImage, setDraftImage] = useState(image);
  const [toolBaseImage, setToolBaseImage] = useState(image);
  const [crop, setCrop] = useState<Crop>();
  const [brushSize, setBrushSize] = useState(10);
  const [isDrawing, setIsDrawing] = useState(false);

  const cropImageRef = useRef<HTMLImageElement>(null);
  const drawImageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const emitDraftChange = useCallback(
    (nextImage: string) => {
      setDraftImage(nextImage);
      onChange({
        data: nextImage,
        mimeType: getMimeTypeFromDataUrl(nextImage),
      });
    },
    [onChange]
  );

  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = drawImageRef.current;
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }, []);

  const resetCurrentTool = useCallback(() => {
    setIsDrawing(false);
    emitDraftChange(toolBaseImage);

    if (activeTab === "crop") {
      const img = cropImageRef.current;
      setCrop(
        img && img.naturalWidth > 0
          ? createCenteredCropSelection(img.naturalWidth, img.naturalHeight)
          : undefined
      );
      return;
    }

    initializeCanvas();
  }, [activeTab, emitDraftChange, initializeCanvas, toolBaseImage]);

  const updateDraftFromCrop = useCallback(
    (nextCrop: PixelCrop) => {
      const img = cropImageRef.current;
      if (!img || nextCrop.width <= 0 || nextCrop.height <= 0) {
        emitDraftChange(toolBaseImage);
        return;
      }

      const scaledCrop = scaleCropToImagePixels(img, nextCrop);
      const canvas = document.createElement("canvas");
      canvas.width = scaledCrop.width;
      canvas.height = scaledCrop.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(
        img,
        scaledCrop.x,
        scaledCrop.y,
        scaledCrop.width,
        scaledCrop.height,
        0,
        0,
        scaledCrop.width,
        scaledCrop.height
      );

      emitDraftChange(exportCanvasAsDataUrl(canvas));
    },
    [emitDraftChange, toolBaseImage]
  );

  const handleCropComplete = useCallback(
    (nextCrop: PixelCrop) => {
      if (nextCrop.width <= 0 || nextCrop.height <= 0) {
        emitDraftChange(toolBaseImage);
        return;
      }

      updateDraftFromCrop(nextCrop);
    },
    [emitDraftChange, toolBaseImage, updateDraftFromCrop]
  );

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTab !== "draw") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const point = mapPointerToCanvasPosition({
      clientX: e.clientX,
      clientY: e.clientY,
      rect: canvas.getBoundingClientRect(),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (typeof canvas.setPointerCapture === "function") {
      canvas.setPointerCapture(e.pointerId);
    }
    setIsDrawing(true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || activeTab !== "draw") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const point = mapPointerToCanvasPosition({
      clientX: e.clientX,
      clientY: e.clientY,
      rect: canvas.getBoundingClientRect(),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });

    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const stopDrawing = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (
      e &&
      typeof canvas.hasPointerCapture === "function" &&
      canvas.hasPointerCapture(e.pointerId)
    ) {
      canvas.releasePointerCapture(e.pointerId);
    }

    setIsDrawing(false);
    emitDraftChange(exportCanvasAsDataUrl(canvas));
  };

  useEffect(() => {
    if (activeTab !== "draw") return;
    initializeCanvas();
  }, [activeTab, initializeCanvas, toolBaseImage]);

  const handleTabChange = useCallback(
    (value: string) => {
      const nextTab = value as EditorTab;
      if (nextTab === activeTab) return;

      setActiveTab(nextTab);
      setToolBaseImage(draftImage);
      setCrop(undefined);
      setIsDrawing(false);
    },
    [activeTab, draftImage]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="crop" className="flex items-center gap-2">
              <CropIcon className="h-4 w-4" />
              {t("crop")}
            </TabsTrigger>
            <TabsTrigger value="draw" className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              {t("draw")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          {activeTab === "draw" && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("brushSize")}:</span>
              <input
                type="range"
                min="5"
                max="50"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-24"
              />
              <span className="w-6 text-sm">{brushSize}</span>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={resetCurrentTool}>
            <RotateCcw className="mr-1 h-4 w-4" />
            {t("reset")}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/50 p-4">
        {activeTab === "crop" ? (
          <ReactCrop
            crop={crop}
            onChange={(nextCrop) => setCrop(nextCrop)}
            onComplete={handleCropComplete}
            keepSelection
            className="max-h-full max-w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={cropImageRef}
              src={toolBaseImage}
              alt="Edit"
              data-testid="crop-editor-image"
              className="max-h-[calc(90vh-200px)] max-w-full object-contain"
              onLoad={(e) => {
                const img = e.currentTarget;
                setCrop(createCenteredCropSelection(img.naturalWidth, img.naturalHeight));
              }}
            />
          </ReactCrop>
        ) : (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={drawImageRef}
              src={toolBaseImage}
              alt="Edit"
              className="hidden"
              onLoad={initializeCanvas}
            />
            <canvas
              ref={canvasRef}
              data-testid="draw-editor-canvas"
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
              onPointerCancel={stopDrawing}
              className={cn(
                "max-h-[calc(90vh-200px)] max-w-full border shadow-sm",
                activeTab === "draw" && "cursor-crosshair"
              )}
            />
          </div>
        )}
      </div>

      <div className="bg-muted px-4 py-2 text-center text-sm text-muted-foreground">
        {activeTab === "crop" ? t("cropHint") : t("drawHint")}
      </div>
    </div>
  );
}

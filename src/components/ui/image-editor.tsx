"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import ReactCrop, {
  areCropsEqual,
  type Crop,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Crop as CropIcon, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

export interface ImageEditorHandle {
  hasPendingToolChanges: () => boolean;
  commitCurrentTool: () => { data: string; mimeType: string } | null;
  discardCurrentTool: () => void;
  getConfirmedImage: () => { data: string; mimeType: string };
}

type EditorTool = "crop" | "draw";

interface EditorImage {
  data: string;
  mimeType: string;
}

const EXPORT_MIME_TYPE = "image/jpeg";
const EXPORT_QUALITY = 0.9;

function getMimeTypeFromDataUrl(dataUrl: string) {
  return dataUrl.match(/^data:([^;]+);base64,/)?.[1] ?? EXPORT_MIME_TYPE;
}

function createEditorImage(data: string): EditorImage {
  return {
    data,
    mimeType: getMimeTypeFromDataUrl(data),
  };
}

function exportCanvasAsDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL(EXPORT_MIME_TYPE, EXPORT_QUALITY);
}

export const ImageEditor = forwardRef<ImageEditorHandle, ImageEditorProps>(function ImageEditor(
  { image, onChange },
  ref
) {
  const t = useTranslations("ImageEditor");
  const initialImage = createEditorImage(image);
  const [activeTool, setActiveTool] = useState<EditorTool | null>(null);
  const [confirmedImage, setConfirmedImage] = useState<EditorImage>(initialImage);
  const [toolBaseImage, setToolBaseImage] = useState(initialImage.data);
  const [crop, setCrop] = useState<Crop>();
  const [initialCrop, setInitialCrop] = useState<Crop>();
  const [brushSize, setBrushSize] = useState(10);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawChanges, setHasDrawChanges] = useState(false);
  const [pendingSwitchTool, setPendingSwitchTool] = useState<EditorTool | null>(null);

  const cropImageRef = useRef<HTMLImageElement>(null);
  const drawImageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const hasCropChanges =
    activeTool === "crop" &&
    crop !== undefined &&
    initialCrop !== undefined &&
    !areCropsEqual(crop, initialCrop);

  const hasPendingToolChanges =
    activeTool === "crop" ? hasCropChanges : activeTool === "draw" ? hasDrawChanges : false;

  const canSaveCurrentTool = hasPendingToolChanges;

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

  const startTool = useCallback((tool: EditorTool, baseImage: string) => {
    setActiveTool(tool);
    setToolBaseImage(baseImage);
    setCrop(undefined);
    setInitialCrop(undefined);
    setHasDrawChanges(false);
    setIsDrawing(false);
  }, []);

  const exitTool = useCallback(() => {
    setActiveTool(null);
    setCrop(undefined);
    setInitialCrop(undefined);
    setHasDrawChanges(false);
    setIsDrawing(false);
  }, []);

  const buildCropResult = useCallback((): EditorImage | null => {
    if (crop === undefined || initialCrop === undefined || areCropsEqual(crop, initialCrop)) {
      return null;
    }

    const img = cropImageRef.current;
    if (!img) return null;

    const scaledCrop = scaleCropToImagePixels(img, crop as PixelCrop);
    const canvas = document.createElement("canvas");
    canvas.width = scaledCrop.width;
    canvas.height = scaledCrop.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

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

    return createEditorImage(exportCanvasAsDataUrl(canvas));
  }, [crop, initialCrop]);

  const buildDrawResult = useCallback((): EditorImage | null => {
    if (!hasDrawChanges) return null;

    const canvas = canvasRef.current;
    if (!canvas) return null;

    return createEditorImage(exportCanvasAsDataUrl(canvas));
  }, [hasDrawChanges]);

  const applyCurrentToolResult = useCallback((): EditorImage | null => {
    const nextImage = activeTool === "crop" ? buildCropResult() : activeTool === "draw" ? buildDrawResult() : null;
    if (nextImage === null) return null;

    setConfirmedImage(nextImage);
    onChange(nextImage);
    return nextImage;
  }, [activeTool, buildCropResult, buildDrawResult, onChange]);

  const commitCurrentTool = useCallback(() => {
    const nextImage = applyCurrentToolResult();
    if (nextImage !== null) {
      exitTool();
      return nextImage;
    }

    exitTool();
    return confirmedImage;
  }, [applyCurrentToolResult, confirmedImage, exitTool]);

  const discardCurrentTool = useCallback(() => {
    exitTool();
  }, [exitTool]);

  const resetCurrentTool = useCallback(() => {
    if (activeTool === "crop") {
      setCrop(initialCrop);
      return;
    }

    if (activeTool === "draw") {
      initializeCanvas();
      setHasDrawChanges(false);
      setIsDrawing(false);
    }
  }, [activeTool, initialCrop, initializeCanvas]);

  const handleSaveCurrentTool = useCallback(() => {
    if (!canSaveCurrentTool) return;

    commitCurrentTool();
  }, [canSaveCurrentTool, commitCurrentTool]);

  const handleCancelCurrentTool = useCallback(() => {
    discardCurrentTool();
  }, [discardCurrentTool]);

  const resolvePendingSwitch = useCallback(
    (shouldSave: boolean) => {
      const nextTool = pendingSwitchTool;
      if (nextTool === null) return;

      let nextBaseImage = confirmedImage.data;

      if (shouldSave) {
        const nextImage = applyCurrentToolResult();
        if (nextImage !== null) {
          nextBaseImage = nextImage.data;
        }
      }

      setPendingSwitchTool(null);
      startTool(nextTool, nextBaseImage);
    },
    [applyCurrentToolResult, confirmedImage.data, pendingSwitchTool, startTool]
  );

  const handleToolClick = useCallback(
    (tool: EditorTool) => {
      if (tool === activeTool) return;

      if (activeTool !== null && hasPendingToolChanges) {
        setPendingSwitchTool(tool);
        return;
      }

      startTool(tool, confirmedImage.data);
    },
    [activeTool, confirmedImage.data, hasPendingToolChanges, startTool]
  );

  const handleCropChange = useCallback((nextCrop: PixelCrop) => {
    setCrop(nextCrop);
  }, []);

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool !== "draw") return;

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
    if (!isDrawing || activeTool !== "draw") return;

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
    setHasDrawChanges(true);
  };

  useEffect(() => {
    if (activeTool !== "draw") return;
    initializeCanvas();
  }, [activeTool, initializeCanvas, toolBaseImage]);

  useImperativeHandle(
    ref,
    () => ({
      hasPendingToolChanges: () => hasPendingToolChanges,
      commitCurrentTool,
      discardCurrentTool,
      getConfirmedImage: () => confirmedImage,
    }),
    [commitCurrentTool, confirmedImage, discardCurrentTool, hasPendingToolChanges]
  );

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={activeTool === "crop" ? "default" : "outline"}
              onClick={() => handleToolClick("crop")}
            >
              <CropIcon className="mr-1 h-4 w-4" />
              {t("crop")}
            </Button>
            <Button
              size="sm"
              variant={activeTool === "draw" ? "default" : "outline"}
              onClick={() => handleToolClick("draw")}
            >
              <Pencil className="mr-1 h-4 w-4" />
              {t("draw")}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {activeTool === "draw" && (
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

            {hasPendingToolChanges && (
              <Button variant="outline" size="sm" onClick={resetCurrentTool}>
                <RotateCcw className="mr-1 h-4 w-4" />
                {t("reset")}
              </Button>
            )}

            {activeTool !== null && (
              <>
                <Button variant="outline" size="sm" onClick={handleCancelCurrentTool}>
                  {t("cancel")}
                </Button>
                <Button size="sm" onClick={handleSaveCurrentTool} disabled={!canSaveCurrentTool}>
                  {t("save")}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/50 p-4">
          {activeTool === "crop" ? (
            <ReactCrop
              {...(crop != null ? { crop } : {})}
              onChange={handleCropChange}
              keepSelection
              className="max-h-full max-w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={cropImageRef}
                src={toolBaseImage}
                alt="Edit"
                data-testid="crop-editor-image"
                className="max-h-[calc(90vh-220px)] max-w-full object-contain"
                onLoad={(e) => {
                  const nextCrop = createCenteredCropSelection(
                    e.currentTarget.naturalWidth,
                    e.currentTarget.naturalHeight
                  );
                  setInitialCrop(nextCrop);
                  setCrop(nextCrop);
                }}
              />
            </ReactCrop>
          ) : activeTool === "draw" ? (
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
                  "max-h-[calc(90vh-220px)] max-w-full border shadow-sm",
                  activeTool === "draw" && "cursor-crosshair"
                )}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={confirmedImage.data}
                alt="Edit"
                className="max-h-[calc(90vh-220px)] max-w-full rounded-md border object-contain shadow-sm"
              />
              <p className="text-sm text-muted-foreground">{t("selectToolHint")}</p>
            </div>
          )}
        </div>

        <div className="bg-muted px-4 py-2 text-center text-sm text-muted-foreground">
          {activeTool === "crop"
            ? t("cropHint")
            : activeTool === "draw"
              ? t("drawHint")
              : t("idleHint")}
        </div>
      </div>

      <ConfirmDialog
        open={pendingSwitchTool !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingSwitchTool(null);
          }
        }}
        title={t("pendingChangesTitle")}
        description={t("pendingChangesSwitchDescription")}
        cancelLabel={t("continueEditing")}
        onConfirm={() => {}}
        onSave={() => resolvePendingSwitch(true)}
        onDiscard={() => resolvePendingSwitch(false)}
      />
    </>
  );
});

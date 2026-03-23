"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { areCropsEqual, type Crop, type PixelCrop } from "react-image-crop";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImageEditorCropPane } from "./image-editor-crop-pane";
import {
  createEditorImage,
  exportCanvasAsDataUrl,
  selectCurrentToolResult,
} from "./image-editor.core";
import { ImageEditorDrawPane } from "./image-editor-draw-pane";
import { ImageEditorToolbar } from "./image-editor-toolbar";
import type { EditorImage, EditorTool, ImageEditorHandle } from "./image-editor.types";
import {
  mapPointerToCanvasPosition,
  scaleCropToImagePixels,
} from "./image-editor.utils";

interface ImageEditorProps {
  image: string; // base64 data URL
  onChange: (editedImage: { data: string; mimeType: string }) => void;
}
export type { ImageEditorHandle } from "./image-editor.types";

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
    const nextImage = selectCurrentToolResult(
      activeTool,
      activeTool === "crop" ? buildCropResult() : null,
      activeTool === "draw" ? buildDrawResult() : null
    );
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

  const handleInitializeCrop = useCallback((nextCrop: Crop) => {
    setInitialCrop(nextCrop);
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
        <ImageEditorToolbar
          activeTool={activeTool}
          brushSize={brushSize}
          hasPendingToolChanges={hasPendingToolChanges}
          canSaveCurrentTool={canSaveCurrentTool}
          cropLabel={t("crop")}
          drawLabel={t("draw")}
          brushSizeLabel={t("brushSize")}
          resetLabel={t("reset")}
          cancelLabel={t("cancel")}
          saveLabel={t("save")}
          onSelectTool={handleToolClick}
          onBrushSizeChange={setBrushSize}
          onReset={resetCurrentTool}
          onCancel={handleCancelCurrentTool}
          onSave={handleSaveCurrentTool}
        />

        <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/50 p-4">
          {activeTool === "crop" ? (
            <ImageEditorCropPane
              image={toolBaseImage}
              crop={crop}
              imageRef={cropImageRef}
              onCropChange={handleCropChange}
              onInitializeCrop={handleInitializeCrop}
            />
          ) : activeTool === "draw" ? (
            <ImageEditorDrawPane
              image={toolBaseImage}
              imageRef={drawImageRef}
              canvasRef={canvasRef}
              onInitializeCanvas={initializeCanvas}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
            />
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

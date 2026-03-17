"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Crop as CropIcon, Pencil, RotateCcw, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageEditorProps {
  image: string; // base64 data URL
  onChange: (editedImage: { data: string; mimeType: string }) => void;
}

export function ImageEditor({ image, onChange }: ImageEditorProps) {
  const t = useTranslations("ImageEditor");
  const [activeTab, setActiveTab] = useState<"crop" | "draw">("crop");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(10);
  const [isProcessing, setIsProcessing] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize canvas with image
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to match image
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw image
    ctx.drawImage(img, 0, 0);
  }, [image]);

  // Handle crop completion
  const onCropComplete = useCallback((crop: PixelCrop) => {
    setCompletedCrop(crop);
  }, []);

  // Apply crop
  const applyCrop = useCallback(async () => {
    if (!completedCrop || !imgRef.current) return;

    setIsProcessing(true);
    const img = imgRef.current;

    // Create a canvas for the cropped image
    const canvas = document.createElement("canvas");
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      img,
      completedCrop.x,
      completedCrop.y,
      completedCrop.width,
      completedCrop.height,
      0,
      0,
      completedCrop.width,
      completedCrop.height
    );

    // Convert to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    if (blob) {
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        onChange({ data, mimeType: "image/jpeg" });
        setIsProcessing(false);
      };
      reader.readAsDataURL(blob);
    }
  }, [completedCrop, onChange]);

  // Drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTab !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || activeTab !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)"; // Semi-transparent black for masking
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    // Export the drawn image
    const canvas = canvasRef.current;
    if (!canvas) return;

    const data = canvas.toDataURL("image/jpeg", 0.9);
    onChange({ data, mimeType: "image/jpeg" });
  };

  // Reset canvas
  const resetCanvas = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "crop" | "draw")}>
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

        {activeTab === "draw" && (
          <div className="flex items-center gap-4">
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
              <span className="text-sm w-6">{brushSize}</span>
            </div>
            <Button variant="outline" size="sm" onClick={resetCanvas}>
              <RotateCcw className="h-4 w-4 mr-1" />
              {t("reset")}
            </Button>
          </div>
        )}

        {activeTab === "crop" && completedCrop && (
          <Button
            size="sm"
            onClick={applyCrop}
            disabled={isProcessing}
          >
            <Check className="h-4 w-4 mr-1" />
            {t("applyCrop")}
          </Button>
        )}
      </div>

      {/* Editor Area */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/50">
        {activeTab === "crop" ? (
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={onCropComplete}
            className="max-w-full max-h-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={image}
              alt="Edit"
              className="max-w-full max-h-[calc(90vh-200px)] object-contain"
            />
          </ReactCrop>
        ) : (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={image}
              alt="Edit"
              className="hidden"
              onLoad={() => {
                // Initialize canvas when image loads
                const canvas = canvasRef.current;
                const img = imgRef.current;
                if (!canvas || !img) return;
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                ctx.drawImage(img, 0, 0);
              }}
            />
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className={cn(
                "max-w-full max-h-[calc(90vh-200px)] object-contain border shadow-sm",
                activeTab === "draw" && "cursor-crosshair"
              )}
            />
          </div>
        )}
      </div>

      {/* Hint */}
      <div className="px-4 py-2 bg-muted text-sm text-muted-foreground text-center">
        {activeTab === "crop"
          ? t("cropHint")
          : t("drawHint")}
      </div>
    </div>
  );
}

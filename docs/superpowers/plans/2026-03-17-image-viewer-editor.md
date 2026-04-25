# Image Viewer & Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current custom ImageViewer with react-medium-image-zoom for simple viewing, and add an image editor (crop + draw) for the retry/edit mode.

**Architecture:**
- **Simple Viewing:** Use `react-medium-image-zoom` (CodeChecker-style) for all read-only image viewing across the app
- **Edit Mode:** Create a new `ImageEditor` component with `react-image-crop` for cropping and a lightweight Canvas-based drawing tool for annotation/masking
- **Integration:** Modify `SourceDocumentInput` to show "编辑" button on images in retry mode, opening the editor

**Tech Stack:** react-medium-image-zoom, react-image-crop, HTML5 Canvas API

---

## File Structure

```
src/components/ui/
├── image-viewer.tsx          # MODIFY: Replace with react-medium-image-zoom wrapper
├── image-editor.tsx          # CREATE: Crop + draw editor for edit mode
└── image-editor-dialog.tsx   # CREATE: Dialog wrapper for the editor

src/features/source-document/components/
└── SourceDocumentInput.tsx   # MODIFY: Add edit button + integrate editor

messages/
├── en.json                   # MODIFY: Add ImageEditor translations
└── zh.json                   # MODIFY: Add ImageEditor translations
```

---

## Chunk 1: Setup and Simple Viewer Replacement

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install react-medium-image-zoom**

```bash
npm install react-medium-image-zoom
```

- [ ] **Step 2: Run npm install**

```bash
npm install
```

Expected: Packages installed successfully

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add react-medium-image-zoom"
```

---

### Task 2: Replace ImageViewer with react-medium-image-zoom

**Files:**
- Modify: `src/components/ui/image-viewer.tsx` (complete rewrite)
- Test: Manually verify zoom works in image gallery

**Context:** The current ImageViewer is a custom implementation with its own zoom/rotate/pan. We replace it with the community-standard react-medium-image-zoom for a cleaner UX (like CodeChecker).

- [ ] **Step 1: Rewrite ImageViewer component**

```tsx
"use client";

import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import { useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageViewerProps {
  images: string[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageViewer({ images, initialIndex = 0, open, onOpenChange }: ImageViewerProps) {
  const [index, setIndex] = React.useState(initialIndex);

  useEffect(() => {
    if (open) {
      setIndex(initialIndex);
    }
  }, [open, initialIndex]);

  // Keyboard support for navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < images.length - 1) {
        setIndex(index + 1);
      }
      if (e.key === "ArrowLeft" && index > 0) {
        setIndex(index - 1);
      }
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, index, images.length, onOpenChange]);

  if (images.length === 0 || !open) return null;

  return (
    <div className="fixed inset-0 z-[500] bg-black/90 flex flex-col">
      {/* Header with close button */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          className="text-white/70 hover:text-white hover:bg-white/10 rounded-full"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Main image with zoom */}
      <div className="flex-1 flex items-center justify-center p-4">
        <Zoom>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[index]}
            alt={`Image ${index + 1}`}
            className="max-w-full max-h-full object-contain"
            style={{ maxHeight: "calc(100vh - 120px)" }}
          />
        </Zoom>
      </div>

      {/* Navigation for multiple images */}
      {images.length > 1 && (
        <>
          {/* Prev/Next buttons */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white hover:bg-white/10 h-12 w-12 hidden sm:flex"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white hover:bg-white/10 h-12 w-12 hidden sm:flex"
            onClick={() => setIndex((i) => Math.min(images.length - 1, i + 1))}
            disabled={index === images.length - 1}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>

          {/* Thumbnails */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[80vw] p-2 bg-black/50 backdrop-blur-sm rounded-full">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={cn(
                  "relative w-12 h-12 rounded-md overflow-hidden border-2 transition-all shrink-0",
                  i === index
                    ? "border-primary scale-110"
                    : "border-transparent opacity-50 hover:opacity-80"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>

          {/* Counter */}
          <div className="absolute top-4 left-4 text-white/70 text-sm">
            {index + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds without errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/image-viewer.tsx
git commit -m "feat: replace custom ImageViewer with react-medium-image-zoom"
```

---

## Chunk 2: Image Editor Component

### Task 3: Create Image Editor Dialog Component

**Files:**
- Create: `src/components/ui/image-editor-dialog.tsx`

**Context:** This is the dialog wrapper that will be used in SourceDocumentInput for editing images.

- [ ] **Step 1: Create the dialog component**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImageEditor } from "./image-editor";

interface ImageEditorDialogProps {
  image: string; // base64 data URL
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (editedImage: { data: string; mimeType: string }) => void;
}

export function ImageEditorDialog({
  image,
  open,
  onOpenChange,
  onSave,
}: ImageEditorDialogProps) {
  const t = useTranslations("ImageEditor");
  const [editedImage, setEditedImage] = useState<{ data: string; mimeType: string } | null>(null);

  const handleSave = () => {
    if (editedImage) {
      onSave(editedImage);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <ImageEditor
            image={image}
            onChange={setEditedImage}
          />
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!editedImage}>
            {t("save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/image-editor-dialog.tsx
git commit -m "feat: add ImageEditorDialog component"
```

---

### Task 4: Create Image Editor Component with Crop + Draw

**Files:**
- Create: `src/components/ui/image-editor.tsx`

**Context:** This is the main editor component combining react-image-crop for cropping and Canvas for drawing/annotation.

- [ ] **Step 1: Install react-image-crop**

```bash
npm install react-image-crop
```

- [ ] **Step 2: Create the ImageEditor component**

```tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/image-editor.tsx package.json package-lock.json
git commit -m "feat: add ImageEditor component with crop and draw"
```

---

## Chunk 3: Integration and Translations

### Task 5: Add Translation Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add English translations**

Add to `messages/en.json`:

```json
"ImageEditor": {
  "title": "Edit Image",
  "crop": "Crop",
  "draw": "Draw",
  "brushSize": "Brush Size",
  "reset": "Reset",
  "applyCrop": "Apply Crop",
  "cancel": "Cancel",
  "save": "Save",
  "cropHint": "Drag to select the area you want to keep",
  "drawHint": "Draw on the image to mask or annotate"
}
```

- [ ] **Step 2: Add Chinese translations**

Add to `messages/zh.json`:

```json
"ImageEditor": {
  "title": "编辑图片",
  "crop": "裁剪",
  "draw": "涂鸦",
  "brushSize": "画笔大小",
  "reset": "重置",
  "applyCrop": "应用裁剪",
  "cancel": "取消",
  "save": "保存",
  "cropHint": "拖动选择要保留的区域",
  "drawHint": "在图片上涂抹以遮盖或标注"
}
```

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/zh.json
git commit -m "i18n: add ImageEditor translations"
```

---

### Task 6: Integrate Editor into SourceDocumentInput

**Files:**
- Modify: `src/features/source-document/components/SourceDocumentInput.tsx`

**Context:** Modify the image preview grid to show an "Edit" button (only in retry mode), which opens the ImageEditorDialog.

- [ ] **Step 1: Import the new components**

Add imports at the top:

```tsx
import { ImageEditorDialog } from "@/components/ui/image-editor-dialog";
import { Pencil } from "lucide-react"; // Add to existing lucide imports
```

- [ ] **Step 2: Add state for editor**

Add to the component state (after `selectedImageIndex`):

```tsx
const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);
```

- [ ] **Step 3: Modify the image grid to show edit button in retry mode**

Replace the images grid section (around line 200-220) with:

```tsx
{images.length > 0 && (
  <div className="grid grid-cols-4 gap-2">
    {images.map((img, idx) => (
      <div key={idx} className="relative group">
        <div
          className="aspect-square relative w-full overflow-hidden rounded-md border border-border cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => setSelectedImageIndex(idx)}
        >
          <Image src={img.data} alt={`Uploaded ${idx + 1}`} fill className="object-cover" />
        </div>

        {/* Delete button - always visible on hover */}
        <button
          onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
          className="absolute -top-2 -right-2 w-5 h-5 bg-danger text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ×
        </button>

        {/* Edit button - only in retry mode */}
        {mode === "retry" && (
          <button
            onClick={() => setEditingImageIndex(idx)}
            className="absolute top-1 right-1 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title={t("editImage")}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Add the editor dialog**

Add before the closing `</div>` of the component:

```tsx
{/* Image Editor Dialog */}
{editingImageIndex !== null && (
  <ImageEditorDialog
    image={images[editingImageIndex]?.data}
    open={editingImageIndex !== null}
    onOpenChange={(open) => !open && setEditingImageIndex(null)}
    onSave={(editedImage) => {
      setImages((prev) =>
        prev.map((img, i) => (i === editingImageIndex ? editedImage : img))
      );
      setEditingImageIndex(null);
    }}
  />
)}
```

- [ ] **Step 5: Add translation for editImage button**

Add to `messages/en.json` in `SourceDocumentInput` section:

```json
"editImage": "Edit image"
```

Add to `messages/zh.json` in `SourceDocumentInput` section:

```json
"editImage": "编辑图片"
```

- [ ] **Step 6: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/features/source-document/components/SourceDocumentInput.tsx messages/en.json messages/zh.json
git commit -m "feat: integrate ImageEditor into SourceDocumentInput for retry mode"
```

---

## Chunk 4: Testing and Verification

### Task 7: Manual Testing Checklist

- [ ] **Step 1: Test image viewer in non-retry mode**

1. Navigate to create source document
2. Upload images
3. Click on an image to view
4. Verify: Zoom works (click to zoom), ESC closes, arrows navigate

- [ ] **Step 2: Test image editor in retry mode**

1. Navigate to a failed/retryable source document
2. Click the retry button
3. Verify: Edit (pencil) button appears on images
4. Click edit button
5. Test crop: drag to select area, click "Apply Crop"
6. Test draw: switch to draw tab, draw on image, click "Save"
7. Verify: Edited image replaces original in the preview

- [ ] **Step 3: Test edge cases**

- Single image (no navigation arrows)
- Multiple images (navigation works)
- Cancel edit (image unchanged)
- Large images (performance OK)

- [ ] **Step 4: Run linter**

```bash
npm run lint
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "test: verify image viewer and editor functionality"
```

---

## Summary

This plan implements:

1. **Simple Image Viewing**: Replaces the complex custom ImageViewer with react-medium-image-zoom (CodeChecker-style), providing a cleaner UX for viewing images

2. **Image Editing in Retry Mode**: Adds crop + draw functionality specifically for the retry/edit workflow, allowing users to:
   - Crop out unwanted parts of receipts/invoices
   - Mask sensitive information before uploading

3. **Clean Integration**: The edit button only appears in retry mode, keeping the create flow simple while enabling powerful editing when needed.

**Estimated effort:** 2-3 hours

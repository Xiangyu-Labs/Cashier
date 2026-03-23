"use client";
import { Crop as CropIcon, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EditorTool } from "./image-editor.types";

interface ImageEditorToolbarProps {
  activeTool: EditorTool | null;
  brushSize: number;
  hasPendingToolChanges: boolean;
  canSaveCurrentTool: boolean;
  cropLabel: string;
  drawLabel: string;
  brushSizeLabel: string;
  resetLabel: string;
  cancelLabel: string;
  saveLabel: string;
  onSelectTool: (tool: EditorTool) => void;
  onBrushSizeChange: (nextSize: number) => void;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function ImageEditorToolbar({
  activeTool,
  brushSize,
  hasPendingToolChanges,
  canSaveCurrentTool,
  cropLabel,
  drawLabel,
  brushSizeLabel,
  resetLabel,
  cancelLabel,
  saveLabel,
  onSelectTool,
  onBrushSizeChange,
  onReset,
  onCancel,
  onSave,
}: ImageEditorToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={activeTool === "crop" ? "default" : "outline"}
          onClick={() => onSelectTool("crop")}
        >
          <CropIcon className="mr-1 h-4 w-4" />
          {cropLabel}
        </Button>
        <Button
          size="sm"
          variant={activeTool === "draw" ? "default" : "outline"}
          onClick={() => onSelectTool("draw")}
        >
          <Pencil className="mr-1 h-4 w-4" />
          {drawLabel}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {activeTool === "draw" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{brushSizeLabel}:</span>
            <input
              aria-label={brushSizeLabel}
              type="range"
              min="5"
              max="50"
              value={brushSize}
              onChange={(event) => onBrushSizeChange(Number(event.target.value))}
              className="w-24"
            />
            <span className="w-6 text-sm">{brushSize}</span>
          </div>
        )}

        {hasPendingToolChanges && (
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="mr-1 h-4 w-4" />
            {resetLabel}
          </Button>
        )}

        {activeTool !== null && (
          <>
            <Button variant="outline" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button size="sm" onClick={onSave} disabled={!canSaveCurrentTool}>
              {saveLabel}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

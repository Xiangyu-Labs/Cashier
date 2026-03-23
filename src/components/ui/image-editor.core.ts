import type { EditorImage, EditorTool } from "./image-editor.types";

export const EXPORT_MIME_TYPE = "image/jpeg";
export const EXPORT_QUALITY = 0.9;

export function getMimeTypeFromDataUrl(dataUrl: string) {
  return dataUrl.match(/^data:([^;]+);base64,/)?.[1] ?? EXPORT_MIME_TYPE;
}

export function createEditorImage(data: string): EditorImage {
  return {
    data,
    mimeType: getMimeTypeFromDataUrl(data),
  };
}

export function exportCanvasAsDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL(EXPORT_MIME_TYPE, EXPORT_QUALITY);
}

export function selectCurrentToolResult(
  activeTool: EditorTool | null,
  cropResult: EditorImage | null,
  drawResult: EditorImage | null
) {
  return activeTool === "crop" ? cropResult : activeTool === "draw" ? drawResult : null;
}

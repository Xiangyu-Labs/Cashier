export type EditorTool = "crop" | "draw";

export interface EditorImage {
  data: string;
  mimeType: string;
}

export interface ImageEditorHandle {
  hasPendingToolChanges: () => boolean;
  commitCurrentTool: () => EditorImage | null;
  discardCurrentTool: () => void;
  getConfirmedImage: () => EditorImage;
}

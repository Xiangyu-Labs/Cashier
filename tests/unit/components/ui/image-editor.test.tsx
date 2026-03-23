import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEditorImage,
  exportCanvasAsDataUrl,
  getMimeTypeFromDataUrl,
  selectCurrentToolResult,
} from "@/components/ui/image-editor.core";
import { ImageEditor, type ImageEditorHandle } from "@/components/ui/image-editor";
import type { EditorImage } from "@/components/ui/image-editor.types";

vi.mock("react-image-crop", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    __esModule: true,
    default: ({
      children,
      crop,
      onChange,
      className,
    }: {
      children?: ReactNode;
      crop?: { x?: number; y?: number; width?: number; height?: number; unit?: string };
      onChange: (nextCrop: {
        unit: "px";
        x: number;
        y: number;
        width: number;
        height: number;
      }) => void;
      className?: string;
    }) =>
      React.createElement(
        "div",
        {
          className,
          "data-testid": "mock-react-crop",
          "data-crop": crop == null ? "" : JSON.stringify(crop),
        },
        children,
        React.createElement(
          "button",
          {
            type: "button",
            "data-testid": "mock-react-crop-change",
            onClick: () =>
              onChange({
                unit: "px",
                x: 25,
                y: 15,
                width: 120,
                height: 80,
              }),
          },
          "change crop"
        )
      ),
    areCropsEqual: (
      left?: { x?: number; y?: number; width?: number; height?: number; unit?: string },
      right?: { x?: number; y?: number; width?: number; height?: number; unit?: string }
    ) => JSON.stringify(left) === JSON.stringify(right),
    centerCrop: (crop: { width?: number; height?: number; unit?: string }) => ({
      ...crop,
      x: (100 - (crop.width ?? 0)) / 2,
      y: (100 - (crop.height ?? 0)) / 2,
    }),
  };
});

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    cancelLabel,
    onOpenChange,
    onSave,
    onDiscard,
  }: {
    open?: boolean;
    title: string;
    description: string;
    cancelLabel?: string;
    onOpenChange?: (open: boolean) => void;
    onSave?: () => void;
    onDiscard?: () => void;
  }) =>
    open ? (
      <div data-testid="mock-confirm-dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button" onClick={() => onOpenChange?.(false)}>
          {cancelLabel ?? "cancel"}
        </button>
        <button type="button" onClick={() => onDiscard?.()}>
          discard
        </button>
        <button type="button" onClick={() => onSave?.()}>
          save
        </button>
      </div>
    ) : null,
}));

const mockCanvasContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  lineCap: "round",
  lineJoin: "round",
  lineTo: vi.fn(),
  lineWidth: 0,
  moveTo: vi.fn(),
  stroke: vi.fn(),
  strokeStyle: "",
} satisfies Partial<CanvasRenderingContext2D>;

const canvasToDataUrl = vi.fn(() => "data:image/jpeg;base64,edited");
const canvasGetContext = vi.fn(() => mockCanvasContext as CanvasRenderingContext2D);

function setLoadedImageSize(element: HTMLImageElement, width = 400, height = 300) {
  Object.defineProperties(element, {
    complete: {
      configurable: true,
      value: true,
    },
    naturalWidth: {
      configurable: true,
      value: width,
    },
    naturalHeight: {
      configurable: true,
      value: height,
    },
    width: {
      configurable: true,
      value: width,
    },
    height: {
      configurable: true,
      value: height,
    },
  });
}

async function enterCropModeAndChangeSelection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "裁剪" }));

  const cropImage = screen.getByTestId("crop-editor-image") as HTMLImageElement;
  setLoadedImageSize(cropImage);
  fireEvent.load(cropImage);

  await user.click(screen.getByTestId("mock-react-crop-change"));
}

async function enterDrawMode(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
  image = "data:image/png;base64,original"
) {
  await user.click(screen.getByRole("button", { name: "涂鸦" }));

  const drawImage = container.querySelector(`img.hidden[src="${image}"]`) as HTMLImageElement | null;
  if (drawImage == null) {
    throw new Error("Draw mode image was not rendered");
  }

  setLoadedImageSize(drawImage);
  fireEvent.load(drawImage);

  const canvas = screen.getByTestId("draw-editor-canvas") as HTMLCanvasElement;
  Object.defineProperty(canvas, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: 300,
      height: 300,
      left: 0,
      right: 400,
      toJSON: () => "",
      top: 0,
      width: 400,
      x: 0,
      y: 0,
    }),
  });

  return canvas;
}

function drawStroke(canvas: HTMLCanvasElement) {
  fireEvent.pointerDown(canvas, {
    clientX: 40,
    clientY: 50,
    pointerId: 1,
  });
  fireEvent.pointerMove(canvas, {
    clientX: 120,
    clientY: 140,
    pointerId: 1,
  });
  fireEvent.pointerUp(canvas, {
    clientX: 120,
    clientY: 140,
    pointerId: 1,
  });
}

describe("ImageEditor", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: canvasGetContext,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
      configurable: true,
      value: canvasToDataUrl,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });

    canvasGetContext.mockClear();
    canvasToDataUrl.mockClear();
    mockCanvasContext.beginPath.mockClear();
    mockCanvasContext.clearRect.mockClear();
    mockCanvasContext.drawImage.mockClear();
    mockCanvasContext.lineTo.mockClear();
    mockCanvasContext.moveTo.mockClear();
    mockCanvasContext.stroke.mockClear();
  });

  it("exposes the confirmed image through the imperative handle", () => {
    const ref = createRef<ImageEditorHandle>();

    render(
      <ImageEditor
        ref={ref}
        image="data:image/png;base64,original"
        onChange={vi.fn()}
      />
    );

    expect(ref.current?.getConfirmedImage()).toEqual({
      data: "data:image/png;base64,original",
      mimeType: "image/png",
    });
  });

  it("does not switch tools immediately when the current tool has pending changes", async () => {
    const ref = createRef<ImageEditorHandle>();
    const user = userEvent.setup();

    render(
      <ImageEditor
        ref={ref}
        image="data:image/png;base64,original"
        onChange={vi.fn()}
      />
    );

    await enterCropModeAndChangeSelection(user);

    expect(ref.current?.hasPendingToolChanges()).toBe(true);

    await user.click(screen.getByRole("button", { name: "涂鸦" }));

    expect(screen.getByText("当前编辑尚未保存")).toBeTruthy();
    expect(screen.getByTestId("crop-editor-image")).toBeTruthy();
    expect(screen.queryByTestId("draw-editor-canvas")).toBeNull();
  });

  it("commits the current tool through the imperative handle and emits onChange", async () => {
    const onChange = vi.fn();
    const ref = createRef<ImageEditorHandle>();
    const user = userEvent.setup();

    render(
      <ImageEditor
        ref={ref}
        image="data:image/png;base64,original"
        onChange={onChange}
      />
    );

    await enterCropModeAndChangeSelection(user);

    let committedImage: ReturnType<ImageEditorHandle["commitCurrentTool"]> = null;
    act(() => {
      committedImage = ref.current?.commitCurrentTool() ?? null;
    });

    expect(committedImage).toEqual({
      data: "data:image/jpeg;base64,edited",
      mimeType: "image/jpeg",
    });
    expect(onChange).toHaveBeenCalledWith({
      data: "data:image/jpeg;base64,edited",
      mimeType: "image/jpeg",
    });
    expect(ref.current?.getConfirmedImage()).toEqual({
      data: "data:image/jpeg;base64,edited",
      mimeType: "image/jpeg",
    });
  });

  it("shows draw controls only in draw mode and delegates reset save and cancel actions", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ImageEditor
        image="data:image/png;base64,original"
        onChange={onChange}
      />
    );

    expect(screen.queryByLabelText("画笔大小")).toBeNull();

    const canvas = await enterDrawMode(user, container);
    const brushSizeSlider = screen.getByLabelText("画笔大小") as HTMLInputElement;
    const saveButton = screen.getByRole("button", { name: "保存" }) as HTMLButtonElement;

    expect(brushSizeSlider.value).toBe("10");
    fireEvent.change(brushSizeSlider, { target: { value: "24" } });
    expect(screen.getByText("24")).toBeTruthy();

    expect(saveButton.disabled).toBe(true);
    drawStroke(canvas);
    expect(saveButton.disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: "重置" }));
    expect(saveButton.disabled).toBe(true);

    drawStroke(canvas);
    await user.click(saveButton);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({
      data: "data:image/jpeg;base64,edited",
      mimeType: "image/jpeg",
    });
    expect(screen.queryByLabelText("画笔大小")).toBeNull();

    const secondCanvas = await enterDrawMode(user, container, "data:image/jpeg;base64,edited");
    drawStroke(secondCanvas);
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("画笔大小")).toBeNull();
  });
});

describe("image-editor core", () => {
  it("derives mime type from data url with a jpeg fallback", () => {
    expect(getMimeTypeFromDataUrl("data:image/png;base64,abc")).toBe("image/png");
    expect(getMimeTypeFromDataUrl("not-a-data-url")).toBe("image/jpeg");
  });

  it("creates a normalized editor image from raw data", () => {
    expect(createEditorImage("data:image/png;base64,abc")).toEqual({
      data: "data:image/png;base64,abc",
      mimeType: "image/png",
    });
  });

  it("exports canvases using the editor jpeg defaults", () => {
    const canvas = document.createElement("canvas");

    expect(exportCanvasAsDataUrl(canvas)).toBe("data:image/jpeg;base64,edited");
    expect(canvasToDataUrl).toHaveBeenCalledWith("image/jpeg", 0.9);
  });

  it("selects the result that matches the active tool", () => {
    const cropResult: EditorImage = {
      data: "data:image/jpeg;base64,crop",
      mimeType: "image/jpeg",
    };
    const drawResult: EditorImage = {
      data: "data:image/jpeg;base64,draw",
      mimeType: "image/jpeg",
    };

    expect(selectCurrentToolResult("crop", cropResult, drawResult)).toEqual(cropResult);
    expect(selectCurrentToolResult("draw", cropResult, drawResult)).toEqual(drawResult);
    expect(selectCurrentToolResult(null, cropResult, drawResult)).toBeNull();
  });
});

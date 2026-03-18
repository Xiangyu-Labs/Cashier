import { describe, expect, it } from "vitest";
import {
  createCenteredCropSelection,
  mapPointerToCanvasPosition,
  scaleCropToImagePixels,
} from "@/components/ui/image-editor.utils";

describe("image-editor utils", () => {
  it("creates a centered default crop selection", () => {
    const crop = createCenteredCropSelection(1000, 800);

    expect(crop.unit).toBe("%");
    expect(crop.width).toBe(80);
    expect(crop.height).toBe(80);
    expect(crop.x).toBe(10);
    expect(crop.y).toBe(10);
  });

  it("scales a rendered crop back to original image pixels", () => {
    const scaledCrop = scaleCropToImagePixels(
      {
        naturalWidth: 2400,
        naturalHeight: 1600,
        width: 600,
        height: 400,
      },
      {
        unit: "px",
        x: 50,
        y: 25,
        width: 200,
        height: 100,
      }
    );

    expect(scaledCrop).toEqual({
      unit: "px",
      x: 200,
      y: 100,
      width: 800,
      height: 400,
    });
  });

  it("maps pointer coordinates onto the backing canvas size", () => {
    const point = mapPointerToCanvasPosition({
      clientX: 150,
      clientY: 80,
      rect: {
        left: 100,
        top: 50,
        width: 200,
        height: 100,
      },
      canvasWidth: 1000,
      canvasHeight: 500,
    });

    expect(point).toEqual({
      x: 250,
      y: 150,
    });
  });
});

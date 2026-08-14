import { describe, expect, it } from "vitest";
import { fitImageDimensions } from "@/lib/image-dimensions";

describe("fitImageDimensions", () => {
  it("fits landscape images inside non-square bounds", () => {
    expect(fitImageDimensions(2000, 1000, 1200, 400)).toEqual({
      width: 800,
      height: 400,
    });
  });

  it("fits portrait images inside non-square bounds", () => {
    expect(fitImageDimensions(1000, 2000, 400, 1200)).toEqual({
      width: 400,
      height: 800,
    });
  });

  it("does not upscale images", () => {
    expect(fitImageDimensions(200, 100, 1200, 400)).toEqual({
      width: 200,
      height: 100,
    });
  });
});

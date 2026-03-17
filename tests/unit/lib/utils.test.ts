import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cn, copyToClipboard } from "@/lib/utils";

describe("cn (className utility)", () => {
  it("应该合并tailwind类名", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("应该处理条件类名", () => {
    expect(cn("px-2", false && "hidden", "py-4")).toBe("px-2 py-4");
    expect(cn("px-2", true && "block", "py-4")).toBe("px-2 block py-4");
  });

  it("应该处理undefined和null", () => {
    expect(cn("px-2", undefined, null, "py-4")).toBe("px-2 py-4");
  });
});

describe("copyToClipboard", () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>;
  let originalExecCommand: typeof document.execCommand;

  beforeEach(() => {
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteText },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "isSecureContext", {
      value: true,
      writable: true,
      configurable: true,
    });
    originalExecCommand = document.execCommand;
  });

  afterEach(() => {
    document.execCommand = originalExecCommand;
    vi.restoreAllMocks();
  });

  it("应该使用现代Clipboard API复制文本", async () => {
    const result = await copyToClipboard("Hello World");

    expect(result).toBe(true);
    expect(clipboardWriteText).toHaveBeenCalledWith("Hello World");
  });

  it("当传入空字符串时应返回false", async () => {
    const result = await copyToClipboard("");
    expect(result).toBe(false);
  });

  it("在不安全环境下应该使用降级方案", async () => {
    Object.defineProperty(window, "isSecureContext", { value: false });

    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    // Mock DOM操作
    const mockTextArea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
    };
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockReturnValue(mockTextArea as unknown as HTMLTextAreaElement);
    const appendChildSpy = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation(() => mockTextArea as unknown as Node);
    const removeChildSpy = vi
      .spyOn(document.body, "removeChild")
      .mockImplementation(() => mockTextArea as unknown as Node);

    const result = await copyToClipboard("Test text");

    expect(result).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it("当Clipboard API失败时应该使用降级方案", async () => {
    clipboardWriteText.mockRejectedValue(new Error("Clipboard error"));

    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    const mockTextArea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      mockTextArea as unknown as HTMLTextAreaElement
    );
    vi.spyOn(document.body, "appendChild").mockImplementation(
      () => mockTextArea as unknown as Node
    );
    vi.spyOn(document.body, "removeChild").mockImplementation(
      () => mockTextArea as unknown as Node
    );

    const result = await copyToClipboard("Test text");

    expect(result).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("当降级方案也失败时应该返回false", async () => {
    Object.defineProperty(window, "isSecureContext", { value: false });

    const execCommand = vi.fn().mockReturnValue(false);
    document.execCommand = execCommand;

    const mockTextArea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      mockTextArea as unknown as HTMLTextAreaElement
    );
    vi.spyOn(document.body, "appendChild").mockImplementation(
      () => mockTextArea as unknown as Node
    );
    vi.spyOn(document.body, "removeChild").mockImplementation(
      () => mockTextArea as unknown as Node
    );

    const result = await copyToClipboard("Test text");

    expect(result).toBe(false);
  });

  it("当execCommand抛出异常时应该返回false", async () => {
    Object.defineProperty(window, "isSecureContext", { value: false });

    const execCommand = vi.fn().mockImplementation(() => {
      throw new Error("execCommand failed");
    });
    document.execCommand = execCommand;

    const mockTextArea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      mockTextArea as unknown as HTMLTextAreaElement
    );
    vi.spyOn(document.body, "appendChild").mockImplementation(
      () => mockTextArea as unknown as Node
    );
    vi.spyOn(document.body, "removeChild").mockImplementation(
      () => mockTextArea as unknown as Node
    );

    const result = await copyToClipboard("Test text");

    expect(result).toBe(false);
  });
});

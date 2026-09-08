import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("serwist", () => ({
  Serwist: class {
    addEventListeners() {}
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("service worker activation protocol", () => {
  it.each([1, 2])("reports %i application windows and only activates for one", async (count) => {
    let listener!: (event: {
      data: { type: string };
      ports: { postMessage: ReturnType<typeof vi.fn> }[];
      waitUntil: (promise: Promise<void>) => void;
    }) => void;
    const skipWaiting = vi.fn().mockResolvedValue(undefined);
    const matchAll = vi.fn().mockResolvedValue([
      ...Array.from({ length: count }, (_, index) => ({
        url: `https://cashier.example/app/${index}`,
      })),
      { url: "https://cashier.example/other" },
    ]);
    vi.stubGlobal("self", {
      registration: { scope: "https://cashier.example/app/" },
      clients: { matchAll },
      skipWaiting,
      addEventListener: (_type: string, callback: typeof listener) => {
        listener = callback;
      },
    });
    await import("@/service-worker");
    const port = { postMessage: vi.fn() };
    let work!: Promise<void>;
    const waitUntil = (promise: Promise<void>) => {
      work = promise;
    };
    listener({ data: { type: "GET_WINDOW_COUNT" }, ports: [port], waitUntil });
    await work;
    expect(port.postMessage).toHaveBeenCalledWith(count);
    listener({ data: { type: "ACTIVATE_SINGLE_WINDOW" }, ports: [], waitUntil });
    await work;
    expect(skipWaiting).toHaveBeenCalledTimes(count === 1 ? 1 : 0);
  });
});

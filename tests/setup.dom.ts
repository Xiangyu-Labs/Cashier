import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import "./setup.common";

afterEach(() => {
  cleanup();
});

Object.assign(globalThis, {
  confirm: vi.fn(() => true),
});

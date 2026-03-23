import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "./setup.common";

afterEach(() => {
  cleanup();
});

Object.assign(globalThis, {
  confirm: vi.fn(() => true),
});

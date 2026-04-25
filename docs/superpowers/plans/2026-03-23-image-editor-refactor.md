# ImageEditor Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `src/components/ui/image-editor.tsx` into smaller, testable pieces while keeping the current editing contract and user-visible behavior unchanged.

**Architecture:** Keep `ImageEditor` as the public shell and imperative-ref boundary, but move pane rendering and low-level tool logic into local, image-editor-specific files. Do not introduce a generic state machine or a reusable editor framework; keep the split local to crop, draw, toolbar, and a tiny pure helper module so `SourceDocumentImageModal` continues using the same `ImageEditor` API.

**Tech Stack:** React, TypeScript, `react-image-crop`, canvas APIs, Vitest, Testing Library

---

## Scope Check

This plan is intentionally scoped to one hotspot file and its direct contract:

- `src/components/ui/image-editor.tsx`

It does **not** attempt to refactor `SourceDocumentImageModal`, other image-upload flows, or any broader “editor abstraction”. That keeps the work shippable as one focused refactor PR.

## File Map

- `src/components/ui/image-editor.tsx`
  - Final shell component. Owns public props, imperative ref contract, high-level tool/session state, and pending-switch confirmation orchestration.
- `src/components/ui/image-editor.types.ts`
  - New local types/constants shared by the shell and extracted local pieces. Keep this file tiny and specific to this editor.
- `src/components/ui/image-editor.core.ts`
  - New pure helper module for editor-image normalization and tool-result selection logic that can be unit-tested without React.
- `src/components/ui/image-editor-toolbar.tsx`
  - New presentational toolbar component. Owns buttons, brush-size slider, reset/save/cancel controls, and no editor state beyond props.
- `src/components/ui/image-editor-crop-pane.tsx`
  - New crop-only rendering component. Owns `ReactCrop`, image load initialization, and crop-change wiring.
- `src/components/ui/image-editor-draw-pane.tsx`
  - New draw-only rendering component. Owns hidden image, canvas element, pointer handlers, and draw-surface rendering.
- `src/components/ui/image-editor.utils.ts`
  - Existing utility module for geometry math. Only touch if a small rename or helper extraction makes the new panes cleaner.
- `tests/unit/components/ui/image-editor.test.tsx`
  - New direct behavior tests for the editor shell and imperative handle.
- `tests/unit/components/ui/image-editor.utils.test.ts`
  - Existing geometry utility tests. Keep them green.
- `tests/unit/source-document/components/SourceDocumentImageModal.test.tsx`
  - Existing integration-adjacent consumer test. Keep it green to prove the outer contract did not change.

## Design Constraints

- Preserve the existing public API:
  - `ImageEditor` props
  - `ImageEditorHandle`
- Preserve current interaction semantics:
  - crop and draw remain the only tools
  - pending tool changes gate tool switches
  - save/cancel/reset semantics stay the same
- No generic `useReducer` state machine layer
- No cross-component abstraction beyond this editor family
- Prefer extracted files that are narrowly local and named after their concrete responsibility

### Task 1: Lock The Current ImageEditor Contract With Direct Tests

**Files:**
- Create: `tests/unit/components/ui/image-editor.test.tsx`
- Test: `tests/unit/source-document/components/SourceDocumentImageModal.test.tsx`

- [ ] **Step 1: Write the failing direct ImageEditor behavior tests**

Create a new test file that covers the public contract directly instead of only through `SourceDocumentImageModal`.

Include tests like:

```tsx
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
  // Enter crop mode, change crop, click draw, expect confirmation dialog
});

it("commits the current tool through the imperative handle and emits onChange", async () => {
  // Drive crop or draw change, call ref.current?.commitCurrentTool(), assert onChange
});
```

- [ ] **Step 2: Run the new editor tests to verify they fail**

Run: `npm run test:unit -- tests/unit/components/ui/image-editor.test.tsx`
Expected: FAIL because there is no direct test harness yet and at least one expectation should expose missing testability hooks or current implicit behavior.

- [ ] **Step 3: Add the smallest test-only affordances needed for direct coverage**

Allowed examples:

- add stable `aria-label`s or `data-testid`s on the crop/draw tool buttons or confirmation dialog triggers
- add a small test seam around `canvas.toDataURL` if jsdom requires it

Do **not** change user-visible behavior just to make the test easier.

- [ ] **Step 4: Run the direct editor tests again**

Run: `npm run test:unit -- tests/unit/components/ui/image-editor.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the existing modal consumer test as a guardrail**

Run: `npm run test:unit -- tests/unit/source-document/components/SourceDocumentImageModal.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/unit/components/ui/image-editor.test.tsx \
  tests/unit/source-document/components/SourceDocumentImageModal.test.tsx \
  src/components/ui/image-editor.tsx
git commit -m "test: lock image editor behavior"
```

### Task 2: Extract Pure Editor Types And Core Helpers

**Files:**
- Create: `src/components/ui/image-editor.types.ts`
- Create: `src/components/ui/image-editor.core.ts`
- Modify: `src/components/ui/image-editor.tsx`
- Test: `tests/unit/components/ui/image-editor.test.tsx`

- [ ] **Step 1: Write the failing pure-helper tests in the direct editor test file**

Add tests that depend on new pure helpers you intend to extract, for example:

```ts
import {
  createEditorImage,
  getMimeTypeFromDataUrl,
  selectCurrentToolResult,
} from "@/components/ui/image-editor.core";

it("derives mime type from data url with a jpeg fallback", () => {
  expect(getMimeTypeFromDataUrl("data:image/png;base64,abc")).toBe("image/png");
  expect(getMimeTypeFromDataUrl("not-a-data-url")).toBe("image/jpeg");
});
```

- [ ] **Step 2: Run the editor tests to verify the new imports fail**

Run: `npm run test:unit -- tests/unit/components/ui/image-editor.test.tsx`
Expected: FAIL because `image-editor.core.ts` and `image-editor.types.ts` do not exist yet.

- [ ] **Step 3: Extract local types and pure helpers**

Move these out of `image-editor.tsx`:

```ts
// image-editor.types.ts
export type EditorTool = "crop" | "draw";

export interface EditorImage {
  data: string;
  mimeType: string;
}

export interface ImageEditorHandle {
  hasPendingToolChanges: () => boolean;
  commitCurrentTool: () => { data: string; mimeType: string } | null;
  discardCurrentTool: () => void;
  getConfirmedImage: () => { data: string; mimeType: string };
}
```

```ts
// image-editor.core.ts
export const EXPORT_MIME_TYPE = "image/jpeg";
export const EXPORT_QUALITY = 0.9;

export function getMimeTypeFromDataUrl(dataUrl: string) { ... }
export function createEditorImage(data: string): EditorImage { ... }
export function exportCanvasAsDataUrl(canvas: HTMLCanvasElement) { ... }
```

Only extract pure, editor-specific helpers. Do **not** create a generic image-processing utility layer.

- [ ] **Step 4: Re-run the editor tests**

Run: `npm run test:unit -- tests/unit/components/ui/image-editor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/image-editor.types.ts \
  src/components/ui/image-editor.core.ts \
  src/components/ui/image-editor.tsx \
  tests/unit/components/ui/image-editor.test.tsx
git commit -m "refactor: extract image editor core helpers"
```

### Task 3: Extract The Toolbar Into A Presentational Local Component

**Files:**
- Create: `src/components/ui/image-editor-toolbar.tsx`
- Modify: `src/components/ui/image-editor.tsx`
- Test: `tests/unit/components/ui/image-editor.test.tsx`

- [ ] **Step 1: Write the failing toolbar interaction test**

Add a test that proves the shell still wires toolbar actions correctly, for example:

```tsx
it("shows draw controls only in draw mode and delegates reset/save/cancel actions", async () => {
  // click draw, expect brush size control
  // trigger reset/save/cancel through toolbar buttons
});
```

- [ ] **Step 2: Run the editor tests to verify the new toolbar-focused assertion fails**

Run: `npm run test:unit -- tests/unit/components/ui/image-editor.test.tsx`
Expected: FAIL until the toolbar is extracted with stable wiring.

- [ ] **Step 3: Move the toolbar JSX into `image-editor-toolbar.tsx`**

The extracted component should receive explicit props only:

```tsx
interface ImageEditorToolbarProps {
  activeTool: EditorTool | null;
  brushSize: number;
  hasPendingToolChanges: boolean;
  canSaveCurrentTool: boolean;
  onSelectTool: (tool: EditorTool) => void;
  onBrushSizeChange: (nextSize: number) => void;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
}
```

Keep translations in the shell or pass translated strings down; do not create a new i18n abstraction.

- [ ] **Step 4: Re-run the editor tests**

Run: `npm run test:unit -- tests/unit/components/ui/image-editor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/image-editor-toolbar.tsx \
  src/components/ui/image-editor.tsx \
  tests/unit/components/ui/image-editor.test.tsx
git commit -m "refactor: extract image editor toolbar"
```

### Task 4: Extract The Crop And Draw Panes

**Files:**
- Create: `src/components/ui/image-editor-crop-pane.tsx`
- Create: `src/components/ui/image-editor-draw-pane.tsx`
- Modify: `src/components/ui/image-editor.tsx`
- Modify: `src/components/ui/image-editor.utils.ts`
- Test: `tests/unit/components/ui/image-editor.test.tsx`
- Test: `tests/unit/components/ui/image-editor.utils.test.ts`

- [ ] **Step 1: Write the failing pane tests**

Add tests that lock the shell-to-pane contract:

```tsx
it("initializes a centered crop when the crop pane image loads", async () => {
  // enter crop mode and assert crop image pane is rendered
});

it("marks draw mode as dirty after a completed pointer stroke", async () => {
  // enter draw mode, simulate pointer down/move/up on canvas, expect save enabled
});
```

- [ ] **Step 2: Run the editor tests to verify the pane assertions fail**

Run: `npm run test:unit -- tests/unit/components/ui/image-editor.test.tsx`
Expected: FAIL until the crop and draw panes expose stable, testable behavior.

- [ ] **Step 3: Extract `image-editor-crop-pane.tsx`**

Own only crop rendering and initialization:

```tsx
interface ImageEditorCropPaneProps {
  image: string;
  crop: Crop | undefined;
  onCropChange: (nextCrop: PixelCrop) => void;
  onInitializeCrop: (nextCrop: Crop) => void;
}
```

The shell should still own the actual session state.

- [ ] **Step 4: Extract `image-editor-draw-pane.tsx`**

Own only draw rendering and pointer events:

```tsx
interface ImageEditorDrawPaneProps {
  image: string;
  brushSize: number;
  onInitializeCanvas: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event?: React.PointerEvent<HTMLCanvasElement>) => void;
}
```

Refs remain owned by the shell if that keeps the API simpler. Do not introduce a generalized drawing hook in this step.

- [ ] **Step 5: Update or extend utility tests only if a helper was renamed or newly exported**

Run: `npm run test:unit -- tests/unit/components/ui/image-editor.utils.test.ts`
Expected: PASS

- [ ] **Step 6: Re-run the direct editor tests**

Run: `npm run test:unit -- tests/unit/components/ui/image-editor.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/image-editor-crop-pane.tsx \
  src/components/ui/image-editor-draw-pane.tsx \
  src/components/ui/image-editor.tsx \
  src/components/ui/image-editor.utils.ts \
  tests/unit/components/ui/image-editor.test.tsx \
  tests/unit/components/ui/image-editor.utils.test.ts
git commit -m "refactor: extract image editor panes"
```

### Task 5: Final Verification

**Files:**
- Test: `tests/unit/components/ui/image-editor.test.tsx`
- Test: `tests/unit/components/ui/image-editor.utils.test.ts`
- Test: `tests/unit/source-document/components/SourceDocumentImageModal.test.tsx`

- [ ] **Step 1: Run the focused editor unit suite**

Run: `npm run test:unit -- tests/unit/components/ui/image-editor.test.tsx tests/unit/components/ui/image-editor.utils.test.ts tests/unit/source-document/components/SourceDocumentImageModal.test.tsx`
Expected: PASS

- [ ] **Step 2: Run lint on the touched files**

Run: `npm run lint -- src/components/ui/image-editor.tsx src/components/ui/image-editor.core.ts src/components/ui/image-editor.types.ts src/components/ui/image-editor-toolbar.tsx src/components/ui/image-editor-crop-pane.tsx src/components/ui/image-editor-draw-pane.tsx src/components/ui/image-editor.utils.ts tests/unit/components/ui/image-editor.test.tsx tests/unit/components/ui/image-editor.utils.test.ts tests/unit/source-document/components/SourceDocumentImageModal.test.tsx`
Expected: PASS

- [ ] **Step 3: Run Prettier on the touched files**

Run: `npx prettier --check src/components/ui/image-editor.tsx src/components/ui/image-editor.core.ts src/components/ui/image-editor.types.ts src/components/ui/image-editor-toolbar.tsx src/components/ui/image-editor-crop-pane.tsx src/components/ui/image-editor-draw-pane.tsx src/components/ui/image-editor.utils.ts tests/unit/components/ui/image-editor.test.tsx tests/unit/components/ui/image-editor.utils.test.ts tests/unit/source-document/components/SourceDocumentImageModal.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/image-editor.tsx \
  src/components/ui/image-editor.core.ts \
  src/components/ui/image-editor.types.ts \
  src/components/ui/image-editor-toolbar.tsx \
  src/components/ui/image-editor-crop-pane.tsx \
  src/components/ui/image-editor-draw-pane.tsx \
  src/components/ui/image-editor.utils.ts \
  tests/unit/components/ui/image-editor.test.tsx \
  tests/unit/components/ui/image-editor.utils.test.ts \
  tests/unit/source-document/components/SourceDocumentImageModal.test.tsx
git commit -m "chore: verify image editor refactor"
```

## Notes For The Implementer

- Keep the refactor local. The extracted files should all live next to `image-editor.tsx`.
- Do not move image-editor internals into `src/hooks/` or `src/lib/`.
- If a direct component test requires light DOM polyfills for canvas methods, add them inside the test file instead of changing shared test setup.
- The modal consumer test is the contract guardrail. If it breaks, fix the editor contract rather than weakening the modal test.

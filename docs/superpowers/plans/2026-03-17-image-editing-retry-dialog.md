# 编辑重试中的图片编辑功能实现计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在编辑重试对话框中，使上传的图片缩略图可交互 - 点击查看大图、编辑、删除图片，交互流程类似微信

**架构：** 修改现有的 SourceDocumentInput 组件中的按钮位置，并扩展 ImageEditor 组件添加马赛克/模糊功能

**技术栈：** React, TypeScript, Next.js, react-image-crop, Canvas API

---

## 文件结构

需要修改的文件：

1. `src/features/source-document/components/SourceDocumentInput.tsx` - 交换编辑/删除按钮位置
2. `src/components/ui/image-editor.tsx` - 添加马赛克/模糊功能
3. `src/components/ui/image-editor-dialog.tsx` - 可能需要调整布局
4. `messages/en.json` - 添加新功能的翻译
5. `messages/zh.json` - 添加新功能的翻译

---

## Chunk 1: 按钮位置调整

### Task 1: 交换编辑和删除按钮位置

**文件：**
- 修改: `src/features/source-document/components/SourceDocumentInput.tsx:330-360`

- [ ] **Step 1: 找到按钮位置代码**

在 SourceDocumentInput.tsx 中找到图片缩略图的渲染代码（约第330-360行）：

```tsx
{/* Delete button - always visible on hover */}
<button
  onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
  className="absolute -top-2 -right-2 w-5 h-5 bg-danger text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
>
  ×
</button>

{/* Edit button - only in retry mode */}
{mode === "retry" && (
  <button
    onClick={() => setEditingImageIndex(idx)}
    className="absolute top-1 right-1 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
    title={t("editImage")}
  >
    <Pencil className="h-3 w-3" />
  </button>
)}
```

- [ ] **Step 2: 交换按钮位置**

将删除按钮移到右上角，编辑按钮移到左上角：

```tsx
{/* Edit button - only in retry mode, top-left */}
{mode === "retry" && (
  <button
    onClick={() => setEditingImageIndex(idx)}
    className="absolute -top-2 -left-2 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
    title={t("editImage")}
  >
    <Pencil className="h-3 w-3" />
  </button>
)}

{/* Delete button - top-right */}
<button
  onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
  className="absolute -top-2 -right-2 w-5 h-5 bg-danger text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
>
  ×
</button>
```

- [ ] **Step 3: 验证更改**

运行项目确保没有编译错误：
```bash
npm run build
```

预期：无错误

---

## Chunk 2: 添加马赛克/模糊功能到图片编辑器

### Task 2: 扩展 ImageEditor 组件添加马赛克/模糊功能

**文件：**
- 修改: `src/components/ui/image-editor.tsx`

- [ ] **Step 1: 添加马赛克功能的状态和方法**

在 ImageEditor 组件中添加：

```tsx
// Add new state after existing states (around line 20)
const [brushSize, setBrushSize] = useState(10);
const [isMosaicMode, setIsMosaicMode] = useState(false);

// Add new mosaic function
const applyMosaic = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
  if (!isMosaicMode) return;
  const canvas = canvasRef.current;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const radius = brushSize * scaleX;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Get image data for the region
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Apply mosaic effect
  const blockSize = Math.max(5, Math.floor(brushSize / 2));
  for (let by = 0; by < canvas.height; by += blockSize) {
    for (let bx = 0; bx < canvas.width; bx += blockSize) {
      // Check if this block is within the brush radius
      const centerX = bx + blockSize / 2;
      const centerY = by + blockSize / 2;
      const dist = Math.sqrt((centerX - x) ** 2 + (centerY - y) ** 2);
      
      if (dist <= radius) {
        // Calculate average color for this block
        let r = 0, g = 0, b = 0, count = 0;
        for (let py = by; py < Math.min(by + blockSize, canvas.height); py++) {
          for (let px = bx; px < Math.min(bx + blockSize, canvas.width); px++) {
            const idx = (py * canvas.width + px) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        
        // Apply average color to entire block
        for (let py = by; py < Math.min(by + blockSize, canvas.height); py++) {
          for (let px = bx; px < Math.min(bx + blockSize, canvas.width); px++) {
            const idx = (py * canvas.width + px) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
          }
        }
      }
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  // Export the mosaic image
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  onChange({ data: dataUrl, mimeType: "image/jpeg" });
}, [isMosaicMode, brushSize, onChange]);
```

- [ ] **Step 2: 添加新的 Tab 选项**

在 tabs 中添加马赛克选项（约第130行）：

```tsx
<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "crop" | "draw" | "mosaic")}>
  <TabsList>
    <TabsTrigger value="crop" className="flex items-center gap-2">
      <CropIcon className="h-4 w-4" />
      {t("crop")}
    </TabsTrigger>
    <TabsTrigger value="draw" className="flex items-center gap-2">
      <Pencil className="h-4 w-4" />
      {t("draw")}
    </TabsTrigger>
    <TabsTrigger value="mosaic" className="flex items-center gap-2">
      <BlurIcon className="h-4 w-4" />
      {t("mosaic")}
    </TabsTrigger>
  </TabsList>
</Tabs>
```

需要添加 BlurIcon 导入和翻译。

- [ ] **Step 3: 添加马赛克模式的画布处理**

修改画布的鼠标事件处理（约第200行）：

```tsx
<canvas
  ref={canvasRef}
  onMouseDown={(e) => {
    if (activeTab === "mosaic") {
      setIsMosaicMode(true);
      applyMosaic(e);
    } else {
      startDrawing(e);
    }
  }}
  onMouseMove={(e) => {
    if (isMosaicMode && activeTab === "mosaic") {
      applyMosaic(e);
    } else {
      draw(e);
    }
  }}
  onMouseUp={() => {
    setIsMosaicMode(false);
    if (activeTab === "mosaic") {
      const canvas = canvasRef.current;
      if (canvas) {
        const data = canvas.toDataURL("image/jpeg", 0.9);
        onChange({ data, mimeType: "image/jpeg" });
      }
    } else {
      stopDrawing();
    }
  }}
  onMouseLeave={() => {
    setIsMosaicMode(false);
    if (activeTab === "mosaic") {
      const canvas = canvasRef.current;
      if (canvas) {
        const data = canvas.toDataURL("image/jpeg", 0.9);
        onChange({ data, mimeType: "image/jpeg" });
      }
    } else {
      stopDrawing();
    }
  }}
  className={cn(
    "max-w-full max-h-[calc(90vh-200px)] object-contain border shadow-sm",
    (activeTab === "draw" || activeTab === "mosaic") && "cursor-crosshair"
  )}
/>
```

- [ ] **Step 4: 添加马赛克模式的工具栏设置**

在工具栏中添加马赛克模式的画笔大小设置（约第165行）：

```tsx
{activeTab === "mosaic" && (
  <div className="flex items-center gap-4">
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{t("brushSize")}:</span>
      <input
        type="range"
        min="10"
        max="100"
        value={brushSize}
        onChange={(e) => setBrushSize(Number(e.target.value))}
        className="w-24"
      />
      <span className="text-sm w-6">{brushSize}</span>
    </div>
    <Button variant="outline" size="sm" onClick={resetCanvas}>
      <RotateCcw className="h-4 w-4 mr-1" />
      {t("reset")}
    </Button>
  </div>
)}
```

- [ ] **Step 5: 添加 BlurIcon 导入**

在文件顶部添加：

```tsx
import { Crop as CropIcon, Pencil, RotateCcw, Check, BlurIcon } from "lucide-react";
```

注意：Lucide React 中可能没有 BlurIcon，需要使用类似的图标如 `Palette` 或 `Sparkles` 或 `Wand2` 等。推荐使用 `Sparkles` 或 `Wand2` 来表示模糊/马赛克效果。

- [ ] **Step 6: 运行测试验证**

```bash
npm run build
```

预期：无错误

---

## Chunk 3: 添加翻译

### Task 3: 添加新功能的翻译

**文件：**
- 修改: `messages/en.json`
- 修改: `messages/zh.json`

- [ ] **Step 1: 添加英文翻译**

在 en.json 中添加：

```json
"ImageEditor": {
  "title": "Edit Image",
  "crop": "Crop",
  "draw": "Draw",
  "mosaic": "Mosaic",
  "brushSize": "Brush Size",
  "reset": "Reset",
  "applyCrop": "Apply",
  "cropHint": "Drag to select crop area, then click Apply",
  "drawHint": "Draw on the image to mask areas",
  "mosaicHint": "Click and drag to apply mosaic effect",
  "cancel": "Cancel",
  "save": "Save"
}
```

- [ ] **Step 2: 添加中文翻译**

在 zh.json 中添加：

```json
"ImageEditor": {
  "title": "编辑图片",
  "crop": "裁剪",
  "draw": "涂鸦",
  "mosaic": "马赛克",
  "brushSize": "画笔大小",
  "reset": "重置",
  "applyCrop": "应用",
  "cropHint": "拖动选择裁剪区域，然后点击应用",
  "drawHint": "在图片上涂抹来遮盖区域",
  "mosaicHint": "点击并拖动来应用马赛克效果",
  "cancel": "取消",
  "save": "保存"
}
```

- [ ] **Step 3: 验证翻译加载**

运行项目确保翻译正常加载：

```bash
npm run build
```

预期：无错误

---

## Chunk 4: 测试验证

### Task 4: 功能测试

- [ ] **Step 1: 测试按钮位置**

1. 打开编辑重试对话框
2. 上传或查看已有图片
3. 悬停在缩略图上
4. 验证编辑按钮在左上角，删除按钮在右上角

- [ ] **Step 2: 测试图片查看器**

1. 点击缩略图
2. 验证 ImageViewer 正常打开
3. 测试缩放、旋转、切换图片功能

- [ ] **Step 3: 测试图片编辑器**

1. 点击编辑按钮
2. 验证 ImageEditorDialog 打开
3. 测试裁剪功能
4. 测试涂鸦功能
5. 测试马赛克功能（新）
6. 测试保存后图片更新

- [ ] **Step 4: 测试删除功能**

1. 点击删除按钮
2. 验证图片从列表中移除

---

## 完成检查

- [ ] 所有任务完成
- [ ] `npm run build` 通过
- [ ] 功能测试通过

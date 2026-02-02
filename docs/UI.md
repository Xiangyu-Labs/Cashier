# Minimal UI Design System

## 1. 设计目标（Design Goals）

这是一套为工具型产品与 AI 应用设计的极简 UI 设计系统，目标是：
- **内容优先**：界面为信息服务，而不是装饰
- **低认知负担**：用户无需学习即可使用
- **高一致性**：不同页面、不同项目保持相同气质，用户一眼识别品牌
- **AI 友好**：规则清晰，便于 AI 按约束生成一致 UI
- **长期维护**：避免复杂主题系统与视觉债务

### 核心识别度 (Brand Identity)
用户通过以下特征识别我们的产品：
1. **触感**：极度克制的动画 (2px 位移) 与扎实的物理反馈 (Scale 0.99)。
2. **通透**：大面积留白与高亮的边框，而非阴影堆叠。
3. **精准**：极简的文字与严格对齐的排版。


### 适用场景
- AI 工具 / SaaS
- 管理后台
- 长时间使用的工作型应用

---

## 2. 核心设计原则（Design Principles）

仅遵循以下 **4 条原则**，其余设计决策都应由它们推导：

### 1. 背景层级 ≤ 2
- 主背景（`bg`）
- 内容/卡片背景（`surface` / `surface2`）

### 2. 只使用一个品牌色
- 品牌色仅用于"主操作"和"焦点反馈"
- 其他颜色只用于语义（错误/警告/信息）

### 3. 边框优先于阴影
- 阴影只用于浮层（Dialog / Popover）或强调操作
- 普通卡片不依赖阴影区分层级

### 4. 克制动效
- 仅使用淡入、位移 ≤ 2px、缩放 0.99
- 严禁状态切换时的"瞬间跳变"（Snapping）
- 不使用复杂路径动画或连续动画

---

## 3. 设计 Token（Design Tokens）

### 3.1 核心变量 (Core Tokens)
**(必须严格执行 12 个不可变基石)**

以下 **12 个变量** 定义了产品的物理属性，其余所有样式必须由它们派生：

```css
:root {
  --primary: #10a37f;

  --bg: #ffffff;
  --surface: #ffffff;
  --surface2: #f7f7f8;

  --text: #343541;
  --muted: #8e8ea0;

  --border: #e5e5e5;
  --ring: #10a37f;

  --danger: #ef4444;
  --warning: #f59e0b;
  --info: #3b82f6;

  --radius: 8px;
}

/* 3.2 派生变量 (System Tokens) - 自动计算或通过规则定义 */
:root {
  /* Alpha Variants (禁止在组件中手写 hex 透明度) */
  --primary-a10: color-mix(in srgb, var(--primary), transparent 90%);
  --primary-a20: color-mix(in srgb, var(--primary), transparent 80%);
  --danger-a10:  color-mix(in srgb, var(--danger), transparent 90%);
  --warning-a10: color-mix(in srgb, var(--warning), transparent 90%);
  --info-a10:    color-mix(in srgb, var(--info), transparent 90%);
  
  /* Focus Ring 统一规范 */
  --ring-width: 3px;
  --ring-offset: 2px;
  
  /* Syntax Highlight (映射语义) */
  --code-keyword: var(--primary);
  --code-string: var(--info);
  --code-function: var(--warning);
}

.dark {
  --bg: #343541;
  --surface: #444654;
  --surface2: #202123;

  --text: #ececf1;
  --muted: #8e8ea0;

  --border: #565869;
}
```

### 3.2 使用规则
- ✅ 所有颜色 **必须** 来自变量（包括透明度，使用 `-a10`/`-a20` 变体）
- ❌ 不允许在组件中直接写具体颜色值（如 `#ef444420`）
- ✅ 深色模式只通过变量切换，不重写组件样式

### 3.3 圆角系统（Radius Scale）

基于基础 `--radius` 派生多级圆角：

```css
--radius: 8px;           /* 基准值 */
--radius-sm: calc(var(--radius) - 4px);  /* 4px */
--radius-md: calc(var(--radius) - 2px);  /* 6px */
--radius-lg: var(--radius);               /* 8px */
--radius-xl: calc(var(--radius) + 4px);  /* 12px */
```

**使用原则**：
- 小元素（Tag/Badge）使用 `sm`
- 输入框/按钮使用 `md`
- 卡片/弹窗使用 `lg` / `xl`

**Radius Trap (圆角陷阱)**：
嵌套容器必须遵循公式：`Inner Radius = Outer Radius - Padding`。
如果计算结果 < 0，则内部应为直角 (0px)。
- ✅ Card (Radius 12px) padding 12px -> 内部内容直角 (0px)
- ❌ Card (Radius 12px) padding 0px -> 内部内容圆角应为 12px

### 3.4 间距系统（Spacing Scale）

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
```

**使用原则**：
- 组件内部间距用 `sm` / `md`
- 组件之间间距用 `lg` / `xl`

### 3.5 Z-index 层级

```css
--z-base: 0;
--z-dropdown: 1000;
--z-modal: 2000;
--z-toast: 3000;
```

### 3.6 Shadcn UI 集成（可选）

如使用 Shadcn UI，需建立 Token 映射关系：

```css
/* 语义映射 */
--background: var(--bg);
--foreground: var(--text);
--card: var(--surface);
--card-foreground: var(--text);
--popover: var(--surface);
--popover-foreground: var(--text);
--primary-foreground: #ffffff;
--secondary: var(--surface2);
--secondary-foreground: var(--text);
--muted-foreground: #8e8ea0;
--accent: var(--surface2);
--accent-foreground: var(--text);
--destructive: var(--danger);
--destructive-foreground: #ffffff;
--input: var(--surface);
```

**原则**：
- Shadcn 变量 **必须** 映射到核心 Token
- 不允许在映射中引入新的具体颜色值

---

## 4. 排版规范（Typography）

### 4.1 字体

```css
font-family: Inter, system-ui, sans-serif;
```

### 4.2 字号层级（最小化层级）

| 用途 | 字号 |
|------|------|
| 正文 | 14px |
| 标题（H2/H3） | 20px |
| 主标题（H1） | 24px |
| 辅助文字 | 12px |

### 4.2 标题体系 (Title Hierarchy)

**严格区分“产品 UI 标题”与“内容标题”：**

1.  **产品 UI 标题** (导航、各种 Tab、功能入口)：
    - **H3 (Section)**: 14px / bold (如卡片标题)
    - **H2 (Page)**: 20px / bold (如页面主标题)
    - **H1 (Feature)**: 24px / bold (仅用于极少数 Feature 首页)

2.  **内容标题** (Markdown 渲染区、文章正文)：
    - 为了阅读体验（类似 ChatGPT），内容区的标题应更克制：
    - **Prose H3**: 16px / bold
    - **Prose H1/H2**: 24px / 20px / bold

**原则**：UI 是容器，应该“消隐”；内容是主角，应该“清晰”。不要让 UI 标题抢了内容的戏。

### 4.3 移动端约束

```css
input,
textarea,
select {
  font-size: 16px; /* 防止 iOS 自动缩放 */
}
```

---

## 5. 组件规范（Component Rules）

### 5.1 Button

定义 **六种** 按钮变体：

| 变体 | 样式 | 使用场景 |
|------|------|----------|
| **default** | `bg-primary text-white` | 主要操作（提交、确认） |
| **secondary** | `bg-surface2 border` | 次要操作（取消、返回） |
| **ghost** | 透明背景，hover 显示 `surface2` | 工具栏、紧凑区域 |
| **outline** | 透明背景 + 边框 | 替代 secondary |
| **destructive** | `bg-danger text-white` | 危险操作（删除、清空） |
| **link** | 文字样式 + 下划线 | 内联链接操作 |

#### 尺寸系统

| 尺寸 | 高度 | 使用场景 |
|------|------|----------|
| **sm** | 32px (h-8) | 紧凑型表单 |
| **default** | 36px (h-9) | 标准按钮 |
| **lg** | 40px (h-10) | 强调操作 |
| **icon** | 36px × 36px | 图标按钮 |
| **icon-sm** | 32px × 32px | 小图标按钮 |
| **icon-lg** | 40px × 40px | 大图标按钮 |

#### 交互规范
- **hover**：亮度/透明度轻微变化（`hover:bg-primary/90`）
- **active**：`transform: scale(0.99)`
- **active**：`transform: scale(0.99)`
- **focus**：`outline: var(--ring-width) solid var(--ring); opacity: 0.5` (统一使用 token)
- **focus-visible**: `outline-offset: var(--ring-offset)`
- **disabled**：禁止单纯使用 opacity: 0.5。必须使用特定的灰度背景与低对比度文字，但需保证文字对比度至少 3:1。
  - 推荐：`bg-muted text-muted-foreground opacity-100 cursor-not-allowed`

#### 触控目标（Touch Target）
移动端可交互元素必须满足最小点击区域：
- **高度**：≥ 44px (可通过 padding 实现)
- **宽度**：≥ 44px

---

### 5.2 Input / Textarea

```css
background: var(--surface);
border: 1px solid var(--border);
border-radius: var(--radius);

&:focus {
  outline: none;
  box-shadow: 0 0 0 var(--ring-width) var(--ring); /* 使用统一 Ring Token */
}
```

❌ 不使用内阴影、不使用背景渐变。

---

### 5.3 Card

#### 基础样式
```css
background: var(--surface);
border: 1px solid var(--border);
border-radius: var(--radius-xl);
/* 统一使用 p-6，确保空间感 */
padding: var(--space-lg); /* 24px */
box-shadow: var(--shadow-none); /* 默认无阴影，坚持“边框优先” */
```

**阴影分级 (Shadow Scale)**：
- `--shadow-none`: 0 0 0 transparent (默认)
- `--shadow-subtle`: 0 1px 2px rgba(0,0,0,0.05) (仅用于纯白背景上的细微层次)
- `--shadow-float`: 0 10px 30px rgba(0,0,0,0.1) (仅用于 Hover/Float)
- `--shadow-modal`: 0 20px 50px rgba(0,0,0,0.2) (仅用于 Dialog)

#### 组件结构

标准 Card 由以下子组件组成：

| 子组件 | 说明 |
|--------|------|
| **CardHeader** | 头部容器，包含标题和操作 |
| **CardTitle** | 卡片标题 |
| **CardDescription** | 副标题/描述文字 |
| **CardAction** | 头部右侧操作区（可选） |
| **CardContent** | 主内容区 |
| **CardFooter** | 底部操作区（可选） |

```jsx
<Card>
  <CardHeader>
    <CardTitle>标题</CardTitle>
    <CardDescription>描述</CardDescription>
    <CardAction>操作按钮</CardAction>
  </CardHeader>
  <CardContent>主内容</CardContent>
  <CardFooter>底部操作</CardFooter>
</Card>
```

#### 可交互卡片（可选）
```css
&:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
}
```

---

### 5.4 Dialog / Popover

```css
background: var(--surface);
border: 1px solid var(--border);
box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3); /* 仅此处允许使用阴影 */
border-radius: var(--radius);
```

---

### 5.5 Table（表格）

#### 基础样式

```css
.table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.table th {
  background: var(--surface2);
  font-weight: 600;
  text-align: left;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.table td {
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--border);
  color: var(--text);
}

.table tr:last-child td {
  border-bottom: none;
}

.table tr:hover {
  background: var(--surface2);
}
```

#### 可选：斑马纹

```css
.table-striped tr:nth-child(even) {
  background: var(--surface2);
}
```

#### 空状态

```css
.table-empty {
  text-align: center;
  padding: var(--space-xl);
  color: var(--muted);
}
```

---

### 5.6 Badge / Tag（徽章/标签）

用于状态指示、分类标签等场景。

#### 基础样式

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  line-height: 1.4;
}
```

#### 语义变体

| 变体 | 背景 | 文字颜色 | 使用场景 |
|------|------|----------|----------|
| **default** | `var(--surface2)` | `var(--text)` | 中性信息 |
| **success** | `var(--primary-a20)` | `var(--primary)` | 成功/已完成 |
| **warning** | `var(--warning-a20)` | `var(--warning)` | 警告/待处理 |
| **error** | `var(--danger-a20)` | `var(--danger)` | 错误/失败 |
| **info** | `var(--info-a20)` | `var(--info)` | 提示/说明 |

**原则**：
- 背景使用语义色的 `20%` 透明度
- 文字使用对应的语义色变量
- 不使用深色背景（避免视觉干扰）

#### 尺寸

| 尺寸 | Padding | 字号 |
|------|---------|------|
| **sm** | 1px 6px | 10px |
| **default** | 2px 8px | 12px |
| **lg** | 4px 12px | 14px |

---

### 5.7 Toast / Notification（通知）

用于操作反馈、系统消息等临时提示。

#### 基础样式

```css
.toast {
  position: fixed;
  bottom: var(--space-lg);
  right: var(--space-lg);
  
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  
  padding: var(--space-md);
  min-width: 280px;
  max-width: 400px;
  
  z-index: var(--z-toast);
}
```

#### 语义变体（左侧边框指示）

```css
.toast-success { border-left: 3px solid var(--primary); }
.toast-warning { border-left: 3px solid var(--warning); }
.toast-error { border-left: 3px solid var(--danger); }
.toast-info { border-left: 3px solid var(--info); }
```

#### 行为规范

| 属性 | 值 | 说明 |
|------|------|------|
| **位置** | 右下角 | 避免遮挡主内容 |
| **持续时间** | 3~5 秒 | 错误消息可延长 |
| **动效** | 淡入 + 上移 | 入场动画 |
| **关闭** | 自动 / 手动 | 提供关闭按钮 |
| **堆叠** | 垂直向上 | 新消息在下方 |

---

### 5.8 Sidebar List Item（侧边栏列表项）

用于导航列表、请求列表等场景。

#### 基础样式

```css
.sidebar-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius);
  cursor: pointer;
  
  transition: background 0.15s ease;
}

.sidebar-item:hover {
  background: var(--surface2);
}
```

#### 选中态（三选一）

**方案 A：背景色**
```css
.sidebar-item.active {
  background: var(--surface2);
}
```

**方案 B：左侧指示条**
```css
.sidebar-item.active {
  background: var(--surface2);
  border-left: 3px solid var(--primary);
  padding-left: calc(var(--space-md) - 3px);
}
```

**方案 C：品牌色背景（慎用）**
```css
.sidebar-item.active {
  background: var(--primary);
  color: white;
}
```

**推荐使用方案 B**，视觉清晰且不干扰内容阅读。

#### 内容结构

```jsx
<div class="sidebar-item">
  <div class="sidebar-item-title">请求标题</div>
  <div class="sidebar-item-meta">
    <span class="sidebar-item-time">2 分钟前</span>
    <Badge variant="success">已完成</Badge>
  </div>
</div>
```

```css
.sidebar-item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-item-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 12px;
  color: var(--muted);
}
```

---

### 5.9 Code Block（代码块）

作为代码展示的核心组件，需要特别定义。

#### 字体

```css
--font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
```

#### 基础样式

```css
.code-block {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  
  padding: var(--space-md);
  overflow-x: auto;
}
```

#### 行号

```css
.code-line-number {
  display: inline-block;
  width: 3em;
  padding-right: var(--space-md);
  text-align: right;
  color: var(--muted);
  user-select: none;
}
```

#### 语法高亮主题

推荐使用与设计系统一致的配色，避免使用过于鲜艳的第三方主题：

```css
/* 浅色模式 */
```css
/* 浅色模式 */
.code-keyword { color: var(--code-keyword); }
.code-string { color: var(--code-string); }
.code-function { color: var(--code-function); }

/* 深色模式：直接复用语义变量，无需重新做色值 */
```
```

#### 头部操作栏

```css
.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  padding: var(--space-sm) var(--space-md);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.code-language {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
}

.code-copy-btn {
  /* 使用 ghost button 样式 */
}
```

#### 内联代码

```css
code:not(.code-block code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--surface2);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
```

---

### 5.10 Tooltip（工具提示）

用于图标按钮、缩略文字的辅助说明。

#### 基础样式

```css
.tooltip {
  position: absolute;
  
  background: var(--text);
  color: var(--bg);
  
  font-size: 12px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  
  white-space: nowrap;
  z-index: var(--z-dropdown);
  
  /* 淡入动效 */
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tooltip.visible {
  opacity: 1;
}
```

#### 行为规范

| 属性 | 值 |
|------|------|
| **触发** | hover + focus |
| **延迟** | 显示 300ms，隐藏 0ms |
| **位置** | 上方居中（默认），自动翻转 |
| **箭头** | 可选，6px 三角形 |

---

### 5.11 Dropdown Menu（下拉菜单）

#### 基础样式

```css
.dropdown {
  position: absolute;
  
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  
  min-width: 160px;
  padding: var(--space-xs) 0;
  
  z-index: var(--z-dropdown);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  
  padding: var(--space-sm) var(--space-md);
  font-size: 14px;
  color: var(--text);
  cursor: pointer;
}

.dropdown-item:hover {
  background: var(--surface2);
}

.dropdown-item-icon {
  width: 16px;
  height: 16px;
  color: var(--muted);
}

.dropdown-divider {
  height: 1px;
  background: var(--border);
  margin: var(--space-xs) 0;
}
```

#### 危险操作项

```css
.dropdown-item-danger {
  color: var(--danger);
}

.dropdown-item-danger:hover {
  background: #ef444410;
}
```

---

### 5.12 Empty State（空状态）

当列表或页面无内容时的展示。

#### 基础样式

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  
  padding: var(--space-xl) var(--space-lg);
  text-align: center;
}

.empty-state-icon {
  width: 48px;
  height: 48px;
  color: var(--muted);
  margin-bottom: var(--space-md);
  opacity: 0.5;
}

.empty-state-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: var(--space-xs);
}

.empty-state-description {
  font-size: 14px;
  color: var(--muted);
  max-width: 300px;
  margin-bottom: var(--space-md);
}
```

#### 结构示例

```jsx
<div class="empty-state">
  <InboxIcon class="empty-state-icon" />
  <div class="empty-state-title">暂无请求</div>
  <div class="empty-state-description">
    提交代码后，分析请求将显示在这里
  </div>
  <Button variant="default">提交代码</Button>
</div>
```

**原则**：
- 使用单色线性图标，不使用彩色插图
- 文案简洁，说明当前状态和下一步操作
- 提供 CTA 按钮（如果有明确的下一步）

---

### 5.13 Markdown 渲染规范

用于展示 AI 返回的 Markdown 内容。

#### 容器样式

```css
.markdown-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text);
}
```

#### 标题

```css
.markdown-content h1 {
  font-size: 24px;
  font-weight: 600;
  margin: var(--space-lg) 0 var(--space-md);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--border);
}

.markdown-content h2 {
  font-size: 20px;
  font-weight: 600;
  margin: var(--space-lg) 0 var(--space-sm);
}

.markdown-content h3 {
  font-size: 16px;
  font-weight: 600;
  margin: var(--space-md) 0 var(--space-sm);
}
```

#### 段落与列表

```css
.markdown-content p {
  margin: var(--space-md) 0;
}

.markdown-content ul,
.markdown-content ol {
  margin: var(--space-md) 0;
  padding-left: var(--space-lg);
}

.markdown-content li {
  margin: var(--space-xs) 0;
}
```

#### 引用块

```css
.markdown-content blockquote {
  margin: var(--space-md) 0;
  padding: var(--space-sm) var(--space-md);
  border-left: 3px solid var(--primary);
  background: var(--surface2);
  color: var(--muted);
}
```

#### 水平线

```css
.markdown-content hr {
  border: none;
  height: 1px;
  background: var(--border);
  margin: var(--space-lg) 0;
}
```

#### 链接

```css
.markdown-content a {
  color: var(--primary);
  text-decoration: none;
}

.markdown-content a:hover {
  text-decoration: underline;
}
```

---

### 5.14 Progress（进度指示）

#### Progress Bar（进度条）

```css
.progress {
  width: 100%;
  height: 6px;
  background: var(--surface2);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--primary);
  border-radius: var(--radius-sm);
  transition: width 0.3s ease;
}
```

#### 不确定进度（Indeterminate）

```css
.progress-indeterminate .progress-bar {
  width: 30%;
  animation: progress-slide 1.5s infinite ease-in-out;
}

@keyframes progress-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
```

#### Stepper（步骤指示器）

```css
.stepper {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.stepper-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.stepper-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.stepper-dot-pending {
  background: var(--surface2);
  color: var(--muted);
  border: 1px solid var(--border);
}

.stepper-dot-active {
  background: var(--primary);
  color: white;
}

.stepper-dot-completed {
  background: var(--primary);
  color: white;
}

.stepper-line {
  flex: 1;
  height: 2px;
  background: var(--border);
}

.stepper-line-completed {
  background: var(--primary);
}

.stepper-label {
  font-size: 12px;
  color: var(--muted);
}

.stepper-label-active {
  color: var(--text);
  font-weight: 500;
}
```


### 5.15 Pull-to-Refresh（下拉刷新）

用于移动端手势触发数据刷新。

#### 基础样式

```tsx
<PullToRefresh onRefresh={handleRefresh}>
  {children}
</PullToRefresh>
```

#### 指示器设计

- **下拉阶段（0-60px）**：圆环指示器从小到大
- **释放刷新（60+px）**：圆环旋转，提示释放
- **刷新中**：持续旋转动画

#### 样式规范

```css
.pull-indicator {
  border: 2px solid var(--primary-a20);
  border-top-color: var(--primary);
  border-radius: 50%;
}
```

#### 行为规范

| 属性 | 值 |
|------|------|
| **触发阈值** | 60px |
| **最大拉动距离** | 80px |
| **动画缓动** | `ease-out` |
| **防抖间隔** | 500ms |
| **桌面端** | 自动禁用 |

---

## 6. 状态设计（States）

### 6.1 Loading
- ✅ 使用 **Skeleton Loader**（骨架屏）
- ❌ 不使用旋转菊花作为主要加载状态

### 6.2 Error
- 使用 `var(--danger)`
- 表现为：文字颜色 / 边框颜色
- 不引入复杂图标或动画

---

## 7. 布局规范（Layout）

### 7.1 基本结构
- **Sidebar**：固定 280px
- **主内容区**：
  - 推荐 `max-width: 900~1000px`
  - 内容居中，避免铺满屏幕

### 7.2 响应式断点

```css
/* 只需一个断点，避免过度复杂化 */
mobile: < 768px
desktop: ≥ 768px
### 8.3 可访问性 (Reduced Motion)
必须尊重用户系统设置：

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 7.3 移动端
- **Sidebar** → 抽屉
  - 宽度：`85vw`
  - 最大宽度：`320px`

---

## 8. 动效规范（Motion）

### 8.1 允许的动效
```css
/* 淡入淡出 */
opacity: 0 → 1;

/* 轻微位移 (必须 ≤ 2px) */
transform: translateY(±2px);

/* 微缩放 */
transform: scale(0.99);

/* 布局过渡 (Layout Transitions) */
/* 必须使用 layout 属性避免瞬间位移 */
<motion.div layout transition={{ duration: 0.2 }} />
```

### 8.2 禁止的动效
- ❌ 无限循环动画
- ❌ 复杂路径动画
- ❌ 与业务无关的装饰性动画

### 8.3 缓动函数

```css
/* 推荐使用 */
/* 推荐使用 */
transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

/* 加载状态 (Nothing to Something) */
/* 禁止从“空”直接跳变到“内容”，必须使用 Skeleton */
/* 禁止使用全屏加载菊花 */
```

---

## 9. 图标规范（Icons）

### 9.1 推荐库
- **Lucide React**（轻量级、现代化）

### 9.2 尺寸标准
| 场景 | 尺寸 |
|------|------|
| 默认 | 20px |
| 小图标 | 16px |
| 大图标 | 24px |

### 9.3 颜色
- 继承父元素文字颜色
- 不单独设置图标颜色

---

## 10. 可访问性（Accessibility）

### 10.1 键盘导航
- ✅ 所有可交互元素支持键盘访问
- ✅ `:focus-visible` 必须明显
- ✅ 弹窗支持 `Esc` 关闭

### 10.2 焦点管理

```css
*:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

### 10.3 色彩对比度
- 文字与背景对比度 **≥ WCAG AA (4.5:1)**
  - 特别注意：`muted-foreground` 在某些背景下可能不达标
- 关键操作按钮对比度 **≥ WCAG AAA (7:1)**
- **禁用状态**：文字对比度必须 **≥ 3:1**，不可完全不可见

---

## 11. 使用约定（Usage Contract）

在任何项目中使用本设计系统时：

### ❌ 禁止
- 新增私有颜色
- 新增随意动画
- 绕过 Token 写样式

### ✅ 必须
- 所有 UI 决策必须能回溯到本规范中的某一条
- 使用 Radix UI 作为无障碍基础
- 使用 Tailwind CSS 快速构建样式
- 谨慎使用 Framer Motion（避免过度动画）

---

## 12. 决策指南（Decision Guide）

当你犹豫要不要加一个设计元素时：

```
Q: 这个元素是否帮助用户完成任务？
   └─ 否 → 不加
   └─ 是 → 继续

Q: 是否可以用现有 Token 实现？
   └─ 否 → 重新考虑设计
   └─ 是 → 继续

Q: 是否符合 4 条核心原则？
   └─ 否 → 不加
   └─ 是 → 可以实现
```

**大概率说明你不该加。**

---

## 13. 总结

这套 UI 的目标不是"好看"，而是：
- ✅ 长时间使用不疲劳
- ✅ 多项目保持一致
- ✅ AI 与人都不容易犯错

### 核心价值
| 维度 | 价值 |
|------|------|
| **开发效率** | 12 个变量覆盖 90% 场景 |
| **维护成本** | 规则极简，决策可回溯 |
| **用户体验** | 低认知负担，专注内容 |
| **AI 协作** | 清晰约束，生成一致 |

---

## 附录：快速开始

### Step 1: 复制变量到 `globals.css`

```css
@import "tailwindcss";

@theme {
  /* 复制上述 Token 变量 */
}

:root { /* 浅色模式变量 */ }
.dark { /* 深色模式变量 */ }
```

### Step 2: 安装推荐依赖

```bash
npm install @radix-ui/react-dialog @radix-ui/react-popover
npm install lucide-react
npm install framer-motion
```

### Step 3: 遵循规范开发

参考本文档的组件规范和使用约定，确保所有 UI 决策可回溯。

---

> **设计哲学**：少即是多，约束即自由。

---

## 14. 图片与媒体规范（Images & Media）

### 强制使用 next/image

所有图片必须使用 `next/image` 组件：

```tsx
// ✅ 正确
import Image from 'next/image';

<Image
  src="/hero.jpg"
  alt="产品展示图"  // 必须提供有意义的 alt
  width={800}
  height={600}
  priority  // 首屏图片添加 priority
/>

// ❌ 错误
<img src="/hero.jpg" />
```

### 约定

| 规则 | 说明 |
|------|------|
| **组件** | 必须使用 `next/image`，禁止直接 `<img>` |
| **alt 属性** | 必须提供描述性文字，不能为空 |
| **尺寸** | 必须指定 `width` 和 `height`，或使用 `fill` |
| **格式** | 优先 WebP/AVIF，fallback PNG/JPG |
| **占位** | 使用 `placeholder="blur"` + `blurDataURL` |

### 装饰性图片

```tsx
// 装饰性图片可以使用空 alt，但必须标注
<Image
  src="/decoration.svg"
  alt=""  // 装饰性图片
  aria-hidden="true"
/>
```

---

## 15. 响应式行为规范（Responsive Behavior）

### 断点定义（复述）

```css
mobile: < 768px
desktop: ≥ 768px
```

### 复杂组件的移动端行为

| 组件 | 桌面端 | 移动端 |
|------|--------|--------|
| **Table** | 正常表格 | 横向滚动（`overflow-x: auto`） |
| **Modal** | 居中弹窗 | 底部抽屉（Drawer） |
| **Sidebar** | 固定侧边栏 | 抽屉式菜单 |
| **Multi-column** | 多列布局 | 单列堆叠 |

### Table 移动端处理

```css
/* 移动端表格横向滚动 */
@media (max-width: 767px) {
  .table-container {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  .table {
    min-width: 600px;  /* 保持最小宽度 */
  }
}
```

### 15.2 安全区域 (Safe Areas)
必须适配刘海屏与底部 Home Bar：

```css
/* 独立代码块，避免嵌套错误 */
.safe-area-padding {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

- **Sticky Header**: 必须包含 top inset
- **Bottom Fixed**: 必须包含 bottom inset
```

### Modal → Drawer 转换

推荐使用 Shadcn 的 `Drawer` 组件，移动端自动切换：

```tsx
import { useMediaQuery } from '@/hooks/use-media-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';

export function ResponsiveModal({ children, ...props }) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  
  if (isDesktop) {
    return <Dialog {...props}><DialogContent>{children}</DialogContent></Dialog>;
  }
  
  return <Drawer {...props}><DrawerContent>{children}</DrawerContent></Drawer>;
}
```

---

## 16. 表单验证 UI（Form Validation UI）

### 错误状态样式

表单验证错误必须遵循以下规范：

```css
/* 错误状态输入框 */
.input-error {
  border-color: var(--danger);
}

.input-error:focus {
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
}

/* 错误消息 */
.form-error-message {
  font-size: 12px;
  color: var(--danger);
  margin-top: var(--space-xs);
}
```

### React Hook Form + Zod 集成

```tsx
// ✅ 标准表单验证 UI 模式
<FormField
  control={form.control}
  name="email"
  render={({ field, fieldState }) => (
    <FormItem>
      <FormLabel>邮箱</FormLabel>
      <FormControl>
        <Input
          {...field}
          className={fieldState.error ? 'border-danger' : ''}
        />
      </FormControl>
      {fieldState.error && (
        <FormMessage className="text-sm text-danger">
          {fieldState.error.message}
        </FormMessage>
      )}
    </FormItem>
  )}
/>
```

### 约定

| 元素 | 位置 | 样式 |
|------|------|------|
| **错误消息** | 输入框下方 | `text-sm text-danger` |
| **输入框边框** | 错误时变红 | `border-danger` |
| **图标** | 可选，输入框右侧 | 红色警告图标 |
| **时机** | `onBlur` 或 `onSubmit` | 不要 `onChange` 实时报错 |

### 禁止行为

- ❌ 禁止只用 `alert()` 提示验证错误
- ❌ 禁止错误消息显示在页面顶部（远离输入框）
- ❌ 禁止只变边框不显示文字说明

---

## 19. 决策可回溯检查清单 (Decision Traceability)

在提交 PR 前，**必须** 自查以下问题。如果任何一项为 YES，必须在 PR 描述中详细解释“为什么现有系统无法满足”：

1.  **颜色自造**：是否引入了不在 `Core Tokens` 或 `System Tokens` 中的 Hex 颜色值？
2.  **透明度逃逸**：是否在组件中手动写了 `opacity` 或 hex alpha（如 `#00000050`），而不是使用 `-a10` 变量？
3.  **阴影滥用**：是否给非浮层元素加了阴影？
4.  **动画过载**：是否使用了位移 > 2px 的动画？是否无法通过 `prefers-reduced-motion` 关闭？
5.  **标题越级**：是否在产品 UI 区域使用了 H2 甚至 H1，导致视觉抢占了内容？
6.  **圆角非法**：是否出现了嵌套圆角不满足 `Inner = Outer - Padding` 的情况？

> **Golden Rule**: If you can't define it with a token, you probably shouldn't build it.

---

## 17. 内容与开发体验规范 (Content & DX Guidelines)

### 17.1 术语一致性 (Terminology)
| 概念 | 推荐用词 (Eng) | 推荐用词 (中) | 禁止用词 |
|------|----------------|---------------|----------|
| **删除** | **Delete** | 删除 | Remove, Discard |
| **新建/入口** | **New** | 新建 | Create (作为按钮文案) |
| **创建动作** | **Create** | 创建 | New (作为动词) |
| **编辑** | **Edit** | 编辑 | Modify, Change |
| **设置** | **Settings** | 设置 | Config, Preference |

*(注：具体业务术语应在各项目的 `DOMAIN.md` 中单独定义，但必须遵循上述动词规范)*

### 17.2 文本标准 (Text Standards)
- **省略号**：必须使用排版字符 `…` (&hellip;)，禁止使用三个点 `...`。
- **中西文间距**：汉字与英文/数字之间必须加空格。
  - ✅ `总支出 ({count} 笔)`
  - ❌ `总支出({count}笔)`
- **技术术语**：禁止向用户暴露内部术语。
  - ❌ "Anomaly code: E_INVALID_FILE"
  - ✅ "文件无法识别"

### 17.3 错误处理 (Error Handling)
- **禁止裸露后端错误**：UI 绝不可显示 `ETIMEDOUT`, `Duplicate key`, `Unknown column` 等原始错误。
- **人话报错**：所有错误必须经过前端映射，转化为用户可读的建议。
  - ❌ `Error: 500 Internal Server Error`
  - ✅ `保存失败，请检查网络连接或稍后重试`

---

## 18. 国际化与本地化规范 (i18n & Localization)

### 18.1 硬编码零容忍
- ❌ **严禁**在组件、Server Action、Email 模板中硬编码任何自然语言字符串。
- ✅ 所有用户可见文本必须提取到 `messages/{locale}.json`。
- ✅ 即使是 AI Prompt，如果涉及用户可见的输出，也应考虑本地化或统一为英语。

### 18.2 动态插值 (Dynamic Values)
禁止手动拼接字符串，必须使用 ICU插值：

- ❌ `t("total") + ": " + amount + " " + currency`
- ✅ `t("total", { amount, currency })` -> `"Total: $100"`

**货币格式化**：
使用统一的 Key 或 `Intl.NumberFormat`：
- `"currency_format": "{currency} {amount}"`

### 18.3 日期与时间
禁止硬编码日期格式：
- ❌ `format(date, "yyyy年MM月dd日")`
- ✅ 使用 `next-intl` 的 `useFormatter` 或 `date-fns` 的 locale 模块。
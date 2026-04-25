# PWA 安装指引设计文档

## 背景

Cashier 项目已具备完整的 PWA 基础架构：`@ducanh2912/next-pwa` 生成 Service Worker、`manifest.ts` 配置应用清单、图标和 meta 标签均已就绪。当前缺失的是**引导用户将 PWA 安装到桌面/主屏幕的 UI 交互**。

## 目标

在用户浏览器支持 PWA 安装时，提供清晰、非侵入式的安装引导：
1. 首次访问时通过底部横幅提示安装
2. 设置页面提供持久的安装入口
3. 已安装用户和 iOS Safari 用户获得合理的降级体验

## 方案概述

采用**纯客户端方案**。原因：
- 符合项目"最小基础设施"原则，无后端改动
- PWA 安装是设备级行为，localStorage 持久化足够
- 实现干净、即装即用

## 架构

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/hooks/use-pwa-install.ts` | 监听 `beforeinstallprompt` / `appinstalled`，管理安装资格、平台检测，暴露 `promptInstall()` |
| `src/components/pwa-install-banner.tsx` | 底部横幅，条件渲染：已安装/已关闭/不支持时隐藏 |
| `src/components/pwa-install-button.tsx` | 设置页安装按钮，iOS 下变为文字指引 |
| `src/lib/pwa-utils.ts` | 纯工具函数：`isStandalone()`、`isIOS()` |

### 组件层级

- `PWAInstallBanner` 挂载在 `RootLayout`（或布局壳层）中，全局可见
- `PWAInstallButton` 由设置页自行引入

## 数据流

### 标准浏览器（Chrome/Edge/Android）

```
beforeinstallprompt 事件触发
    → 调用 event.preventDefault()（阻止浏览器自动弹横幅）
    → 保存事件到 ref
    → PWAInstallBanner 检测到 isInstallable = true，展示横幅
        → 用户点击"安装"
            → 调用 savedPrompt.prompt()
                → 用户确认安装
                    → appinstalled 事件触发 → 隐藏横幅、清理状态
                → 用户取消
                    → 静默处理，横幅保持可见
        → 用户点击"关闭"
            → localStorage 记录关闭时间
            → 横幅隐藏（7 天内不再弹出）
```

### iOS Safari

iOS 没有 `beforeinstallprompt` 事件，因此：
- `isInstallable` 在 iOS 上通过 `isIOS() && !isStandalone()` 判定
- `PWAInstallBanner` 在 iOS 上显示简化的文字指引："在 Safari 中点击分享按钮，然后选择'添加到主屏幕'"
- `PWAInstallButton` 在 iOS 上同样显示文字指引而非按钮

### 已安装检测

页面加载时通过 `window.matchMedia('(display-mode: standalone)')` 检测。若已处于 standalone 模式，所有安装 UI 完全不渲染。

## 组件设计

### PWAInstallBanner

- **位置**：固定在页面底部（`fixed bottom-0`）
- **出现条件**：`!isStandalone && isInstallable && !bannerDismissed`
  - `bannerDismissed` 由组件自行从 localStorage 读取，不在 Hook 中管理
- **关闭行为**：点击关闭按钮 → `localStorage.setItem('cashier:pwa-dismissed', Date.now().toString())`
- **重显规则**：7 天（604800000 ms）后允许重新显示
- **iOS 内容**：显示文字安装指引，无"安装"按钮
- **非 iOS 内容**：显示应用图标 + "安装 Cashier 以获得更好体验" + "安装"按钮 + 关闭按钮

### PWAInstallButton

- **出现条件**：`!isStandalone && isInstallable`
- **标准浏览器**：渲染为可点击按钮，点击调用 `promptInstall()`
- **iOS Safari**：渲染为不可点击的文字指引区块
- **已安装/不支持**：不渲染

## Hook 设计（usePwaInstall）

返回对象：

```typescript
{
  isInstallable: boolean;      // 是否满足显示安装指引的条件（有 prompt 事件，或是未安装的 iOS）
  isStandalone: boolean;       // 是否已处于 PWA 模式
  isIOS: boolean;              // 是否是 iOS 设备
  promptInstall: () => void;   // 触发安装（标准浏览器）
  isPrompting: boolean;        // 安装弹窗是否正在显示
}
```

内部状态：
- `deferredPrompt: BeforeInstallPromptEvent | null` — 保存的 beforeinstallprompt 事件
- `isStandalone` — 通过 matchMedia 检测
- `isIOS` — 通过 user agent 检测

## 错误处理

| 场景 | 行为 |
|------|------|
| `prompt()` 被拒绝（用户取消） | 静默返回，横幅保持可见 |
| `prompt()` 已被调用过（重复调用报错） | Hook 内部用 `isPrompting` 状态锁防止重复 |
| 不支持 PWA 的浏览器 | `isInstallable = false`，所有 UI 不渲染 |
| localStorage 不可用 | 降级为不持久化，每次刷新横幅可能复现 |

## 测试策略

### Hook 单元测试

文件：`tests/unit/hooks/use-pwa-install.test.ts`

- Mock `window.addEventListener('beforeinstallprompt')`，验证 prompt 事件被保存
- Mock `window.matchMedia('(display-mode: standalone)')`，验证已安装状态检测
- Mock navigator.userAgent 切换 iOS/Android/桌面，验证平台检测
- 验证 `promptInstall()` 调用保存的事件对象

### 组件渲染测试

- `PWAInstallBanner`：提供不同 hook 返回值，验证：
  - `isInstallable=true` 时横幅渲染
  - `isStandalone=true` 时不渲染
  - `bannerDismissed=true` 时不渲染
  - iOS 时显示文字指引
- `PWAInstallButton`：验证 iOS 下显示文字指引，标准浏览器显示按钮

## 边界条件

- **横幅关闭后 7 天内刷新页面**：不显示横幅
- **用户安装后重新打开已安装的 PWA**：不显示任何安装 UI
- **横幅显示期间用户直接通过浏览器菜单安装**：`appinstalled` 事件触发后横幅自动消失
- **无痕模式/隐私浏览**：localStorage 可能不可用，降级为每次刷新都显示横幅（可接受）
